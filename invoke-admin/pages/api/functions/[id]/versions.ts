import { QueryTypes } from 'sequelize'
import { NextApiRequest, NextApiResponse } from 'next'
import { authenticate, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import multer from 'multer'
import fs from 'fs-extra'
import crypto from 'crypto'
import path from 'path'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')
const { s3Service } = require('invoke-shared')

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/zip', 'application/x-gzip', 'application/gzip']
    const allowedExtensions = ['.zip', '.tar.gz', '.tgz']
    
    const hasValidType = allowedTypes.includes(file.mimetype)
    const hasValidExtension = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext))
    
    if (hasValidType || hasValidExtension) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only .zip, .tar.gz, and .tgz files are allowed.'))
    }
  }
})

// Disable default body parsing for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method || '')) {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    // Authenticate user using our middleware
    const authResult = await authenticate(req)
    if (!authResult.success) {
      return res.status(401).json(createResponse(false, null, authResult.error || 'Authentication failed', 401))
    }

    const userId = authResult.user!.id
    const { id: functionId } = req.query

    // Check project access for non-admins (required for all operations)
    if (!authResult.user?.isAdmin) {
      const { FunctionModel } = database.models;
      const fnAccess = await FunctionModel.findByPk(functionId, { attributes: ['project_id'] });
      if (!fnAccess) {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }
      const projectId = fnAccess.project_id;
      if (projectId) {
        const access = await checkProjectDeveloperAccess(userId, projectId, false)
        if (!access.allowed) {
          return res.status(403).json(createResponse(false, null, access.message || 'Insufficient permissions', 403))
        }
      }
    }

    if (req.method === 'GET') {
      // List all versions for a function
      const versions = await database.sequelize.query(`
        SELECT 
          fv.id,
          fv.version,
          fv.file_size,
          fv.package_hash,
          (f.active_version_id = fv.id) as is_active,
          fv.created_at,
          fv.created_by,
          u.username as created_by_name
        FROM function_versions fv
        LEFT JOIN users u ON fv.created_by = u.id
        LEFT JOIN functions f ON fv.function_id = f.id
        WHERE fv.function_id = $1
        ORDER BY fv.created_at DESC
      `, { bind: [functionId], type: QueryTypes.SELECT });

      return res.status(200).json(createResponse(true, versions, 'Versions retrieved successfully'))

    } else if (req.method === 'DELETE') {
      // Handle version deletion (only inactive versions)
      const { version } = req.query
      
      if (!version) {
        return res.status(400).json(createResponse(false, null, 'Version number is required', 400))
      }

      // Check if function exists and get active version
      const { FunctionModel, FunctionVersion } = database.models;
      const functionData = await FunctionModel.findByPk(functionId, {
        attributes: ['id', 'name', 'active_version_id']
      });

      if (!functionData) {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }

      // Get the version to delete
      const versionStr = Array.isArray(version) ? version[0] : version
      const versionRecord = await FunctionVersion.findOne({
        where: { function_id: functionId, version: parseInt(versionStr) },
        attributes: ['id', 'version']
      });

        if (!versionRecord) {
          return res.status(404).json(createResponse(false, null, `Version ${version} not found`, 404))
        }

        const versionData = versionRecord.get({ plain: true });

        // Check if this version is currently active
        if (functionData.active_version_id === versionData.id) {
          return res.status(400).json(createResponse(false, null, 'Cannot delete the active version. Switch to a different version first.', 400))
        }

        // Delete the version record
        await versionRecord.destroy();

        // Delete the package from S3
        try {
          await s3Service.deletePackage(functionId, version)
          console.log(`✓ Deleted S3 package for function ${functionId} version ${version}`)
        } catch (s3Error) {
          console.error('Error deleting package from S3:', s3Error)
          // Continue even if S3 deletion fails
        }

        return res.status(200).json(createResponse(true, null, `Version ${version} deleted successfully`))

    } else if (req.method === 'POST') {
      // Handle file upload for new version
      let uploadedFile: any = null
      let packagePath: string | null = null

      try {
        // Use multer to handle file upload
        await new Promise<void>((resolve, reject) => {
          upload.single('file')(req as any, res as any, (err: any) => {
            if (err) {
              reject(err)
            } else {
              uploadedFile = (req as any).file
              resolve()
            }
          })
        })

        if (!uploadedFile) {
          return res.status(400).json(createResponse(false, null, 'No file provided', 400))
        }

        // Check if function exists
        const { FunctionModel: FnModel, FunctionVersion: FnVersion } = database.models;
        const fn = await FnModel.findByPk(functionId, { attributes: ['id', 'name'] });

        if (!fn) {
          return res.status(404).json({
            success: false,
            message: 'Function not found'
          })
        }

        const functionName = fn.name;

        // Calculate file hash
        const fileBuffer = await fs.readFile(uploadedFile.path)
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

        const maxVersion = await FnVersion.max('version', { where: { function_id: functionId } });
        const nextVersion = ((maxVersion as number) || 0) + 1;

        // Prepare package for upload to MinIO - convert .tar.gz to .tgz if needed
        let packagePath = uploadedFile.path
        const originalName = uploadedFile.originalname.toLowerCase()

        // Convert .zip files to .tgz for consistency
        if (originalName.endsWith('.zip')) {
          const extractDir = path.join(path.dirname(packagePath), `extract_${Date.now()}`)
          const tgzPath = path.join(path.dirname(packagePath), `${functionId}_${nextVersion}.tgz`)
          
          try {
            // Extract zip
            const AdmZip = require('adm-zip')
            const zip = new AdmZip(packagePath)
            zip.extractAllTo(extractDir, true)
            
            // Create tgz
            const tar = require('tar')
            await tar.create(
              { gzip: true, file: tgzPath, cwd: extractDir },
              require('fs-extra').readdirSync(extractDir)
            )
            
            // Update package path
            packagePath = tgzPath
            
            // Clean up
            await require('fs-extra').remove(extractDir)
          } catch (error) {
            console.error('Error converting zip to tgz:', error)
            throw new Error('Failed to process ZIP file')
          }
        }
        // Convert .tar.gz to .tgz for consistency
        else if (originalName.endsWith('.tar.gz')) {
          const tgzPath = path.join(path.dirname(packagePath), `${functionId}_${nextVersion}.tgz`)
          
          try {
            // Just rename/copy the file with .tgz extension
            await require('fs-extra').move(packagePath, tgzPath)
            packagePath = tgzPath
          } catch (error) {
            console.error('Error converting tar.gz to tgz:', error)
            throw new Error('Failed to process tar.gz file')
          }
        }

        // Store file in S3 using consistent version-based naming
        await s3Service.uploadPackage(functionId, nextVersion, packagePath)

        // Create new version record (not active by default)
        const newVersion = await FnVersion.create({
          function_id: functionId,
          version: nextVersion,
          package_path: `packages/${functionId}/${nextVersion}.tgz`,
          file_size: require('fs-extra').statSync(packagePath).size,
          package_hash: hash,
          created_by: userId
        });

        // Clean up uploaded file
        await fs.remove(packagePath)

        res.status(201).json(createResponse(true, {
          id: newVersion.id,
          version: newVersion.version,
          functionId: functionId
        }, `Version ${nextVersion} uploaded successfully`))

      } catch (error) {
        console.error('Error creating new version:', error)
        
        // Clean up uploaded file if it exists
        if (packagePath) {
          try {
            await fs.remove(packagePath)
          } catch (cleanupError) {
            console.error('Error cleaning up file:', cleanupError)
          }
        }

        if (error.message && error.message.includes('Invalid file type')) {
          return res.status(400).json({
            success: false,
            message: error.message
          })
        }

        res.status(500).json(createResponse(false, null, 'Internal server error', 500))
      }
    }

  } catch (error) {
    console.error('Error in versions API:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}