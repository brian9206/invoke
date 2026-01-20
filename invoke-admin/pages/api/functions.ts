import { withAuthAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: any) {
  if (req.method === 'GET') {
    const { projectId } = req.query
    let query: string
    let params: any[] = []
    // If admin and projectId is 'system', show all functions (no filtering)
    if (req.user?.isAdmin && (projectId === 'system' || !projectId)) {
      query = `
        SELECT 
          f.*,
          fv.version as active_version,
          fv.file_size,
          u.username as deployed_by_username,
          p.name as project_name
        FROM functions f
        LEFT JOIN function_versions fv ON f.active_version_id = fv.id
        LEFT JOIN users u ON f.deployed_by = u.id
        LEFT JOIN projects p ON f.project_id = p.id
        ORDER BY f.created_at DESC
      `
    } else {
      // Regular users or project-specific query
      let projectIds: string[] = []
      if (projectId && projectId !== 'system') {
        // Specific project requested - verify access
        const userProjects = await getUserProjects(req.user!.id)
        const hasAccess = req.user?.isAdmin || userProjects.some(p => p.id === projectId)
        if (!hasAccess) {
          return res.status(403).json(createResponse(false, null, 'Access denied to this project', 403))
        }
        projectIds = [projectId as string]
      } else {
        // Get all user's projects
        const userProjects = await getUserProjects(req.user!.id)
        projectIds = userProjects.map(p => p.id)
      }
      if (projectIds.length === 0) {
        return res.status(200).json(createResponse(true, [], 'No functions found'))
      }
      query = `
        SELECT 
          f.*,
          fv.version as active_version,
          fv.file_size,
          u.username as deployed_by_username,
          p.name as project_name,
          pm.role as user_role
        FROM functions f
        LEFT JOIN function_versions fv ON f.active_version_id = fv.id
        LEFT JOIN users u ON f.deployed_by = u.id
        LEFT JOIN projects p ON f.project_id = p.id
        LEFT JOIN project_memberships pm ON p.id = pm.project_id AND pm.user_id = $1
        WHERE f.project_id = ANY($2)
        ORDER BY f.created_at DESC
      `
      params = [req.user!.id, projectIds]
    }
    const result = await database.query(query, params)

    return res.status(200).json(createResponse(true, result.rows, 'Functions retrieved successfully'))

  } else if (req.method === 'POST') {
    // This would be handled by the upload endpoint
    return res.status(405).json(createResponse(false, null, 'Use /api/functions/upload for file uploads', 405))
  }
}

export default withAuthAndMethods(['GET', 'POST'])(handler)