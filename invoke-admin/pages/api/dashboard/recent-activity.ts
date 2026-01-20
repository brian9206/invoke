import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('../../../lib/utils')
const database = require('../../../lib/database')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    // Get recent execution activity
    const result = await database.query(`
      SELECT 
        el.id,
        f.id as function_id,
        f.name as function_name,
        el.status_code,
        el.execution_time_ms,
        el.executed_at,
        CASE 
          WHEN el.status_code < 400 THEN 'success'
          ELSE 'error'
        END as status
      FROM execution_logs el
      JOIN functions f ON el.function_id = f.id
      WHERE el.executed_at > NOW() - INTERVAL '1 hour'
      ORDER BY el.executed_at DESC
      LIMIT 10
    `)

    const recentActivity = result.rows.map(row => ({
      id: row.id.toString(),
      functionId: row.function_id,
      functionName: row.function_name,
      status: row.status,
      executionTime: row.execution_time_ms,
      executedAt: row.executed_at.toISOString()
    }))

    res.status(200).json(createResponse(true, recentActivity, 'Recent activity retrieved'))

  } catch (error) {
    console.error('Recent activity error:', error)
    res.status(500).json(createResponse(false, null, 'Failed to fetch recent activity', 500))
  }
}

export default withAuthAndMethods(['GET'])(handler)