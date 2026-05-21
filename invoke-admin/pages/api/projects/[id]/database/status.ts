import { NextApiResponse } from 'next'
import { AuthenticatedRequest, withAuth } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
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

    const { Project } = database.models
    const project = await Project.findByPk(projectId, { attributes: ['sql_storage_limit_bytes'] })
    if (!project) {
      return res.status(404).json(createResponse(false, null, 'Project not found', 404))
    }

    const result = await getProjectDatabaseStatus(projectId)
    if (!result.ok) {
      return res
        .status(result.status || 500)
        .json(createResponse(false, null, result.message || 'Failed to fetch database status', result.status || 500))
    }

    const configuredLimit = parseInt(project.sql_storage_limit_bytes, 10) || 1073741824
    const payload =
      result.data && typeof result.data === 'object' ? { ...(result.data as Record<string, unknown>) } : {}

    if (payload.initialized === false) {
      payload.configured_storage_limit_bytes = configuredLimit
    }

    return res.status(200).json(createResponse(true, payload as any))
  } catch (error) {
    console.error('Database status API error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuth(handler)
