import { Op } from 'sequelize'
import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
  const { id } = req.query as { id: string }

  if (!id || typeof id !== 'string') {
    return res.status(400).json(createResponse(false, null, 'Function ID is required', 400))
  }

  // Verify function exists
  const { Function: FunctionModel, ExecutionLog } = database.models;
  const fn = await FunctionModel.findByPk(id, { attributes: ['id'] });

  if (!fn) {
    return res.status(404).json(createResponse(false, null, 'Function not found', 404))
  }

    // Get execution logs for the function
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100) // Max 100, default 20
    const status = req.query.status as string || 'all'
    const offset = (page - 1) * limit

    // Build where clause using Sequelize Op
    const where: any = { function_id: id }
    if (status === 'success') {
      where.status_code = { [Op.gte]: 200, [Op.lt]: 300 }
    } else if (status === 'error') {
      where.status_code = { [Op.gte]: 400 }
    }

    const { count, rows } = await (ExecutionLog as any).findAndCountAll({
      where,
      attributes: ['id', 'status_code', 'execution_time_ms', 'request_size', 'response_size', 'error_message', 'client_ip', 'user_agent', 'executed_at'],
      order: [['executed_at', 'DESC']],
      limit,
      offset,
      distinct: true,
    })

    const totalCount = count
    const totalPages = Math.ceil(totalCount / limit)

    return res.status(200).json(createResponse(true, {
      logs: rows.map((r: any) => r.toJSON()),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }, 'Execution logs retrieved', 200))

  } catch (error) {
    console.error('Function logs API error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthOrApiKeyAndMethods(['GET'])(handler)