import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import fs from 'fs-extra'
import path from 'path'
import database from '@/lib/database'
import { createResponse } from '@/lib/utils'
import { ensureS3Initialized, downloadAndExtract } from '@/lib/source-utils'

async function handler(req: AuthenticatedRequest, res: any) {
  const { id: functionId, versionId, p: filePath } = req.query

  if (!functionId || !versionId || !filePath || typeof filePath !== 'string') {
    return res
      .status(400)
      .json(createResponse(false, null, 'Function ID, Version ID and file path (p) are required', 400))
  }

  // Prevent path traversal
  if (filePath.includes('..') || path.isAbsolute(filePath)) {
    return res.status(400).json(createResponse(false, null, 'Invalid file path', 400))
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
    const project_id = versionRaw.Function?.project_id

    if (!req.user?.isAdmin) {
      const access = await checkProjectDeveloperAccess(req.user!.id, project_id, false)
      if (!access.allowed) {
        return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
      }
    }

    const tempBaseDir = process.env.TEMP_DIR || './.cache'
    const { tempFilePath, tempExtractPath } = await downloadAndExtract(versionRaw, String(functionId), tempBaseDir)

    try {
      const absoluteFilePath = path.resolve(tempExtractPath, filePath)

      // Guard against path traversal after resolution
      if (!absoluteFilePath.startsWith(path.resolve(tempExtractPath))) {
        await fs.remove(tempFilePath)
        await fs.remove(tempExtractPath)
        return res.status(400).json(createResponse(false, null, 'Invalid file path', 400))
      }

      if (!(await fs.pathExists(absoluteFilePath))) {
        await fs.remove(tempFilePath)
        await fs.remove(tempExtractPath)
        return res.status(404).json(createResponse(false, null, 'File not found in package', 404))
      }

      const content = await fs.readFile(absoluteFilePath, 'utf8')

      await fs.remove(tempFilePath)
      await fs.remove(tempExtractPath)

      // ETag based on package hash + file path so browser caches until a new save
      const etag = `"${versionRaw.package_hash || versionRaw.id}-${Buffer.from(filePath).toString('base64')}"`

      res.setHeader('Cache-Control', 'private, max-age=3600, must-revalidate')
      res.setHeader('ETag', etag)

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end()
      }

      return res.status(200).json(createResponse(true, { path: filePath, content }, 'File retrieved successfully'))
    } catch (error) {
      try {
        await fs.remove(tempFilePath)
        await fs.remove(tempExtractPath)
      } catch {}
      throw error
    }
  } catch (error) {
    console.error('Error getting file content:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthOrApiKeyAndMethods(['GET'])(handler)
