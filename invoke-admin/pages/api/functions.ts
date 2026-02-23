import { withAuthOrApiKeyAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
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
    // Create function metadata (code uploaded separately via versions endpoint)
    const { name, description, project_id, requires_api_key } = req.body

    if (!name || !project_id) {
      return res.status(400).json(createResponse(false, null, 'Name and project_id are required', 400))
    }

    // Check project access for non-admins
    if (!req.user?.isAdmin) {
      const userProjects = await getUserProjects(req.user!.id)
      const hasAccess = userProjects.some(p => p.id === project_id)
      if (!hasAccess) {
        return res.status(403).json(createResponse(false, null, 'Access denied to this project', 403))
      }
    }

    // Check if function name already exists
    const existingResult = await database.query(
      'SELECT id FROM functions WHERE name = $1',
      [name]
    )

    if (existingResult.rows.length > 0) {
      return res.status(409).json(createResponse(false, null, `Function with name "${name}" already exists`, 409))
    }

    // Generate function ID and API key if needed
    const { v4: uuidv4 } = require('uuid')
    const { generateApiKey } = require('@/lib/utils')
    
    const functionId = uuidv4()
    const apiKey = requires_api_key ? generateApiKey() : null

    // Create function
    const result = await database.query(`
      INSERT INTO functions (
        id, name, description, deployed_by, requires_api_key, api_key, is_active, project_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, description, requires_api_key, api_key, is_active, project_id, created_at
    `, [
      functionId,
      name,
      description || '',
      req.user!.id,
      requires_api_key || false,
      apiKey,
      false, // Not active until code is uploaded
      project_id
    ])

    return res.status(201).json(createResponse(true, result.rows[0], 'Function created successfully', 201))
  }
}

export default withAuthOrApiKeyAndMethods(['GET', 'POST'])(handler)