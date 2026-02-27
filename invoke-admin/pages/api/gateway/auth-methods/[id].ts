import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

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
  const { id } = req.query as { id: string }
  const projectId = req.query.projectId as string

  if (!id) {
    return res.status(400).json(createResponse(false, null, 'Auth method ID is required', 400))
  }
  if (!projectId) {
    return res.status(400).json(createResponse(false, null, 'projectId query parameter is required', 400))
  }

  const userId = req.user!.id
  const isAdmin = req.user!.isAdmin

  const access = await checkProjectAccess(userId, projectId, isAdmin)
  if (!access.allowed) {
    return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
  }

  // Verify auth method belongs to this project
  const ownerCheck = await database.query(
    `SELECT am.id FROM api_gateway_auth_methods am
     JOIN api_gateway_configs gc ON gc.id = am.gateway_config_id
     WHERE am.id = $1 AND gc.project_id = $2`,
    [id, projectId]
  )
  if (ownerCheck.rows.length === 0) {
    return res.status(404).json(createResponse(false, null, 'Auth method not found', 404))
  }

  if (req.method === 'GET') {
    const result = await database.query(
      `SELECT id, name, type, config, created_at, updated_at
       FROM api_gateway_auth_methods WHERE id = $1`,
      [id]
    )
    const row = result.rows[0]
    return res.json(createResponse(true, {
      id: row.id,
      name: row.name,
      type: row.type,
      config: row.config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }, 'Auth method retrieved'))
  }

  if (req.method === 'PUT') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    const { name, type, config } = req.body

    // Get current values for partial update
    const current = await database.query(
      `SELECT name, type, config FROM api_gateway_auth_methods WHERE id = $1`,
      [id]
    )
    const cur = current.rows[0]

    const newName = name !== undefined ? (typeof name === 'string' ? name.trim() : null) : cur.name
    const newType = type !== undefined ? type : cur.type
    const newConfig = config !== undefined ? config : cur.config

    if (!newName) {
      return res.status(400).json(createResponse(false, null, 'name cannot be empty', 400))
    }
    if (!['basic_auth', 'bearer_jwt', 'api_key', 'middleware'].includes(newType)) {
      return res.status(400).json(createResponse(false, null, 'type must be basic_auth, bearer_jwt, api_key, or middleware', 400))
    }
    const configError = validateConfig(newType, newConfig)
    if (configError) {
      return res.status(400).json(createResponse(false, null, `Invalid config: ${configError}`, 400))
    }

    await database.query(
      `UPDATE api_gateway_auth_methods
       SET name = $1, type = $2, config = $3, updated_at = NOW()
       WHERE id = $4`,
      [newName, newType, JSON.stringify(newConfig), id]
    )

    return res.json(createResponse(true, null, 'Auth method updated'))
  }

  if (req.method === 'DELETE') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    await database.query('DELETE FROM api_gateway_auth_methods WHERE id = $1', [id])
    return res.json(createResponse(true, null, 'Auth method deleted'))
  }
}

export default withAuthAndMethods(['GET', 'PUT', 'DELETE'])(handler)
