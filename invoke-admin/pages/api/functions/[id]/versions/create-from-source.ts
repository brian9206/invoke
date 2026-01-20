import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import fs from 'fs-extra'
import path from 'path'
import * as tar from 'tar'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
const database = require('@/lib/database')
const minioService = require('@/lib/minio')
const { createResponse } = require('@/lib/utils')

async function handler(req: AuthenticatedRequest, res: any) {
  const userId = req.user!.id
  const { id: functionId } = req.query
  const { files, setActive = false } = req.body

  if (!functionId || !files || !Array.isArray(files)) {
    return res.status(400).json(createResponse(false, null, 'Function ID and files array are required', 400))
  }

  try {
    // Initialize MinIO service
    if (!minioService.initialized) {
      await minioService.initialize()
    }

    // Verify function exists
    const functionResult = await database.query(
      'SELECT id, name FROM functions WHERE id = $1',
      [functionId]
    )

    if (functionResult.rows.length === 0) {
      return res.status(404).json(createResponse(false, null, 'Function not found', 404))
    }

    // Get next version number
    const versionResult = await database.query(
      'SELECT MAX(version) as max_version FROM function_versions WHERE function_id = $1',
      [functionId]
    )

    const nextVersion = (versionResult.rows[0]?.max_version || 0) + 1
    const newVersionId = uuidv4()

    // Get temp directory from environment or use default
    const tempBaseDir = process.env.TEMP_DIR || './.cache'
    await fs.ensureDir(tempBaseDir)

    // Create temporary directory for new version files
    const tempDir = path.join(tempBaseDir, `version-${newVersionId}`)
    await fs.ensureDir(tempDir)

    try {
      // Write all files to temporary directory
      await writeFilesToDirectory(files, tempDir)

      // Create tar.gz archive
      const tgzPath = path.join(tempBaseDir, `${newVersionId}.tgz`)
      await tar.create(
        {
          gzip: true,
          file: tgzPath,
          cwd: tempDir
        },
        ['.']
      )

      // Get file stats and calculate hash
      const stats = await fs.stat(tgzPath)
      const fileBuffer = await fs.readFile(tgzPath)
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

      // Upload to MinIO
      const minioObjectName = `functions/${functionId}/v${nextVersion}.tgz`
      const bucketName = process.env.MINIO_BUCKET || 'invoke-packages'
      await minioService.client.fPutObject(bucketName, minioObjectName, tgzPath, {
        'Content-Type': 'application/gzip',
        'Function-ID': functionId,
        'Version': nextVersion.toString()
      })

      // Create version record
      await database.query(
        `INSERT INTO function_versions (id, function_id, version, file_size, package_hash, created_by, package_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newVersionId, functionId, nextVersion, stats.size, hash, userId, minioObjectName]
      )

      // If setActive is true, update the function's active version
      if (setActive) {
        await database.query(
          'UPDATE functions SET active_version_id = $1 WHERE id = $2',
          [newVersionId, functionId]
        )
      }

      // Clean up temporary files
      await fs.remove(tempDir)
      await fs.remove(tgzPath)

      return res.status(201).json(createResponse(true, {
        versionId: newVersionId,
        version: nextVersion,
        size: stats.size,
        isActive: setActive
      }, `Version ${nextVersion} created${setActive ? ' and activated' : ''} successfully`))

    } catch (error) {
      // Clean up on error
      try {
        await fs.remove(tempDir)
        await fs.remove(path.join(tempBaseDir, `${newVersionId}.tgz`))
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError)
      }
      throw error
    }

  } catch (error) {
    console.error('Error saving source code:', error)
    return res.status(500).json(createResponse(false, null, 'Failed to save source code', 500))
  }
}

export default withAuthAndMethods(['POST'])(handler)

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