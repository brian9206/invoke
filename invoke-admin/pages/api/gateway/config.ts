import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: any) {
  const projectId = req.query.projectId as string

  if (!projectId) {
    return res.status(400).json(createResponse(false, null, 'projectId query parameter is required', 400))
  }

  const userId = req.user!.id
  const isAdmin = req.user!.isAdmin

  // Check project access
  const access = await checkProjectAccess(userId, projectId, isAdmin)
  if (!access.allowed) {
    return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
  }

  if (req.method === 'GET') {
    const result = await database.query(
      `SELECT id, project_id, enabled, custom_domain, created_at, updated_at
       FROM api_gateway_configs
       WHERE project_id = $1`,
      [projectId]
    )

    if (result.rows.length === 0) {
      // Return default (not yet configured)
      return res.json(createResponse(true, { enabled: false, customDomain: null }, 'Gateway config retrieved'))
    }

    const row = result.rows[0]
    return res.json(createResponse(true, {
      id: row.id,
      enabled: row.enabled,
      customDomain: row.custom_domain,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }, 'Gateway config retrieved'))
  }

  if (req.method === 'PUT') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    const { enabled, customDomain } = req.body

    // Validate custom domain uniqueness if provided
    if (customDomain) {
      const existing = await database.query(
        `SELECT id FROM api_gateway_configs WHERE custom_domain = $1 AND project_id != $2`,
        [customDomain, projectId]
      )
      if (existing.rows.length > 0) {
        return res.status(409).json(createResponse(false, null, 'Custom domain is already in use by another project', 409))
      }
    }

    const result = await database.query(
      `INSERT INTO api_gateway_configs (project_id, enabled, custom_domain)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id) DO UPDATE
         SET enabled = EXCLUDED.enabled,
             custom_domain = EXCLUDED.custom_domain,
             updated_at = NOW()
       RETURNING id, project_id, enabled, custom_domain, created_at, updated_at`,
      [projectId, enabled ?? false, customDomain || null]
    )

    const row = result.rows[0]
    return res.json(createResponse(true, {
      id: row.id,
      enabled: row.enabled,
      customDomain: row.custom_domain,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }, 'Gateway config updated'))
  }
}

export default withAuthAndMethods(['GET', 'PUT'])(handler)
