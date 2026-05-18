import { NextApiResponse } from 'next'
import { AuthenticatedRequest, withAuth } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import { getProjectDatabaseStatus } from '@/lib/sql-service-client'

/**
 * Get database status for a project.
 * GET /api/projects/[id]/database/status
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    const { id: projectId } = req.query

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Project ID is required', 400))
    }

    if (projectId === 'system') {
      return res.status(403).json(createResponse(false, null, 'SQL database not available for system project', 403))
    }

    const hasAccess = await checkProjectAccess(req.user!.id, projectId, req.user!.isAdmin)
    if (!hasAccess.allowed) {
      return res.status(403).json(createResponse(false, null, hasAccess.message, 403))
    }

    const result = await getProjectDatabaseStatus(projectId)
    if (!result.ok) {
      return res
        .status(result.status || 500)
        .json(createResponse(false, null, result.message || 'Failed to fetch database status', result.status || 500))
    }

    return res.status(200).json(createResponse(true, result.data as any))
  } catch (error) {
    console.error('Database status API error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuth(handler)
