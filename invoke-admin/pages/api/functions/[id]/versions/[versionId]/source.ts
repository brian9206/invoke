import { QueryTypes } from 'sequelize'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import fs from 'fs-extra'
import path from 'path'
import AdmZip from 'adm-zip'
import * as tar from 'tar'
const database = require('@/lib/database')
const minioService = require('@/lib/minio')
const { createResponse } = require('@/lib/utils')

async function handler(req: AuthenticatedRequest, res: any) {
  const { id: functionId, versionId } = req.query

  if (!functionId || !versionId) {
    return res.status(400).json(createResponse(false, null, 'Function ID and Version ID are required', 400))
  }

  try {
    // Initialize MinIO service
    if (!minioService.initialized) {
      await minioService.initialize()
    }

    // Get version details
    const versionRows = await database.sequelize.query(`
      SELECT fv.*, f.name as function_name, f.project_id, p.name as project_name
      FROM function_versions fv
      JOIN functions f ON fv.function_id = f.id
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE fv.id = $1 AND fv.function_id = $2
    `, { bind: [versionId, functionId], type: QueryTypes.SELECT }) as any[];

    if (!versionRows.length) {
      return res.status(404).json(createResponse(false, null, 'Version not found', 404))
    }

    const versionData = versionRows[0]
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
      console.log('Attempting to download from MinIO:', objectKey)
      const bucketName = process.env.MINIO_BUCKET || 'invoke-packages'
      
      // Use getObject and write to file instead of fGetObject to avoid range issues
      const stream = await minioService.client.getObject(bucketName, objectKey)
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

      return res.status(200).json(createResponse(true, {
        functionId,
        versionId,
        version: versionData.version,
        functionName: versionData.function_name,
        project_id: versionData.project_id,
        project_name: versionData.project_name,
        files
      }, 'Source code retrieved successfully'))

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

export default withAuthOrApiKeyAndMethods(['GET'])(handler)

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