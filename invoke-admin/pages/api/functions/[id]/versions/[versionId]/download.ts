import { QueryTypes } from 'sequelize'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import fs from 'fs-extra'
import path from 'path'
import * as tar from 'tar'
import archiver from 'archiver'
import { pipeline } from 'stream/promises'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')
const { s3Service } = require('invoke-shared')

async function handler(req: AuthenticatedRequest, res: any) {
  const { id: functionId, versionId } = req.query

  if (!functionId || !versionId) {
    return res.status(400).json(createResponse(false, null, 'Function ID and version ID are required', 400))
  }

  try {
    // Initialize S3 service
    if (!s3Service.initialized) {
      await s3Service.initialize()
    }

    // Get version info from database
    const [versionInfo] = await database.sequelize.query(`
      SELECT 
        fv.package_path,
        fv.version,
        f.name
      FROM function_versions fv
      JOIN functions f ON fv.function_id = f.id
      WHERE fv.id = $1 AND f.id = $2
    `, { bind: [versionId, functionId], type: QueryTypes.SELECT }) as any[];

    if (!versionInfo) {
      return res.status(404).json({ error: 'Version not found' })
    }

    const objectKey = versionInfo.package_path
    const functionName = versionInfo.name
    const versionNumber = versionInfo.version

    // Stream file from MinIO
    const bucketName = 'invoke-packages'
    
    try {
      const stat = await s3Service.statObject(bucketName, objectKey)
      
      // Create temp directory for processing
      const tempBaseDir = process.env.TEMP_DIR || './.cache'
      await fs.ensureDir(tempBaseDir)
      const tempDir = path.join(tempBaseDir, `download-${versionId}`)
      await fs.ensureDir(tempDir)
      
      try {
        // Download tgz file from MinIO
        const tgzPath = path.join(tempDir, 'package.tgz')
        await s3Service.fGetObject(bucketName, objectKey, tgzPath)
        
        // Extract tgz to temp directory
        const extractDir = path.join(tempDir, 'extracted')
        await fs.ensureDir(extractDir)
        await tar.x({
          file: tgzPath,
          cwd: extractDir
        })
        
        // Create zip archive
        const zipPath = path.join(tempDir, 'package.zip')
        const output = fs.createWriteStream(zipPath)
        const archive = archiver('zip', {
          zlib: { level: 9 } // Best compression
        })
        
        // Pipe archive to output
        archive.pipe(output)
        
        // Add all files from extracted directory to zip
        archive.directory(extractDir, false)
        
        // Finalize the archive
        await archive.finalize()
        
        // Wait for the output stream to close
        await new Promise<void>((resolve, reject) => {
          output.on('close', resolve)
          output.on('error', reject)
        })
        
        // Get zip file stats
        const zipStats = await fs.stat(zipPath)
        
        // Set headers for zip file download
        res.setHeader('Content-Type', 'application/zip')
        res.setHeader('Content-Disposition', `attachment; filename="${functionName}-v${versionNumber}.zip"`)
        res.setHeader('Content-Length', zipStats.size)

        // Stream zip file to response
        const zipStream = fs.createReadStream(zipPath)
        zipStream.pipe(res)
        
        // Clean up temp files after streaming
        zipStream.on('end', async () => {
          try {
            await fs.remove(tempDir)
          } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError)
          }
        })
        
      } catch (processingError) {
        console.error('File processing error:', processingError)
        await fs.remove(tempDir)
        return res.status(500).json({ error: 'Failed to process package file' })
      }
      
    } catch (minioError) {
      console.error('MinIO error:', minioError)
      return res.status(404).json({ error: 'Package file not found' })
    }

  } catch (error) {
    console.error('Download version error:', error)
    res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthOrApiKeyAndMethods(['GET'])(handler)