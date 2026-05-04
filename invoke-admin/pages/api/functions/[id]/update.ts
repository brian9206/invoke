import { authenticate, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import multer from 'multer'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import * as tar from 'tar'
import AdmZip from 'adm-zip'

import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
const { s3Service } = require('invoke-shared')

// Configure multer for file uploads
const upload = multer({
  dest: path.join(os.tmpdir(), 'uploads'),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.zip', '.tar.gz', '.tgz']
    const fileExt = path.extname(file.originalname).toLowerCase()
    const isValidType = allowedTypes.some(type => file.originalname.toLowerCase().endsWith(type))

    if (isValidType) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only .zip, .tar.gz, and .tgz files are allowed.'))
    }
  }
})

export const config = {
  api: {
    bodyParser: false
  }
}

export default async function handler(req: AuthenticatedRequest, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  let uploadedFile: any = null

  try {
    const { id: functionId } = req.query

    if (!functionId || typeof functionId !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Function ID is required', 400))
    }

    // Authenticate user using our middleware
    const authResult = await authenticate(req)
    if (!authResult.success) {
      return res.status(401).json(createResponse(false, null, authResult.error || 'Authentication failed', 401))
    }

    const userId = authResult.user!.id

    // Check if function exists
    const { Function: FunctionModel, FunctionVersion } = database.models
    const existingFunction = (await FunctionModel.findByPk(functionId as string)) as any

    if (!existingFunction) {
      return res.status(404).json(createResponse(false, null, 'Function not found', 404))
    }

    // Check project access (developer role required for function updates)
    if (!authResult.user?.isAdmin) {
      const projectId = existingFunction.project_id
      if (!projectId) {
        return res.status(403).json(createResponse(false, null, 'No project associated with this function', 403))
      }

      const access = await checkProjectDeveloperAccess(userId, projectId, false)
      if (!access.allowed) {
        return res
          .status(403)
          .json(createResponse(false, null, access.message || 'Insufficient permissions to update this function', 403))
      }
    }

    // Handle file upload
    await new Promise<void>((resolve, reject) => {
      upload.single('file')(req as any, res as any, (error: any) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })

    uploadedFile = (req as any).file
    if (!uploadedFile) {
      return res.status(400).json(createResponse(false, null, 'No file uploaded', 400))
    }

    // Get next version number from function_versions table
    const latestVersionRecord = (await FunctionVersion.findOne({
      where: { function_id: functionId },
      order: [['version', 'DESC']],
      attributes: ['version'],
      raw: true
    })) as any
    const newVersion = latestVersionRecord ? Number(latestVersionRecord.version) + 1 : 1

    const isUpdate = true

    // Prepare package for upload to MinIO
    let packagePath = uploadedFile.path
    const originalName = uploadedFile.originalname.toLowerCase()

    // Convert .zip files to .tgz for consistency
    if (originalName.endsWith('.zip')) {
      const extractDir = path.join(path.dirname(packagePath), `extract_${Date.now()}`)
      const tgzPath = path.join(path.dirname(packagePath), `${functionId}_${newVersion}.tgz`)

      try {
        // Extract zip
        const zip = new AdmZip(packagePath)
        zip.extractAllTo(extractDir, true)

        // Create tar.gz
        await tar.create({ gzip: true, file: tgzPath, cwd: extractDir }, fs.readdirSync(extractDir))

        packagePath = tgzPath

        // Clean up
        await fs.remove(extractDir)
        console.log(`✓ Converted .zip to .tgz: ${tgzPath}`)
      } catch (error) {
        console.error('Error converting zip to tgz:', error)
        throw error
      }
    }

    // Upload package to S3
    const uploadResult = await s3Service.uploadPackage(functionId, newVersion, packagePath)
    console.log(`✅ Package uploaded: ${uploadResult.objectName}`)

    // Create new version record and update active_version_id on the function
    const newVersionRecord = await FunctionVersion.create({
      function_id: functionId,
      version: newVersion,
      file_size: uploadResult.size,
      package_hash: uploadResult.hash,
      package_path: uploadResult.objectName,
      created_by: userId
    })
    await FunctionModel.update({ active_version_id: newVersionRecord.id }, { where: { id: functionId } })

    console.log(`✅ Updated function ${existingFunction.name} to version ${newVersion}`)

    // Clean up temporary files
    await fs.remove(uploadedFile.path)
    if (packagePath !== uploadedFile.path) {
      await fs.remove(packagePath)
    }

    // Return updated function details
    const updatedFn = (await FunctionModel.findByPk(functionId as string, {
      include: [
        {
          model: FunctionVersion,
          as: 'activeVersion',
          attributes: ['version', 'file_size', 'package_hash'],
          required: false
        }
      ]
    })) as any
    const fnRaw = updatedFn.toJSON()
    const updatedFunction = {
      ...fnRaw,
      version: fnRaw.activeVersion?.version ?? null,
      file_size: fnRaw.activeVersion?.file_size ?? null,
      package_hash: fnRaw.activeVersion?.package_hash ?? null
    }
    delete updatedFunction.activeVersion

    return res.status(200).json(createResponse(true, updatedFunction, 'Function package updated successfully', 200))
  } catch (error) {
    console.error('Update error:', error)

    // Clean up uploaded file on error
    if (uploadedFile && uploadedFile.path) {
      try {
        await fs.remove(uploadedFile.path)
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file:', cleanupError)
      }
    }

    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}
