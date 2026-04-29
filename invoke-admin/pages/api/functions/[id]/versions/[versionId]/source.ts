import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import fs from 'fs-extra'
import path from 'path'
import AdmZip from 'adm-zip'
import * as tar from 'tar'
import crypto from 'crypto'
import database from '@/lib/database'
const { s3Service } = require('invoke-shared')
import { createResponse } from '@/lib/utils'

async function handler(req: AuthenticatedRequest, res: any) {
  if (req.method === 'PUT') {
    return handlePut(req, res)
  }
  return handleGet(req, res)
}

async function handlePut(req: AuthenticatedRequest, res: any) {
  const { id: functionId, versionId } = req.query
  const { files } = req.body

  if (!functionId || !versionId || !files || !Array.isArray(files)) {
    return res
      .status(400)
      .json(createResponse(false, null, 'Function ID, Version ID and files array are required', 400))
  }

  try {
    if (!s3Service.initialized) {
      await s3Service.initialize()
    }

    const { FunctionVersion, Function: FunctionModel, Project } = database.models
    const versionRecord = (await FunctionVersion.findOne({
      where: { id: versionId, function_id: functionId },
      include: [
        {
          model: FunctionModel,
          attributes: ['name', 'project_id', 'active_version_id'],
          required: true,
          include: [{ model: Project, attributes: ['name'], required: false }]
        }
      ]
    })) as any

    if (!versionRecord) {
      return res.status(404).json(createResponse(false, null, 'Version not found', 404))
    }

    const versionRaw = versionRecord.toJSON()

    // Verify project membership for non-admins
    if (!req.user?.isAdmin) {
      const projectId = versionRaw.Function?.project_id
      if (projectId) {
        const access = await checkProjectDeveloperAccess(req.user!.id, projectId, false)
        if (!access.allowed) {
          return res
            .status(403)
            .json(createResponse(false, null, access.message || 'Access denied to this project', 403))
        }
      }
    }

    // Guard: only allow overwrite if not built and not active
    const isActive = versionRaw.id === versionRaw.Function?.active_version_id
    const buildStatus = versionRaw.build_status || 'none'
    if (buildStatus !== 'none' || isActive) {
      return res
        .status(409)
        .json(
          createResponse(
            false,
            null,
            'Cannot overwrite a version that has been built or is active. Save as a new version instead.',
            409
          )
        )
    }

    const tempBaseDir = process.env.TEMP_DIR || './.cache'
    await fs.ensureDir(tempBaseDir)

    const tempDir = path.join(tempBaseDir, `version-overwrite-${versionId}`)
    await fs.ensureDir(tempDir)

    try {
      await writeFilesToDirectory(files, tempDir)

      const tgzPath = path.join(tempBaseDir, `${versionId}-overwrite.tgz`)
      await tar.create({ gzip: true, file: tgzPath, cwd: tempDir }, ['.'])

      const stats = await fs.stat(tgzPath)
      const fileBuffer = await fs.readFile(tgzPath)
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

      // Upload to the same S3 path
      const objectKey = versionRaw.package_path || `functions/${functionId}/v${versionRaw.version}.tgz`
      const bucketName = process.env.S3_BUCKET || 'invoke-packages'
      await s3Service.fPutObject(bucketName, objectKey, tgzPath, {
        'Content-Type': 'application/gzip',
        'Function-ID': functionId as string,
        Version: String(versionRaw.version)
      })

      // Update version record
      await FunctionVersion.update(
        { file_size: stats.size, package_hash: hash, package_path: objectKey },
        { where: { id: versionId } }
      )

      await fs.remove(tempDir)
      await fs.remove(tgzPath)

      return res.status(200).json(
        createResponse(
          true,
          {
            versionId,
            version: versionRaw.version,
            size: stats.size
          },
          `Version ${versionRaw.version} updated successfully`
        )
      )
    } catch (error) {
      try {
        await fs.remove(tempDir)
        await fs.remove(path.join(tempBaseDir, `${versionId}-overwrite.tgz`))
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError)
      }
      throw error
    }
  } catch (error) {
    console.error('Error updating source code:', error)
    return res.status(500).json(createResponse(false, null, 'Failed to update source code', 500))
  }
}

