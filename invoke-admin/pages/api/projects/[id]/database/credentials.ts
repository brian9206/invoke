import { NextApiResponse } from 'next'
import { AuthenticatedRequest, withAuth } from '@/lib/middleware'
import { checkProjectOwnerAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import { getProjectDatabaseCredentials } from '@/lib/sql-service-client'

/**
 * Get database credentials for a project.
 * GET /api/projects/[id]/database/credentials
 *
 * Restricted to project owners and admins.
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

    // Only owners/admins can view credentials
    const access = await checkProjectOwnerAccess(req.user!.id, projectId, req.user!.isAdmin)
    if (!access.allowed) {
      return res.status(403).json(createResponse(false, null, access.message, 403))
    }

    const result = await getProjectDatabaseCredentials(projectId)
    if (!result.ok) {
      return res
        .status(result.status || 500)
        .json(createResponse(false, null, result.message || 'Failed to fetch credentials', result.status || 500))
    }

    return res.status(200).json(createResponse(true, result.data as any))
  } catch (error) {
    console.error('Database credentials API error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuth(handler)
