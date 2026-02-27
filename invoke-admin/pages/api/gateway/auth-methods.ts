import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

// ─── Config validation ────────────────────────────────────────────────────────

function validateConfig(type: string, config: any): string | null {
  if (!config || typeof config !== 'object') return 'config must be an object'

  if (type === 'basic_auth') {
    if (!Array.isArray(config.credentials)) return 'basic_auth config requires credentials array'
    for (const cred of config.credentials) {
      if (!cred.username || typeof cred.username !== 'string') return 'each credential must have a username'
      if (!cred.password || typeof cred.password !== 'string') return 'each credential must have a password'
    }
  } else if (type === 'bearer_jwt') {
    if (!config.jwtSecret || typeof config.jwtSecret !== 'string') return 'bearer_jwt config requires jwtSecret string'
  } else if (type === 'api_key') {
    if (!Array.isArray(config.apiKeys)) return 'api_key config requires apiKeys array'
    for (const key of config.apiKeys) {
      if (typeof key !== 'string' || !key.trim()) return 'each apiKey must be a non-empty string'
    }
  } else if (type === 'middleware') {
    if (!config.functionId || typeof config.functionId !== 'string' || !config.functionId.trim())
      return 'middleware config requires a non-empty functionId string'
  } else {
    return `unknown type: ${type}`
  }
  return null
}

async function handler(req: AuthenticatedRequest, res: any) {
  const projectId = req.query.projectId as string

  if (!projectId) {
    return res.status(400).json(createResponse(false, null, 'projectId query parameter is required', 400))
  }

  const userId = req.user!.id
  const isAdmin = req.user!.isAdmin

  const access = await checkProjectAccess(userId, projectId, isAdmin)
  if (!access.allowed) {
    return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
  }

  if (req.method === 'GET') {
    // Ensure gateway config exists; return empty array if not
    const cfgResult = await database.query(
      `SELECT id FROM api_gateway_configs WHERE project_id = $1`,
      [projectId]
    )
    if (cfgResult.rows.length === 0) {
      return res.json(createResponse(true, [], 'No auth methods found'))
    }
    const configId = cfgResult.rows[0].id

    const result = await database.query(
      `SELECT id, name, type, config, created_at, updated_at
       FROM api_gateway_auth_methods
       WHERE gateway_config_id = $1
       ORDER BY created_at ASC`,
      [configId]
    )

    return res.json(createResponse(true, result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      config: r.config,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })), 'Auth methods retrieved'))
  }

  if (req.method === 'POST') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    const { name, type, config } = req.body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json(createResponse(false, null, 'name is required', 400))
    }
    if (!['basic_auth', 'bearer_jwt', 'api_key', 'middleware'].includes(type)) {
      return res.status(400).json(createResponse(false, null, 'type must be basic_auth, bearer_jwt, api_key, or middleware', 400))
    }
    const configError = validateConfig(type, config)
    if (configError) {
      return res.status(400).json(createResponse(false, null, `Invalid config: ${configError}`, 400))
    }

    // Auto-create gateway config if it doesn't exist
    const cfgResult = await database.query(
      `INSERT INTO api_gateway_configs (project_id, enabled)
       VALUES ($1, false)
       ON CONFLICT (project_id) DO UPDATE SET project_id = EXCLUDED.project_id
       RETURNING id`,
      [projectId]
    )
    const configId = cfgResult.rows[0].id

    const result = await database.query(
      `INSERT INTO api_gateway_auth_methods (gateway_config_id, name, type, config)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, type, config, created_at, updated_at`,
      [configId, name.trim(), type, JSON.stringify(config)]
    )

    const row = result.rows[0]
    return res.status(201).json(createResponse(true, {
      id: row.id,
      name: row.name,
      type: row.type,
      config: row.config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }, 'Auth method created'))
  }
}

export default withAuthAndMethods(['GET', 'POST'])(handler)
