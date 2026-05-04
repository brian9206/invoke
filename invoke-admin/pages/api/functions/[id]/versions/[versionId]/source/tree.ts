import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import fs from 'fs-extra'
import database from '@/lib/database'
import { createResponse } from '@/lib/utils'
import { ensureS3Initialized, downloadAndExtract, readDirectoryTree } from '@/lib/source-utils'

async function handler(req: AuthenticatedRequest, res: any) {
  const { id: functionId, versionId } = req.query

  if (!functionId || !versionId) {
    return res.status(400).json(createResponse(false, null, 'Function ID and Version ID are required', 400))
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
      const files = await readDirectoryTree(tempExtractPath)

      await fs.remove(tempFilePath)
      await fs.remove(tempExtractPath)

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
            is_active: versionRaw.id === versionRaw.Function?.active_version_id,
            files
          },
          'Source tree retrieved successfully'
        )
      )
    } catch (error) {
      try {
        await fs.remove(tempFilePath)
        await fs.remove(tempExtractPath)
      } catch {}
      throw error
    }
  } catch (error) {
    console.error('Error getting source tree:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthOrApiKeyAndMethods(['GET'])(handler)
