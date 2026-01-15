import { NextApiRequest, NextApiResponse } from 'next'
const { createResponse } = require('../../lib/utils')
const database = require('../../lib/database')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await database.connect()

    if (req.method === 'GET') {
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

    } else {
      return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
    }

  } catch (error) {
    console.error('Logs API error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}