export const runtime = 'nodejs';

import { NextApiRequest, NextApiResponse } from 'next'
import { AuthenticatedRequest, withAuthOrApiKeyAndMethods } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import multer from 'multer'
import os from 'os'
import fs from 'fs-extra'
import path from 'path'
import * as tar from 'tar'
import archiver from 'archiver'
import { v4 as uuidv4 } from 'uuid'
import AdmZip from 'adm-zip'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
const { s3Service } = require('invoke-shared')
import runMiddleware from '@/lib/multer'

// Configure multer for file uploads
const upload = multer({
  dest: path.join(os.tmpdir(), 'uploads'),
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

// Handler logic separated so we can apply middleware wrappers below.
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  let uploadedFile: any = null

  try {
    // At this point multer has already parsed the multipart form and populated req.body and req.file
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

    // Check project access for non-admins (developer role required)
    if (!req.user?.isAdmin && projectId) {
      const access = await checkProjectDeveloperAccess(req.user!.id, projectId, false)
      if (!access.allowed) {
        return res.status(403).json(createResponse(false, null, access.message || 'Insufficient permissions to upload functions', 403))
      }
    }

    // Check if function already exists by name - reject duplicates for new uploads
    const { Function: FunctionModel, FunctionVersion } = database.models;
    const existingFn = await FunctionModel.findOne({ where: { name: functionName }, attributes: ['id', 'name'] });

    if (existingFn) {
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

    // Upload to S3 and get hash
    const uploadResult = await s3Service.uploadPackage(functionId, version, packagePath)
    console.log(`✅ Package uploaded: ${uploadResult.objectName}`)

    // Insert new function (without version-specific columns)
    await FunctionModel.create({
      id: functionId,
      name: functionName,
      description,
      deployed_by: req.user!.id,
      requires_api_key: requiresApiKey,
      api_key: apiKey,
      is_active: true,
      project_id: projectId
    });

    // Create first version record
    const firstVersion = await FunctionVersion.create({
      function_id: functionId,
      version,
      package_path: uploadResult.objectName,
      file_size: uploadResult.size,
      package_hash: uploadResult.hash,
      created_by: req.user!.id
    });
    console.log(`✅ Version record created with ID: ${firstVersion.id}`)

    // Update function to reference the active version
    console.log(`🔗 Setting active version for function ${functionId}`)
    await FunctionModel.update({ active_version_id: firstVersion.id }, { where: { id: functionId } });
    console.log(`✅ Active version set to: ${firstVersion.id}`)

    // Enqueue build with after_build_action='switch' (deploy = upload + build + switch)
    const { FunctionBuild } = database.models as any
    await FunctionBuild.create({
      function_id: functionId,
      version_id: firstVersion.id,
      status: 'queued',
      after_build_action: 'switch',
      created_by: req.user!.id,
    })
    await FunctionVersion.update({ build_status: 'queued' }, { where: { id: firstVersion.id } })
    
    console.log(`✅ Created new function ${functionName} version ${version}`)

    // Clean up temporary files
    await fs.remove(uploadedFile.path)
    if (packagePath !== uploadedFile.path) {
      await fs.remove(packagePath)
    }

    // Return function details with version info
    const uploadedFn = await FunctionModel.findByPk(functionId, {
      include: [{ model: FunctionVersion, as: 'activeVersion', attributes: ['version', 'file_size', 'package_hash'], required: false }],
    }) as any
    const uploadedRaw = uploadedFn.toJSON()
    const finalData = {
      ...uploadedRaw,
      version: uploadedRaw.activeVersion?.version ?? null,
      file_size: uploadedRaw.activeVersion?.file_size ?? null,
      package_hash: uploadedRaw.activeVersion?.package_hash ?? null,
    }
    delete finalData.activeVersion

    return res.status(201).json(createResponse(true, finalData,
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

    const errorMessage = (error as any).message || 'Upload failed'
    console.error('Upload error details:', errorMessage)
    return res.status(500).json(createResponse(false, null, 'Upload failed. Please try again.', 500))
  }
}

// Wrap handler with auth middleware
const guarded = withAuthOrApiKeyAndMethods(['POST'])(handler as any)

export default async function adapter(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Run multer to parse the multipart form. Using runMiddleware ensures it returns a promise.
    await runMiddleware(upload.single('function'))(req, res)
  } catch (err: any) {
    console.error('Multer parse error:', err)
    return res.status(400).json(createResponse(false, null, 'Failed to parse multipart form data', 400))
  }

  // Now that req.body and req.file are populated, call the guarded handler
  return guarded(req as any, res as any)
}