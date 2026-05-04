import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import fs from 'fs-extra'
import path from 'path'
import * as tar from 'tar'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import database from '@/lib/database'
const { s3Service } = require('invoke-shared')
import { createResponse } from '@/lib/utils'
import { ensureS3Initialized, downloadAndExtract, applyPatch } from '@/lib/source-utils'

async function handler(req: AuthenticatedRequest, res: any) {
  const userId = req.user!.id
  const { id: functionId } = req.query
  const { baseVersionId, changedFiles, deletedPaths = [], movedPaths = [], setActive = false } = req.body

  if (!functionId || !baseVersionId || !Array.isArray(changedFiles)) {
    return res
      .status(400)
      .json(createResponse(false, null, 'Function ID, baseVersionId and changedFiles array are required', 400))
  }

  try {
    await ensureS3Initialized()

    // Verify function exists
    const { Function: FunctionModel, FunctionVersion } = database.models
    const fn = await FunctionModel.findByPk(functionId, { attributes: ['id', 'name'] })

    if (!fn) {
      return res.status(404).json(createResponse(false, null, 'Function not found', 404))
    }

    // Verify base version exists
    const baseVersion = (await FunctionVersion.findOne({
      where: { id: baseVersionId, function_id: functionId }
    })) as any
    if (!baseVersion) {
      return res.status(404).json(createResponse(false, null, 'Base version not found', 404))
    }

    // Get next version number
    const maxVersion = await (FunctionVersion as any).max('version', { where: { function_id: functionId } })
    const nextVersion = ((maxVersion as number) || 0) + 1
    const newVersionId = uuidv4()

    // Get temp directory from environment or use default
    const tempBaseDir = process.env.TEMP_DIR || './.cache'

    // Download and extract base version
    const { tempFilePath, tempExtractPath } = await downloadAndExtract(
      baseVersion.toJSON(),
      String(functionId),
      tempBaseDir
    )

    // Temp dir for new version (reuse extracted dir after patching)
    const tempDir = tempExtractPath

    try {
      // Apply diff on top of base version
      await applyPatch(tempDir, movedPaths, deletedPaths, changedFiles)

      // Clean up the download archive (extracted dir stays for repackaging)
      await fs.remove(tempFilePath)

      // Create tar.gz archive
      const tgzPath = path.join(tempBaseDir, `${newVersionId}.tgz`)
      await tar.create({ gzip: true, file: tgzPath, cwd: tempDir }, ['.'])

      // Get file stats and calculate hash
      const stats = await fs.stat(tgzPath)
      const fileBuffer = await fs.readFile(tgzPath)
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

      // Upload to S3
      const minioObjectName = `functions/${functionId}/v${nextVersion}.tgz`
      const bucketName = process.env.S3_BUCKET || 'invoke-packages'
      await s3Service.fPutObject(bucketName, minioObjectName, tgzPath, {
        'Content-Type': 'application/gzip',
        'Function-ID': functionId,
        Version: nextVersion.toString()
      })

      // Create version record
      await FunctionVersion.create({
        id: newVersionId,
        function_id: functionId,
        version: nextVersion,
        file_size: stats.size,
        package_hash: hash,
        created_by: userId,
        package_path: minioObjectName
      })

      // If setActive is true, update the function's active version
      if (setActive) {
        await FunctionModel.update({ active_version_id: newVersionId }, { where: { id: functionId } })
      }

      // Clean up temporary files
      await fs.remove(tempDir)
      await fs.remove(tgzPath)

      return res.status(201).json(
        createResponse(
          true,
          {
            versionId: newVersionId,
            version: nextVersion,
            size: stats.size,
            isActive: setActive
          },
          `Version ${nextVersion} created${setActive ? ' and activated' : ''} successfully`
        )
      )
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

export default withAuthOrApiKeyAndMethods(['POST'])(handler)
