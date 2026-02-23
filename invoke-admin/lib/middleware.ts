import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const { createResponse, hashApiKey } = require('@/lib/utils')
const database = require('@/lib/database')

interface AuthenticatedRequest extends NextApiRequest {
  user?: {
    id: number
    username: string
    email: string
    isAdmin: boolean
  }
}

type NextApiHandler = (req: AuthenticatedRequest, res: NextApiResponse) => void | Promise<void>

// Authentication middleware
export function withAuth(handler: NextApiHandler, options?: { adminRequired?: boolean }) {
  return async (req: AuthenticatedRequest, res: NextApiResponse) => {
    try {
      await database.connect()

      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json(createResponse(false, null, 'No token provided', 401))
      }

      const token = authHeader.substring(7)
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any
        
        // Get fresh user data from database
        const result = await database.query(
          'SELECT id, username, email, is_admin FROM users WHERE id = $1',
          [decoded.userId]
        )

        if (result.rows.length === 0) {
          return res.status(401).json(createResponse(false, null, 'User not found', 401))
        }

        const user = result.rows[0]
        req.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          isAdmin: user.is_admin
        }

        // Check admin requirement if specified
        if (options?.adminRequired && !req.user.isAdmin) {
          return res.status(403).json(createResponse(false, null, 'Admin access required', 403))
        }

        return handler(req, res)

      } catch (jwtError) {
        return res.status(401).json(createResponse(false, null, 'Invalid token', 401))
      }

    } catch (error) {
      console.error('Auth middleware error:', error)
      res.status(500).json(createResponse(false, null, 'Internal server error', 500))
    }
  }
}

// Method validation middleware
export function withMethods(allowedMethods: string[]) {
  return function (handler: NextApiHandler) {
    return async (req: AuthenticatedRequest, res: NextApiResponse) => {
      if (!allowedMethods.includes(req.method || '')) {
        return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
      }
      return handler(req, res)
    }
  }
}

// Combine auth and method validation
export function withAuthAndMethods(allowedMethods: string[], authOptions?: { adminRequired?: boolean }) {
  return function (handler: NextApiHandler) {
    return withMethods(allowedMethods)(withAuth(handler, authOptions))
  }
}

// Combine auth-or-apikey and method validation
export function withAuthOrApiKeyAndMethods(allowedMethods: string[], authOptions?: { adminRequired?: boolean }) {
  return function (handler: NextApiHandler) {
    return withMethods(allowedMethods)(withAuthOrApiKey(handler, authOptions))
  }
}

// Auth-only middleware for routes with special requirements (like multer)
export async function authenticate(req: AuthenticatedRequest): Promise<{ success: boolean, user?: any, error?: string }> {
  try {
    await database.connect()

    const authHeader = req.headers.authorization
    const apiKeyHeader = req.headers['x-api-key'] as string

    // Try JWT authentication first
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any
        
        // Get fresh user data from database
        const result = await database.query(
          'SELECT id, username, email, is_admin FROM users WHERE id = $1',
          [decoded.userId]
        )

        if (result.rows.length > 0) {
          const user = result.rows[0]
          const userData = {
            id: user.id,
            username: user.username,
            email: user.email,
            isAdmin: user.is_admin
          }

          return { success: true, user: userData }
        }
      } catch (jwtError) {
        // JWT invalid, will try API key next
      }
    }

    // Try API key authentication
    let apiKey = null
    if (authHeader && authHeader.startsWith('Bearer ') && !apiKey) {
      // The bearer token might be an API key
      apiKey = authHeader.substring(7)
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader
    }

    if (apiKey) {
      const keyHash = hashApiKey(apiKey)
      
      const keyResult = await database.query(
        `SELECT ak.id, ak.created_by, ak.is_active, u.id as user_id, u.username, u.email, u.is_admin
         FROM api_keys ak
         JOIN users u ON ak.created_by = u.id
         WHERE ak.key_hash = $1 AND ak.is_active = true`,
        [keyHash]
      )

      if (keyResult.rows.length > 0) {
        const keyData = keyResult.rows[0]

        // Update API key usage
        await database.query(
          'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP, usage_count = usage_count + 1 WHERE id = $1',
          [keyData.id]
        )

        const userData = {
          id: keyData.user_id,
          username: keyData.username,
          email: keyData.email,
          isAdmin: keyData.is_admin
        }

        return { success: true, user: userData }
      }
    }

    return { success: false, error: 'No valid authentication provided' }

  } catch (error) {
    console.error('Auth middleware error:', error)
    return { success: false, error: 'Internal server error' }
  }
}

