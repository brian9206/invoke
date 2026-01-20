import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('../../../lib/utils')
const database = require('../../../lib/database')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {

    // Get function statistics
    const functionStats = await database.query(`
      SELECT 
        COUNT(*) as total_functions,
        COUNT(*) FILTER (WHERE is_active = true) as active_functions,
        SUM(execution_count) as total_executions
      FROM functions
    `)

    // Get recent execution statistics
    const executionStats = await database.query(`
      SELECT 
        COUNT(*) as recent_executions,
        COUNT(*) FILTER (WHERE status_code >= 400) as recent_errors,
        AVG(execution_time_ms)::int as avg_response_time,
        CASE 
          WHEN COUNT(*) = 0 THEN 100
          ELSE (COUNT(*) FILTER (WHERE status_code < 400) * 100.0 / COUNT(*))::int
        END as success_rate
      FROM execution_logs
      WHERE executed_at > NOW() - INTERVAL '24 hours'
    `)

    const functionStatsData = functionStats.rows[0]
    const executionStatsData = executionStats.rows[0]

    const stats = {
      totalFunctions: parseInt(functionStatsData.total_functions || 0),
      activeFunctions: parseInt(functionStatsData.active_functions || 0),
      totalExecutions: parseInt(functionStatsData.total_executions || 0),
      recentErrors: parseInt(executionStatsData.recent_errors || 0),
      avgResponseTime: executionStatsData.avg_response_time || 0,
      successRate: executionStatsData.success_rate || 100
    }

    res.status(200).json(createResponse(true, stats, 'Statistics retrieved'))

  } catch (error) {
    console.error('Stats error:', error)
    res.status(500).json(createResponse(false, null, 'Failed to fetch statistics', 500))
  }
}

export default withAuthAndMethods(['GET'])(handler)