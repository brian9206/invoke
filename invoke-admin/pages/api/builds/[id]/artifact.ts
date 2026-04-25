import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { NextApiResponse } from 'next'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import fs from 'fs-extra'
import path from 'path'
import * as tar from 'tar'
import archiver from 'archiver'
import { pipeline } from 'stream/promises'
const { s3Service } = require('invoke-shared')

export const config = {
  api: { responseLimit: false },
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { id: buildId } = req.query as { id: string }
  const { FunctionBuild, Function: FunctionModel, FunctionVersion, ProjectMembership } = database.models as any

  const build = await FunctionBuild.findByPk(buildId, {
    include: [
      { model: FunctionModel, attributes: ['id', 'name', 'project_id'] },
      { model: FunctionVersion, as: 'version', attributes: ['version'] },
    ],
  })

  if (!build) {
    return res.status(404).json(createResponse(false, null, 'Build not found', 404))
  }

  const raw = build.toJSON() as any

  if (!req.user?.isAdmin && raw.Function?.project_id) {
    const membership = await ProjectMembership.findOne({
      where: { user_id: req.user!.id, project_id: raw.Function.project_id },
    })
    if (!membership) {
      return res.status(403).json(createResponse(false, null, 'Access denied', 403))
    }
  }

  if (!raw.artifact_path) {
    return res.status(404).json(createResponse(false, null, 'No artifact available for this build', 404))
  }

  if (!s3Service.initialized) {
    await s3Service.initialize()
  }

  const bucketName: string = process.env.S3_BUCKET || 'invoke-packages'
  const functionName: string = raw.Function?.name ?? 'function'
  const versionNumber: number = raw.version?.version ?? 0
  const safeFileName = `${functionName}-v${versionNumber}-artifact`

  const tempDir = path.join(process.env.TEMP_DIR || './.cache', `artifact-${buildId}`)
  await fs.ensureDir(tempDir)

  try {
    const tgzPath = path.join(tempDir, 'artifact.tgz')

    try {
      await s3Service.fGetObject(bucketName, raw.artifact_path, tgzPath)
    } catch {
      return res.status(404).json(createResponse(false, null, 'Artifact file not found in storage', 404))
    }

    const extractDir = path.join(tempDir, 'extracted')
    await fs.ensureDir(extractDir)
    await tar.x({ file: tgzPath, cwd: extractDir })

    const zipPath = path.join(tempDir, 'artifact.zip')
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 6 } })

    // Register close/error handlers BEFORE finalize to avoid missing events
    const closePromise = new Promise<void>((resolve, reject) => {
      output.on('close', resolve)
      output.on('error', reject)
      archive.on('error', reject)
    })

    archive.pipe(output)
    archive.directory(extractDir, false)
    archive.finalize()
    await closePromise

    const zipStats = await fs.stat(zipPath)

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}.zip"`)
    res.setHeader('Content-Length', zipStats.size)

    // Await pipeline so handler doesn't return until stream is fully flushed
    await pipeline(fs.createReadStream(zipPath), res)
  } catch (err: any) {
    console.error(`[BuildArtifact] Failed for build ${buildId}:`, err.message)
    if (!res.headersSent) {
      res.status(500).json(createResponse(false, null, 'Failed to prepare artifact download', 500))
    }
  } finally {
    await fs.remove(tempDir).catch(() => {})
  }
}

export default withAuthAndMethods(['GET'])(handler)
