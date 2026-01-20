export const runtime = 'nodejs';

import { NextApiRequest, NextApiResponse } from 'next'
import { authenticate, AuthenticatedRequest } from '@/lib/middleware'
import multer from 'multer'
import fs from 'fs-extra'
import path from 'path'
import tar from 'tar'
import archiver from 'archiver'
import { v4 as uuidv4 } from 'uuid'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')
const minioService = require('@/lib/minio')

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/zip', 'application/x-gzip', 'application/gzip']
    const allowedExtensions = ['.zip', '.tar.gz', '.tgz']
    
    const hasValidType = allowedTypes.includes(file.mimetype)
    const hasValidExtension = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext))
    
    if (hasValidType || hasValidExtension) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only .zip and .tar.gz files are allowed.'))
    }
  }
})

// Disable body parser for multer
export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  let uploadedFile: any = null
  let userId: number

  try {
    await database.connect()

    // Authenticate user using our middleware
    const authResult = await authenticate(req)
    if (!authResult.success) {
      return res.status(401).json(createResponse(false, null, authResult.error || 'Authentication failed', 401))
    }

    userId = authResult.user!.id

    // Handle multipart form data
    await new Promise<void>((resolve, reject) => {
      upload.single('function')(req as any, res as any, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })

    uploadedFile = (req as any).file
    if (!uploadedFile) {
      return res.status(400).json(createResponse(false, null, 'No file uploaded', 400))
    }

    // Extract function name and determine if it's an update or new function
    const functionName = (req.body.name || uploadedFile.originalname.replace(/\.(zip|tar\.gz|tgz)$/i, '')).trim()
    const description = (req.body.description || '').trim() || 'Uploaded function package'
    const requiresApiKey = req.body.requiresApiKey === 'true'
    const apiKey = requiresApiKey ? req.body.apiKey : null
    const projectId = req.body.projectId || null
    // Check if function already exists by name - reject duplicates for new uploads
    const existingResult = await database.query(
      'SELECT id, name FROM functions WHERE name = $1',
      [functionName]
    )

    if (existingResult.rows.length > 0) {
      return res.status(409).json(createResponse(false, null, `Function with name "${functionName}" already exists. Use the update function feature to modify existing functions.`, 409))
    }

    // New function only
    const functionId = uuidv4()
    const version = 1  // Integer version instead of semantic version
    const isUpdate = false

    // Prepare package for upload to MinIO
    let packagePath = uploadedFile.path
    const originalName = uploadedFile.originalname.toLowerCase()

    // Convert .zip files to .tgz for consistency
    if (originalName.endsWith('.zip')) {
      const extractDir = path.join(path.dirname(packagePath), `extract_${Date.now()}`)
      const tgzPath = path.join(path.dirname(packagePath), `${functionId}_${version}.tgz`)
      
      try {
        // Extract zip
        const AdmZip = require('adm-zip')
        const zip = new AdmZip(packagePath)
        zip.extractAllTo(extractDir, true)
        
        // Create tar.gz
        await tar.create(
          { gzip: true, file: tgzPath, cwd: extractDir },
          fs.readdirSync(extractDir)
        )
        
        // Update package path
        packagePath = tgzPath
        
        // Clean up
        await fs.remove(extractDir)
      } catch (error) {
        console.error('Error converting zip to tgz:', error)
        throw new Error('Failed to process ZIP file')
      }
    }

    // Upload to MinIO and get hash
    const uploadResult = await minioService.uploadPackage(functionId, version, packagePath)
    console.log(`✅ Package uploaded to MinIO: ${uploadResult.objectName}`)

    // Insert new function (without version-specific columns)
    const functionResult = await database.query(`
      INSERT INTO functions (
        id, name, description, deployed_by, requires_api_key, api_key, is_active, project_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name
    `, [
      functionId, functionName, description, userId, requiresApiKey, apiKey, true, projectId
    ])

    // Create first version record
    const versionResult = await database.query(`
      INSERT INTO function_versions (
        function_id, 
        version, 
        package_path, 
        file_size, 
        package_hash,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, version
    `, [
      functionId,
      version, // Integer version
      uploadResult.objectName, // Use the actual MinIO object path
      uploadResult.size,
      uploadResult.hash,
      userId
    ])
    console.log(`✅ Version record created with ID: ${versionResult.rows[0].id}`)

    // Update function to reference the active version
    console.log(`🔗 Setting active version for function ${functionId}`)
    await database.query(
      'UPDATE functions SET active_version_id = $1 WHERE id = $2',
      [versionResult.rows[0].id, functionId]
    )
    console.log(`✅ Active version set to: ${versionResult.rows[0].id}`)
    
    console.log(`✅ Created new function ${functionName} version ${version}`)

    // Clean up temporary files
    await fs.remove(uploadedFile.path)
    if (packagePath !== uploadedFile.path) {
      await fs.remove(packagePath)
    }

    // Return function details with version info
    const finalResult = await database.query(`
      SELECT 
        f.*,
        fv.version,
        fv.file_size,
        fv.package_hash
      FROM functions f
      LEFT JOIN function_versions fv ON f.active_version_id = fv.id
      WHERE f.id = $1
    `, [functionId])

    return res.status(201).json(createResponse(true, finalResult.rows[0], 
      'Function uploaded successfully', 201))

  } catch (error) {
    console.error('Upload error:', error)
    
    // Clean up uploaded file on error
    if (uploadedFile && uploadedFile.path) {
      try {
        await fs.remove(uploadedFile.path)
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError)
      }
    }

    const errorMessage = error.message || 'Upload failed'
    return res.status(500).json(createResponse(false, null, 'Upload failed: ' + errorMessage, 500))
  }
}