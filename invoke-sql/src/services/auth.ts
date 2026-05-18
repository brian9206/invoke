import crypto from 'crypto'
import { IncomingMessage } from 'http'
import database from './database'

export interface AuthResult {
  authenticated: boolean
  userId?: number
  projectId?: string
  error?: string
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

/**
 * Authenticate a WebSocket upgrade request using API key.
 * Expects:
 *   - Authorization: Bearer <api_key> OR X-API-Key header
 *   - X-Project-Id header
 */
export async function authenticateWsRequest(req: IncomingMessage): Promise<AuthResult> {
  const authHeader = req.headers.authorization
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined
  const projectId = req.headers['x-project-id'] as string | undefined

  if (!projectId) {
    return { authenticated: false, error: 'X-Project-Id header is required' }
  }

  // Extract API key
  let apiKey: string | null = null
  if (apiKeyHeader) {
    apiKey = apiKeyHeader
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7)
  }

  if (!apiKey) {
    return { authenticated: false, error: 'API key required (X-API-Key or Authorization: Bearer)' }
  }

  try {
    const keyHash = hashApiKey(apiKey)
    const { ApiKey, User, ProjectMembership } = database.models

    // Align with invoke-admin: include creator association instead of selecting user_id directly
    const apiKeyRecord = await ApiKey.findOne({
      where: { key_hash: keyHash, is_active: true },
      include: [{ model: User, as: 'creator', attributes: ['id', 'is_admin'] }]
    })

    if (!apiKeyRecord) {
      return { authenticated: false, error: 'Invalid API key' }
    }

    const userId: number = apiKeyRecord.creator.id
    const isAdmin: boolean = apiKeyRecord.creator.is_admin

    // If not admin, verify user has access to the project
    if (!isAdmin) {
      const membership = await ProjectMembership.findOne({
        where: { user_id: userId, project_id: projectId },
        attributes: ['role']
      })

      if (!membership) {
        return { authenticated: false, error: 'Not a member of this project' }
      }
    }

    // Update API key usage (align with invoke-admin)
    await apiKeyRecord.update({
      last_used: new Date(),
      usage_count: database.sequelize.literal('usage_count + 1')
    })

    return { authenticated: true, userId, projectId }
  } catch (err) {
    console.error('[Auth] Error:', err)
    return { authenticated: false, error: 'Authentication failed' }
  }
}
