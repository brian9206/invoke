import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { Pool } from 'pg'
import { Client as MinIOClient } from 'minio'
import fs from 'fs-extra'
import path from 'path'
import tar from 'tar'
import archiver from 'archiver'
import { pipeline } from 'stream/promises'
const { createResponse } = require('@/lib/utils')

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'invoke_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'invoke_password_123'
})

const minioClient = new MinIOClient({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'invoke-minio',
  secretKey: process.env.MINIO_SECRET_KEY || 'invoke-minio-password-123',
})

async function handler(req: AuthenticatedRequest, res: any) {
  const { id: functionId, versionId } = req.query

  if (!functionId || !versionId) {
    return res.status(400).json(createResponse(false, null, 'Function ID and version ID are required', 400))
  }

  try {
    // Get version info from database
    const client = await pool.connect()
    try {
      const versionResult = await client.query(`
        SELECT 
          fv.package_path,
          fv.version,
          f.name
        FROM function_versions fv
        JOIN functions f ON fv.function_id = f.id
        WHERE fv.id = $1 AND f.id = $2
      `, [versionId, functionId])

      if (versionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Version not found' })
      }

      const version = versionResult.rows[0]
      const objectKey = version.package_path
      const functionName = version.name
      const versionNumber = version.version

      // Stream file from MinIO
      const bucketName = 'invoke-packages'
      
      try {
        const stat = await minioClient.statObject(bucketName, objectKey)
        
        // Create temp directory for processing
        const tempBaseDir = process.env.TEMP_DIR || './.cache'
        await fs.ensureDir(tempBaseDir)
        const tempDir = path.join(tempBaseDir, `download-${versionId}`)
        await fs.ensureDir(tempDir)
        
        try {
          // Download tgz file from MinIO
          const tgzPath = path.join(tempDir, 'package.tgz')
          await minioClient.fGetObject(bucketName, objectKey, tgzPath)
          
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

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Download version error:', error)
    res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthAndMethods(['GET'])(handler)