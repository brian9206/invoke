import { NextApiRequest, NextApiResponse } from 'next'
import { authenticate, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

export default async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (!['GET', 'POST'].includes(req.method || '')) {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  const authResult = await authenticate(req)
  if (!authResult.success) {
    return res.status(401).json(createResponse(false, null, authResult.error || 'Unauthorized', 401))
  }
  req.user = authResult.user!

  const { id: functionId } = req.query
  const { FunctionBuild, FunctionVersion, Function: FunctionModel, User } = database.models as any

  // Check access
  if (!req.user.isAdmin) {
    const fn = await FunctionModel.findByPk(functionId, { attributes: ['project_id'] })
    if (!fn) return res.status(404).json(createResponse(false, null, 'Function not found', 404))
    if (fn.project_id) {
      const access = await checkProjectDeveloperAccess(req.user.id, fn.project_id, false)
      if (!access.allowed) return res.status(403).json(createResponse(false, null, access.message || 'Forbidden', 403))
    }
  }

  if (req.method === 'GET') {
    const page = parseInt((req.query.page as string) || '1', 10)
    const limit = parseInt((req.query.limit as string) || '20', 10)
    const offset = (page - 1) * limit
    const versionIdFilter = req.query.versionId as string | undefined

    const { count, rows } = await FunctionBuild.findAndCountAll({
      where: { function_id: functionId, ...(versionIdFilter ? { version_id: versionIdFilter } : {}) },
      include: [
        { model: FunctionVersion, as: 'version', attributes: ['id', 'version'] },
        { model: User, as: 'creator', attributes: ['username'], required: false }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    })

    const builds = rows.map((b: any) => {
      const raw = b.toJSON()
      return {
        id: raw.id,
        function_id: raw.function_id,
        version_id: raw.version_id,
        version_number: raw.version?.version ?? null,
        status: raw.status,
        after_build_action: raw.after_build_action,
        error_message: raw.error_message,
        created_by: raw.created_by,
        created_by_name: raw.creator?.username ?? null,
        created_at: raw.created_at,
        started_at: raw.started_at,
        completed_at: raw.completed_at
      }
    })

    return res.status(200).json(createResponse(true, { builds, total: count, page, limit }, 'Builds retrieved'))
  }

  if (req.method === 'POST') {
    const { versionId, afterBuildAction = 'none' } = req.body

    if (!versionId) {
      return res.status(400).json(createResponse(false, null, 'versionId is required', 400))
    }

    const versionRecord = await FunctionVersion.findOne({
      where: { id: versionId, function_id: functionId },
      attributes: ['id', 'version', 'build_status']
    })
    if (!versionRecord) {
      return res.status(404).json(createResponse(false, null, 'Version not found', 404))
    }

    // Create build record
    const build = await FunctionBuild.create({
      function_id: functionId,
      version_id: versionId,
      status: 'queued',
      after_build_action: afterBuildAction,
      created_by: req.user.id
    })

    // Update version build_status
    await FunctionVersion.update({ build_status: 'queued' }, { where: { id: versionId } })

    return res.status(201).json(createResponse(true, build.toJSON(), 'Build queued'))
  }
}
