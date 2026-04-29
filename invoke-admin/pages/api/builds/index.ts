import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import { Op } from 'sequelize'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { FunctionBuild, FunctionVersion, Function: FunctionModel, User, Project } = database.models as any

  const page = parseInt((req.query.page as string) || '1', 10)
  const limit = parseInt((req.query.limit as string) || '20', 10)
  const offset = (page - 1) * limit
  const projectId = req.query.project_id as string | undefined
  const search = ((req.query.search as string) || '').trim()
  const status = req.query.status as string | undefined

  // Build where clause — filter by project via Function association
  const functionWhere: any = {}
  if (projectId) functionWhere.project_id = projectId
  if (search) functionWhere.name = { [Op.iLike]: `%${search}%` }

  // Filter by build status
  const buildWhere: any = {}
  if (status && ['queued', 'running', 'success', 'failed', 'cancelled'].includes(status)) {
    buildWhere.status = status
  }

  // Non-admins can only see builds for functions in their visible projects
  if (!req.user?.isAdmin) {
    const { ProjectMembership } = database.models as any
    const memberships = await ProjectMembership.findAll({
      where: { user_id: req.user!.id },
      attributes: ['project_id']
    })
    const memberProjectIds = memberships.map((m: any) => m.project_id)
    functionWhere.project_id = projectId ? (memberProjectIds.includes(projectId) ? projectId : null) : memberProjectIds
  }

  const { count, rows } = await FunctionBuild.findAndCountAll({
    where: Object.keys(buildWhere).length ? buildWhere : undefined,
    include: [
      {
        model: FunctionModel,
        attributes: ['id', 'name', 'project_id'],
        where: Object.keys(functionWhere).length ? functionWhere : undefined,
        required: true
      },
      {
        model: FunctionVersion,
        as: 'version',
        attributes: ['id', 'version']
      },
      {
        model: User,
        as: 'creator',
        attributes: ['username'],
        required: false
      }
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
      function_name: raw.Function?.name ?? null,
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

  return res
    .status(200)
    .json(createResponse(true, { builds, total: count, page, limit }, 'Builds retrieved successfully'))
}

export default withAuthAndMethods(['GET'])(handler)
