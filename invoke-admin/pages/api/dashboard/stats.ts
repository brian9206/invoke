import { NextApiResponse } from 'next'
import { Op, fn, col, literal } from 'sequelize'
import { withAuthAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const projectId = req.query.projectId as string

    // Verify project access
    if (projectId && projectId !== 'system') {
      const userProjects = await getUserProjects(req.user!.id)
      const hasAccess = req.user?.isAdmin || userProjects.some((p: any) => p.id === projectId)
      if (!hasAccess) {
        return res.status(403).json(createResponse(false, null, 'Access denied to this project', 403))
      }
    }

    const fnWhere = projectId && projectId !== 'system' ? { project_id: projectId } : {}
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Get function statistics using Sequelize model aggregation
    const functionStatsRow: any = await database.models.Function.findOne({
      attributes: [
        [fn('COUNT', col('id')), 'total_functions'],
        [literal(`COUNT(*) FILTER (WHERE is_active = true)`), 'active_functions'],
        [fn('SUM', col('execution_count')), 'total_executions'],
      ],
      where: fnWhere,
      raw: true,
    })

    // Get recent execution statistics (last 24 hours), project-scoped via Function join
    const execInclude: any[] = [{
      model: database.models.Function,
      attributes: [],
      ...(projectId && projectId !== 'system' ? { where: { project_id: projectId } } : {}),
      required: true,
    }]

    const executionStatsRow: any = await database.models.ExecutionLog.findOne({
      attributes: [
        [fn('COUNT', col('ExecutionLog.id')), 'recent_executions'],
        [literal(`COUNT(*) FILTER (WHERE "ExecutionLog"."status_code" >= 400)`), 'recent_errors'],
        [literal(`AVG("ExecutionLog"."execution_time_ms")::int`), 'avg_response_time'],
        [literal(`CASE WHEN COUNT(*) = 0 THEN 100.0 ELSE ROUND((COUNT(*) FILTER (WHERE "ExecutionLog"."status_code" < 400) * 100.0 / COUNT(*)), 1) END`), 'success_rate'],
      ],
      include: execInclude,
      where: { executed_at: { [Op.gt]: cutoff } },
      raw: true,
    })

    const stats = {
      totalFunctions: parseInt(functionStatsRow?.total_functions ?? 0),
      activeFunctions: parseInt(functionStatsRow?.active_functions ?? 0),
      totalExecutions: parseInt(functionStatsRow?.total_executions ?? 0),
      recentErrors: parseInt(executionStatsRow?.recent_errors ?? 0),
      avgResponseTime: executionStatsRow?.avg_response_time ?? 0,
      successRate: executionStatsRow?.success_rate ?? 100,
    }

    res.status(200).json(createResponse(true, stats, 'Statistics retrieved'))

  } catch (error) {
    console.error('Stats error:', error)
    res.status(500).json(createResponse(false, null, 'Failed to fetch statistics', 500))
  }
}

export default withAuthAndMethods(['GET'])(handler)