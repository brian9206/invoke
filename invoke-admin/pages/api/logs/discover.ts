import { withAuthAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import { proxyToLogger } from '@/lib/logger-proxy'

async function handler(req: AuthenticatedRequest, res: any) {
  const projectId = req.query.projectId as string

  if (projectId && projectId !== 'system') {
    const userProjects = await getUserProjects(req.user!.id)
    const hasAccess = req.user?.isAdmin || userProjects.some((p: any) => p.id === projectId)
    if (!hasAccess) {
      return res.status(403).json(createResponse(false, null, 'Access denied', 403))
    }
  }

  const result = await proxyToLogger('/logs/fields/discover', {
    query: { projectId },
  })

  res.status(result.status).json(createResponse(result.success, result.data, result.message ?? undefined))
}

export default withAuthAndMethods(['GET'])(handler)
