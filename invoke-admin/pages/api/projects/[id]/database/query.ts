import { NextApiResponse } from 'next'
import { AuthenticatedRequest, withAuth } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import { executeProjectQuery } from '@/lib/sql-service-client'

/**
 * Execute SQL query against a project's database.
 * POST /api/projects/[id]/database/query
 * Body: { sql: string }
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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

    // Check project access (write access required)
    const hasAccess = await checkProjectAccess(req.user!.id, projectId, req.user!.isAdmin)
    if (!hasAccess.allowed) {
      return res.status(403).json(createResponse(false, null, hasAccess.message, 403))
    }
    if (!hasAccess.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Developer or owner role required', 403))
    }

    const { sql, sessionContext } = req.body || {}
    if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
      return res.status(400).json(createResponse(false, null, 'SQL query is required', 400))
    }

    const result = await executeProjectQuery(projectId, sql, sessionContext)
    if (!result.ok) {
      return res
        .status(result.status || 500)
        .json(createResponse(false, null, result.message || 'Query execution failed', result.status || 500))
    }

    return res.status(200).json(createResponse(true, result.data as any))
  } catch (error) {
    console.error('Database query API error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuth(handler)