async function handleGet(req: AuthenticatedRequest, res: any) {
  const { id: functionId, versionId } = req.query

  if (!functionId || !versionId) {
    return res.status(400).json(createResponse(false, null, 'Function ID and Version ID are required', 400))
  }

  try {
    // Initialize S3 service
    if (!s3Service.initialized) {
      await s3Service.initialize()
    }

    // Get version details
    const { FunctionVersion, Function: FunctionModel, Project } = database.models
    const versionRecord = (await FunctionVersion.findOne({
      where: { id: versionId, function_id: functionId },
      include: [
        {
          model: FunctionModel,
          attributes: ['name', 'project_id', 'active_version_id'],
          required: true,
          include: [{ model: Project, attributes: ['name'], required: false }]
        }
      ]
    })) as any

    if (!versionRecord) {
      return res.status(404).json(createResponse(false, null, 'Version not found', 404))
    }

    const versionRaw = versionRecord.toJSON()
    const versionData = {
      ...versionRaw,
      function_name: versionRaw.Function?.name ?? null,
      project_id: versionRaw.Function?.project_id ?? null,
      project_name: versionRaw.Function?.Project?.name ?? null
    }
    delete versionData.Function
    // Verify project membership for non-admins
    if (!req.user?.isAdmin) {
      const access = await checkProjectDeveloperAccess(req.user!.id, versionData.project_id, false)
      if (!access.allowed) {
        return res.status(403).json(createResponse(false, null, access.message || 'Access denied to this project', 403))
      }
    }

    // Check if object_key exists, if not use package_path as fallback, or construct it
    let objectKey = versionData.object_key
    if (!objectKey) {
      if (versionData.package_path) {
        objectKey = versionData.package_path
      } else {
        // Try to construct object key from function ID and version
        objectKey = `functions/${functionId}/v${versionData.version}.zip`
      }
    }

    // Get temp directory from environment or use default
    const tempBaseDir = process.env.TEMP_DIR || './.cache'
    await fs.ensureDir(tempBaseDir)

    // Download file from MinIO
    const tempFilePath = path.join(tempBaseDir, `${versionId}_download`)

    // Ensure clean download by removing any existing partial file
    try {
      await fs.remove(tempFilePath)
    } catch (removeError) {
      // Ignore error if file doesn't exist
    }

    try {
      console.log('Attempting to download from S3:', objectKey)
      const bucketName = process.env.S3_BUCKET || 'invoke-packages'

      // Use getObjectStream and write to file
      const stream = await s3Service.getObjectStream(bucketName, objectKey)
      const writeStream = fs.createWriteStream(tempFilePath)

      await new Promise<void>((resolve, reject) => {
        stream.on('error', reject)
        writeStream.on('error', reject)
        writeStream.on('finish', resolve)
        stream.pipe(writeStream)
      })
    } catch (error) {
      console.error('Error downloading from MinIO:', error)
      return res.status(500).json(createResponse(false, null, 'Failed to download function package', 500))
    }

    // Extract and read files
    const tempExtractPath = path.join(tempBaseDir, `${versionId}_extract`)
    await fs.ensureDir(tempExtractPath)

    try {
      // Determine file type and extract
      if (objectKey.endsWith('.zip')) {
        const zip = new AdmZip(tempFilePath)
        zip.extractAllTo(tempExtractPath, true)
      } else if (objectKey.endsWith('.tar.gz') || objectKey.endsWith('.tgz')) {
        await tar.x({
          file: tempFilePath,
          cwd: tempExtractPath,
          strip: 0 // Don't strip any directory levels
        })
      } else {
        await tar.x({
          file: tempFilePath,
          cwd: tempExtractPath,
          strip: 0
        })
      }

      // Verify extraction worked
      const extractedItems = await fs.readdir(tempExtractPath)

      if (extractedItems.length === 0) {
        throw new Error('No files were extracted from the archive')
      }

      // Read all files recursively
      const files = await readDirectoryRecursively(tempExtractPath)

      // Clean up temporary files
      await fs.remove(tempFilePath)
      await fs.remove(tempExtractPath)

      return res.status(200).json(
        createResponse(
          true,
          {
            functionId,
            versionId,
            version: versionData.version,
            functionName: versionData.function_name,
            project_id: versionData.project_id,
            project_name: versionData.project_name,
            build_status: versionData.build_status || 'none',
            is_active: versionData.id === versionRaw.Function?.active_version_id,
            files
          },
          'Source code retrieved successfully'
        )
      )
    } catch (extractError) {
      console.error('Error extracting files:', extractError)

      // Clean up
      try {
        await fs.remove(tempFilePath)
        await fs.remove(tempExtractPath)
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError)
      }

      return res.status(500).json(createResponse(false, null, 'Failed to extract function package', 500))
    }
  } catch (error) {
    console.error('Error getting source code:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthOrApiKeyAndMethods(['GET', 'PUT'])(handler)

async function writeFilesToDirectory(files: any[], baseDir: string): Promise<void> {
  for (const file of files) {
    const filePath = path.join(baseDir, file.path)
    if (file.type === 'directory') {
      await fs.ensureDir(filePath)
      if (file.children && Array.isArray(file.children)) {
        await writeFilesToDirectory(file.children, baseDir)
      }
    } else if (file.type === 'file' && file.content !== undefined) {
      await fs.ensureDir(path.dirname(filePath))
      await fs.writeFile(filePath, file.content, 'utf8')
    }
  }
}

async function readDirectoryRecursively(dirPath: string, relativePath = ''): Promise<any[]> {
  const files: any[] = []

  try {
    const items = await fs.readdir(dirPath)

    for (const item of items) {
      const itemPath = path.join(dirPath, item)
      const itemRelativePath = relativePath ? path.join(relativePath, item) : item

      try {
        const stats = await fs.stat(itemPath)

        if (stats.isDirectory()) {
          const subFiles = await readDirectoryRecursively(itemPath, itemRelativePath)
          files.push({
            name: item,
            path: itemRelativePath,
            type: 'directory',
            children: subFiles
          })
        } else {
          const content = await fs.readFile(itemPath, 'utf8')
          files.push({
            name: item,
            path: itemRelativePath,
            type: 'file',
            content,
            size: stats.size
          })
        }
      } catch (itemError) {
        console.error(`Error processing item ${itemPath}:`, itemError)
        // Skip this item and continue
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error)
    throw error
  }

  return files
}