// API Key authentication middleware
export function withApiKeyAuth(handler: NextApiHandler) {
  return async (req: AuthenticatedRequest, res: NextApiResponse) => {
    try {
      await database.connect()

      // Check for API key in headers (Authorization: Bearer <key> or x-api-key: <key>)
      const authHeader = req.headers.authorization
      const apiKeyHeader = req.headers['x-api-key'] as string

      let apiKey = null
      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.substring(7)
      } else if (apiKeyHeader) {
        apiKey = apiKeyHeader
      }

      if (!apiKey) {
        return res.status(401).json(createResponse(false, null, 'API key required', 401))
      }

      // Hash the incoming API key and lookup in database
      const keyHash = hashApiKey(apiKey)
      
      const keyResult = await database.query(
        `SELECT ak.id, ak.created_by, ak.is_active, u.id as user_id, u.username, u.email, u.is_admin
         FROM api_keys ak
         JOIN users u ON ak.created_by = u.id
         WHERE ak.key_hash = $1`,
        [keyHash]
      )

      if (keyResult.rows.length === 0) {
        return res.status(401).json(createResponse(false, null, 'Invalid API key', 401))
      }

      const keyData = keyResult.rows[0]

      if (!keyData.is_active) {
        return res.status(401).json(createResponse(false, null, 'API key has been revoked', 401))
      }

      // Update last_used and usage_count
      await database.query(
        'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP, usage_count = usage_count + 1 WHERE id = $1',
        [keyData.id]
      )

      // Attach user data to request (same format as JWT auth)
      req.user = {
        id: keyData.user_id,
        username: keyData.username,
        email: keyData.email,
        isAdmin: keyData.is_admin
      }

      return handler(req, res)

    } catch (error) {
      console.error('API key auth middleware error:', error)
      res.status(500).json(createResponse(false, null, 'Internal server error', 500))
    }
  }
}

// Combined auth middleware - accepts either JWT or API key
export function withAuthOrApiKey(handler: NextApiHandler, options?: { adminRequired?: boolean }) {
  return async (req: AuthenticatedRequest, res: NextApiResponse) => {
    try {
      await database.connect()

      const authHeader = req.headers.authorization
      const apiKeyHeader = req.headers['x-api-key'] as string

      let authenticatedUser = null

      // Try JWT authentication first
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any
          
          const result = await database.query(
            'SELECT id, username, email, is_admin FROM users WHERE id = $1',
            [decoded.userId]
          )

          if (result.rows.length > 0) {
            const user = result.rows[0]
            authenticatedUser = {
              id: user.id,
              username: user.username,
              email: user.email,
              isAdmin: user.is_admin
            }
          }
        } catch (jwtError) {
          // JWT invalid, will try API key next
        }
      }

      // If JWT auth failed, try API key authentication
      if (!authenticatedUser) {
        let apiKey = null
        if (authHeader && authHeader.startsWith('Bearer ') && !authenticatedUser) {
          // The bearer token wasn't a valid JWT, might be an API key
          apiKey = authHeader.substring(7)
        } else if (apiKeyHeader) {
          apiKey = apiKeyHeader
        }

        if (apiKey) {
          const keyHash = hashApiKey(apiKey)
          
          const keyResult = await database.query(
            `SELECT ak.id, ak.created_by, ak.is_active, u.id as user_id, u.username, u.email, u.is_admin
             FROM api_keys ak
             JOIN users u ON ak.created_by = u.id
             WHERE ak.key_hash = $1 AND ak.is_active = true`,
            [keyHash]
          )

          if (keyResult.rows.length > 0) {
            const keyData = keyResult.rows[0]

            // Update API key usage
            await database.query(
              'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP, usage_count = usage_count + 1 WHERE id = $1',
              [keyData.id]
            )

            authenticatedUser = {
              id: keyData.user_id,
              username: keyData.username,
              email: keyData.email,
              isAdmin: keyData.is_admin
            }
          }
        }
      }

      // If neither authentication method worked
      if (!authenticatedUser) {
        return res.status(401).json(createResponse(false, null, 'Authentication required', 401))
      }

      req.user = authenticatedUser

      // Check admin requirement if specified
      if (options?.adminRequired && !req.user.isAdmin) {
        return res.status(403).json(createResponse(false, null, 'Admin access required', 403))
      }

      return handler(req, res)

    } catch (error) {
      console.error('Auth or API key middleware error:', error)
      res.status(500).json(createResponse(false, null, 'Internal server error', 500))
    }
  }
}

