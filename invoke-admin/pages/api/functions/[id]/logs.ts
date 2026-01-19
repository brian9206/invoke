import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const { createResponse } = require('../../../../lib/utils')
const database = require('../../../../lib/database')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    await database.connect()

    const { id } = req.query as { id: string }

    if (!id || typeof id !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Function ID is required', 400))
    }

    // Extract and verify JWT token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(createResponse(false, null, 'Authorization header required', 401))
    }

    const token = authHeader.substring(7)
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
    
    try {
      jwt.verify(token, JWT_SECRET)
    } catch (error) {
      return res.status(401).json(createResponse(false, null, 'Invalid or expired token', 401))
    }

    // Verify function exists
    const functionResult = await database.query(
      'SELECT id FROM functions WHERE id = $1',
      [id]
    )

    if (functionResult.rows.length === 0) {
      return res.status(404).json(createResponse(false, null, 'Function not found', 404))
    }

    // Get execution logs for the function
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100) // Max 100, default 20
    const status = req.query.status as string || 'all'
    const offset = (page - 1) * limit

    // Build WHERE clause based on status filter
    let whereClause = 'WHERE function_id = $1'
    let queryParams = [id]
    
    if (status === 'success') {
      whereClause += ' AND status_code >= 200 AND status_code < 300'
    } else if (status === 'error') {
      whereClause += ' AND status_code >= 400'
    }
    // 'all' status means no additional filter

    // Get total count for pagination (with filter)
    const countResult = await database.query(`
      SELECT COUNT(*) as total 
      FROM execution_logs 
      ${whereClause}
    `, queryParams)
    const totalCount = parseInt(countResult.rows[0]?.total || 0)
    const totalPages = Math.ceil(totalCount / limit)

    const logsResult = await database.query(`
      SELECT 
        id,
        status_code,
        execution_time_ms,
        request_size,
        response_size,
        error_message,
        client_ip,
        user_agent,
        executed_at
      FROM execution_logs 
      ${whereClause}
      ORDER BY executed_at DESC 
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, limit, offset])

    return res.status(200).json(createResponse(true, {
      logs: logsResult.rows,
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