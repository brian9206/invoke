import { QueryTypes } from 'sequelize'
import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

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
    let whereClause = ''
    let queryParams: any[] = []
    if (projectId && projectId !== 'system') {
      whereClause = 'AND f.project_id = $1'
      queryParams = [projectId]
    }
    
    // Get recent execution activity
    const recentRows = await database.sequelize.query(`
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
      ${whereClause}
      ORDER BY el.executed_at DESC
      LIMIT 10
    `, { bind: queryParams, type: QueryTypes.SELECT }) as any[];

    const recentActivity = recentRows.map(row => ({
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