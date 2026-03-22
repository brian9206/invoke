import { Op } from 'sequelize'
import { withAuthAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: any) {
  // Parse pagination parameters
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const status = req.query.status as string || 'all'
  const projectId = req.query.projectId as string
  const offset = (page - 1) * limit

  // Verify project access
  if (projectId && projectId !== 'system') {
    const userProjects = await getUserProjects(req.user!.id)
    const hasAccess = req.user?.isAdmin || userProjects.some(p => p.id === projectId)
    if (!hasAccess) {
      return res.status(403).json(createResponse(false, null, 'Access denied to this project', 403))
    }
  }

  // Build where clauses using Sequelize Op
  const functionWhere = (projectId && projectId !== 'system') ? { project_id: projectId } : undefined
  const statusWhere: any = {}
  if (status === 'success') {
    statusWhere.status_code = { [Op.gte]: 200, [Op.lt]: 300 }
  } else if (status === 'error') {
    statusWhere.status_code = { [Op.gte]: 400 }
  }

  const { ExecutionLog, Function: FunctionModel } = database.models
  const { count, rows } = await (ExecutionLog as any).findAndCountAll({
    where: statusWhere,
    include: [{
      model: FunctionModel,
      attributes: ['name'],
      where: functionWhere,
      required: !!functionWhere,
    }],
    order: [['executed_at', 'DESC']],
    limit,
    offset,
    distinct: true,
  })

  const totalCount = count
  const totalPages = Math.ceil(totalCount / limit)
  const logs = rows.map((log: any) => {
    const raw = log.toJSON()
    return { ...raw, function_name: raw.Function?.name ?? null, Function: undefined }
  })

  const paginationData = {
    logs,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  }

  return res.status(200).json(createResponse(true, paginationData, 'Logs retrieved successfully'))
}

export default withAuthAndMethods(['GET'])(handler)