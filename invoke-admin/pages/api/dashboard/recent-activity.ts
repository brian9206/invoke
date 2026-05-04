import { NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import { proxyToLogger } from '@/lib/logger-proxy'

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

    const result = await proxyToLogger('/recent-activity', {
      query: { projectId }
    })

    res.status(result.status).json(createResponse(result.success, result.data, result.message ?? undefined))
  } catch (error) {
    console.error('Recent activity error:', error)
    res.status(500).json(createResponse(false, null, 'Failed to fetch recent activity', 500))
  }
}

export default withAuthAndMethods(['GET'])(handler)
