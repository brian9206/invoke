import { Op } from 'sequelize'
import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const projectId = req.query.projectId as string
    
    // Verify project access
    if (projectId && projectId !== 'system') {
      const userProjects = await getUserProjects(req.user!.id)
      const hasAccess = req.user?.isAdmin || userProjects.some(p => p.id === projectId)
      if (!hasAccess) {
        return res.status(403).json(createResponse(false, null, 'Access denied to this project', 403))
      }
    }
    // Build WHERE clause for project filter
    // (project filter is now applied via Sequelize include below)
    
    // Get recent execution activity
    const { ExecutionLog, Function: FunctionModel } = database.models
    const functionWhere = (projectId && projectId !== 'system') ? { project_id: projectId } : undefined
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentLogs = await ExecutionLog.findAll({
      where: { executed_at: { [Op.gt]: oneHourAgo } },
      attributes: ['id', 'status_code', 'execution_time_ms', 'executed_at'],
      include: [{
        model: FunctionModel,
        attributes: ['id', 'name'],
        where: functionWhere,
        required: !!functionWhere,
      }],
      order: [['executed_at', 'DESC']],
      limit: 10,
    }) as any[]

    const recentActivity = recentLogs.map((log: any) => {
      const raw = log.toJSON()
      return {
        id: raw.id.toString(),
        functionId: raw.Function?.id,
        functionName: raw.Function?.name,
        status: raw.status_code < 400 ? 'success' : 'error',
        executionTime: raw.execution_time_ms,
        executedAt: raw.executed_at instanceof Date ? raw.executed_at.toISOString() : raw.executed_at,
      }
    })

    res.status(200).json(createResponse(true, recentActivity, 'Recent activity retrieved'))

  } catch (error) {
    console.error('Recent activity error:', error)
    res.status(500).json(createResponse(false, null, 'Failed to fetch recent activity', 500))
  }
}

export default withAuthAndMethods(['GET'])(handler)