import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('../../lib/utils')
const database = require('../../lib/database')

async function handler(req: AuthenticatedRequest, res: any) {
  // Parse pagination parameters
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const status = req.query.status as string || 'all'
  const offset = (page - 1) * limit

  // Build WHERE clause based on status filter
  let whereClause = ''
  let queryParams = []
  
  if (status === 'success') {
    whereClause = 'WHERE el.status_code >= 200 AND el.status_code < 300'
  } else if (status === 'error') {
    whereClause = 'WHERE el.status_code >= 400'
  }
  // 'all' status means no WHERE clause (show all)

  // Get total count for pagination (with filter)
  const countResult = await database.query(`
    SELECT COUNT(*) as total
    FROM execution_logs el
    LEFT JOIN functions f ON el.function_id = f.id
    ${whereClause}
  `)
  const totalCount = parseInt(countResult.rows[0].total)
  const totalPages = Math.ceil(totalCount / limit)

  // Get execution logs with function names (paginated and filtered)
  const result = await database.query(`
    SELECT 
      el.*,
      f.name as function_name
    FROM execution_logs el
    LEFT JOIN functions f ON el.function_id = f.id
    ${whereClause}
    ORDER BY el.executed_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset])

  const paginationData = {
    logs: result.rows,
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