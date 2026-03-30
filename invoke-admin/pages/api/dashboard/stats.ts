import { NextApiResponse } from 'next'
import { fn, col, literal } from 'sequelize'
import { withAuthAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import { proxyToLogger } from '@/lib/logger-proxy'

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

    // Function statistics come from the app DB
    const functionStatsRow: any = await database.models.Function.findOne({
      attributes: [
        [fn('COUNT', col('id')), 'total_functions'],
        [literal(`COUNT(*) FILTER (WHERE is_active = true)`), 'active_functions'],
        [fn('SUM', col('execution_count')), 'total_executions'],
      ],
      where: fnWhere,
      raw: true,
    })

    // Execution stats come from the logger service
    const logStatsResult = await proxyToLogger<any>('/stats', {
      query: { projectId },
    })
    const logStats = logStatsResult.data ?? {}

    const stats = {
      totalFunctions: parseInt(functionStatsRow?.total_functions ?? 0),
      activeFunctions: parseInt(functionStatsRow?.active_functions ?? 0),
      totalExecutions: parseInt(functionStatsRow?.total_executions ?? 0),
      recentErrors: parseInt(logStats.recentErrors ?? 0),
      avgResponseTime: logStats.avgResponseTime ?? 0,
      successRate: logStats.successRate ?? 0,
    }

    res.status(200).json(createResponse(true, stats, 'Statistics retrieved'))

  } catch (error) {
    console.error('Stats error:', error)
    res.status(500).json(createResponse(false, null, 'Failed to fetch statistics', 500))
  }
}

export default withAuthAndMethods(['GET'])(handler)
