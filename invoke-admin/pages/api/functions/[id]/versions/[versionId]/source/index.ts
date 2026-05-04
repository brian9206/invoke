import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import fs from 'fs-extra'
import path from 'path'
import * as tar from 'tar'
import crypto from 'crypto'
import database from '@/lib/database'
const { s3Service } = require('invoke-shared')
import { createResponse } from '@/lib/utils'
import { ensureS3Initialized, downloadAndExtract, applyPatch } from '@/lib/source-utils'

async function handler(req: AuthenticatedRequest, res: any) {
  if (req.method === 'PUT') {
    return handlePut(req, res)
  }
  return handleGet(req, res)
}

// GET: returns version metadata only (no file tree extraction).
// Used by the editor to poll build_status / is_active after a build completes.
async function handleGet(req: AuthenticatedRequest, res: any) {
  const { id: functionId, versionId } = req.query

  if (!functionId || !versionId) {
    return res.status(400).json(createResponse(false, null, 'Function ID and Version ID are required', 400))
  }

  try {
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
    const project_id = versionRaw.Function?.project_id

    if (!req.user?.isAdmin) {
      const access = await checkProjectDeveloperAccess(req.user!.id, project_id, false)
      if (!access.allowed) {
        return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
      }
    }

    return res.status(200).json(
      createResponse(
        true,
        {
          functionId,
          versionId,
          version: versionRaw.version,
          functionName: versionRaw.Function?.name ?? null,
          project_id,
          project_name: versionRaw.Function?.Project?.name ?? null,
          build_status: versionRaw.build_status || 'none',
          is_active: versionRaw.id === versionRaw.Function?.active_version_id
        },
        'Version info retrieved successfully'
      )
    )
  } catch (error) {
    console.error('Error getting version info:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

// PUT: patch save.
// Body: { changedFiles: [{path, content}], deletedPaths: string[], movedPaths: [{from, to}] }
// Downloads the current package, applies the diff, repacks, and re-uploads to S3.
async function handlePut(req: AuthenticatedRequest, res: any) {
  const { id: functionId, versionId } = req.query
  const { changedFiles, deletedPaths = [], movedPaths = [] } = req.body

  if (!functionId || !versionId || !Array.isArray(changedFiles)) {
    return res
      .status(400)
      .json(createResponse(false, null, 'Function ID, Version ID and changedFiles array are required', 400))
  }

  try {
    await ensureS3Initialized()

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

    if (!req.user?.isAdmin) {
      const projectId = versionRaw.Function?.project_id
      if (projectId) {
        const access = await checkProjectDeveloperAccess(req.user!.id, projectId, false)
        if (!access.allowed) {
          return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
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
    const { tempFilePath, tempExtractPath } = await downloadAndExtract(versionRaw, String(functionId), tempBaseDir)

    const tgzPath = path.join(tempBaseDir, `${versionId}-overwrite.tgz`)

    try {
      await applyPatch(tempExtractPath, movedPaths, deletedPaths, changedFiles)

      await tar.create({ gzip: true, file: tgzPath, cwd: tempExtractPath }, ['.'])

      const stats = await fs.stat(tgzPath)
      const fileBuffer = await fs.readFile(tgzPath)
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

      const objectKey = versionRaw.package_path || `functions/${functionId}/v${versionRaw.version}.tgz`
      const bucketName = process.env.S3_BUCKET || 'invoke-packages'
      await s3Service.fPutObject(bucketName, objectKey, tgzPath, {
        'Content-Type': 'application/gzip',
        'Function-ID': String(functionId),
        Version: String(versionRaw.version)
      })

      await FunctionVersion.update(
        { file_size: stats.size, package_hash: hash, package_path: objectKey },
        { where: { id: versionId } }
      )

      await fs.remove(tempExtractPath)
      await fs.remove(tempFilePath)
      await fs.remove(tgzPath)

      return res
        .status(200)
        .json(
          createResponse(
            true,
            { versionId, version: versionRaw.version, size: stats.size },
            `Version ${versionRaw.version} updated successfully`
          )
        )
    } catch (error) {
      try {
        await fs.remove(tempExtractPath)
        await fs.remove(tempFilePath)
        await fs.remove(tgzPath)
      } catch {}
      throw error
    }
  } catch (error) {
    console.error('Error updating source code:', error)
    return res.status(500).json(createResponse(false, null, 'Failed to update source code', 500))
  }
}

export default withAuthOrApiKeyAndMethods(['GET', 'PUT'])(handler)
