import { QueryTypes } from 'sequelize'
import { withAuthAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

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

  // Build WHERE clause based on status filter and project filter
  let whereClause = ''
  let queryParams: any[] = []
  let paramIndex = 1
  // Add project filter (skip if system)
  if (projectId && projectId !== 'system') {
    whereClause = 'WHERE f.project_id = $' + paramIndex
    queryParams.push(projectId)
    paramIndex++
  }
  
  // Add status filter
  if (status === 'success') {
    whereClause += (whereClause ? ' AND' : 'WHERE') + ` el.status_code >= 200 AND el.status_code < 300`
  } else if (status === 'error') {
    whereClause += (whereClause ? ' AND' : 'WHERE') + ` el.status_code >= 400`
  }

  // Get total count for pagination (with filter)
  const [countRow] = await database.sequelize.query(`
    SELECT COUNT(*) as total
    FROM execution_logs el
    LEFT JOIN functions f ON el.function_id = f.id
    ${whereClause}
  `, { bind: queryParams, type: QueryTypes.SELECT }) as any[];
  const totalCount = parseInt(countRow.total)
  const totalPages = Math.ceil(totalCount / limit)

  // Get execution logs with function names (paginated and filtered)
  const paginationParams = [...queryParams, limit, offset]
  const logRows = await database.sequelize.query(`
    SELECT 
      el.*,
      f.name as function_name
    FROM execution_logs el
    LEFT JOIN functions f ON el.function_id = f.id
    ${whereClause}
    ORDER BY el.executed_at DESC
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `, { bind: paginationParams, type: QueryTypes.SELECT }) as any[];

  const paginationData = {
    logs: logRows,
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