export type { AuthenticatedRequest }

// Project access control helpers
export async function getUserProjectRole(userId: number, projectId: string): Promise<string | null> {
  try {
    const result = await database.query(
      'SELECT role FROM project_memberships WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    )
    return result.rows.length > 0 ? result.rows[0].role : null
  } catch (error) {
    console.error('Error checking user project role:', error)
    return null
  }
}

export async function getUserProjects(userId: number): Promise<any[]> {
  try {
    // Check if user is admin
    const userResult = await database.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [userId]
    )
    
    const isAdmin = userResult.rows.length > 0 && userResult.rows[0].is_admin
    
    // Admin users get all projects with 'owner' role
    if (isAdmin) {
      const result = await database.query(`
        SELECT p.id, p.name, p.description, 'owner' as role
        FROM projects p
        WHERE p.is_active = true
        ORDER BY p.name
      `)
      return result.rows
    }
    
    // Regular users get only their assigned projects
    const result = await database.query(`
      SELECT p.id, p.name, p.description, pm.role
      FROM projects p
      JOIN project_memberships pm ON p.id = pm.project_id
      WHERE pm.user_id = $1 AND p.is_active = true
      ORDER BY p.name
    `, [userId])
    return result.rows
  } catch (error) {
    console.error('Error getting user projects:', error)
    return []
  }
}

export function hasProjectAccess(role: string, requiredLevel: 'developer' | 'owner'): boolean {
  const roleHierarchy = { developer: 0, owner: 1 }
  return roleHierarchy[role as keyof typeof roleHierarchy] >= roleHierarchy[requiredLevel]
}

// Project-scoped middleware for function operations
export function withProjectAccess(requiredRole: 'developer' | 'owner' = 'developer') {
  return function (handler: NextApiHandler) {
    return withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
      // Admin users bypass project restrictions
      if (req.user?.isAdmin) {
        return handler(req, res)
      }

      const projectId = req.query?.projectId || req.body?.projectId
      
      if (!projectId) {
        return res.status(400).json(createResponse(false, null, 'Project ID is required', 400))
      }

      const userRole = await getUserProjectRole(req.user!.id, projectId as string)
      
      if (!userRole) {
        return res.status(403).json(createResponse(false, null, 'Access denied: not a member of this project', 403))
      }

      if (!hasProjectAccess(userRole, requiredRole)) {
        return res.status(403).json(createResponse(false, null, `Access denied: ${requiredRole} role required`, 403))
      }

      return handler(req, res)
    })
  }
}

// Admin-only middleware (simplified alias)
export function adminRequired(handler: NextApiHandler) {
  return withAuth(handler, { adminRequired: true })
}