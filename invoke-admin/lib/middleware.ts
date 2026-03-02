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
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json(createResponse(false, null, 'No token provided', 401))
      }

      const token = authHeader.substring(7)
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any
        
        // Get fresh user data from database
        const { User } = database.models
        const user = await User.findByPk(decoded.userId, {
          attributes: ['id', 'username', 'email', 'is_admin'],
        })

        if (!user) {
          return res.status(401).json(createResponse(false, null, 'User not found', 401))
        }

        req.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          isAdmin: user.is_admin,
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
    const authHeader = req.headers.authorization
    const apiKeyHeader = req.headers['x-api-key'] as string

    // Try JWT authentication first
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any
        
        // Get fresh user data from database
        const { User } = database.models
        const jwtUser = await User.findByPk(decoded.userId, {
          attributes: ['id', 'username', 'email', 'is_admin'],
        })

        if (jwtUser) {
          return { success: true, user: { id: jwtUser.id, username: jwtUser.username, email: jwtUser.email, isAdmin: jwtUser.is_admin } }
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
      
      const { ApiKey, User: UserModel } = database.models
      const apiKeyRecord = await ApiKey.findOne({
        where: { key_hash: keyHash, is_active: true },
        include: [{ model: UserModel, as: 'creator', attributes: ['id', 'username', 'email', 'is_admin'] }],
      })

      if (apiKeyRecord) {
        // Update API key usage
        await apiKeyRecord.update({
          last_used: new Date(),
          usage_count: database.sequelize.literal('usage_count + 1'),
        })

        const u = apiKeyRecord.creator
        return { success: true, user: { id: u.id, username: u.username, email: u.email, isAdmin: u.is_admin } }
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
      
      const { ApiKey, User: UserModel } = database.models
      const apiKeyRecord = await ApiKey.findOne({
        where: { key_hash: keyHash },
        include: [{ model: UserModel, as: 'creator', attributes: ['id', 'username', 'email', 'is_admin'] }],
      })

      if (!apiKeyRecord) {
        return res.status(401).json(createResponse(false, null, 'Invalid API key', 401))
      }

      if (!apiKeyRecord.is_active) {
        return res.status(401).json(createResponse(false, null, 'API key has been revoked', 401))
      }

      // Update last_used and usage_count
      await apiKeyRecord.update({
        last_used: new Date(),
        usage_count: database.sequelize.literal('usage_count + 1'),
      })

      const keyUser = apiKeyRecord.creator
      // Attach user data to request (same format as JWT auth)
      req.user = {
        id: keyUser.id,
        username: keyUser.username,
        email: keyUser.email,
        isAdmin: keyUser.is_admin,
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
      const authHeader = req.headers.authorization
      const apiKeyHeader = req.headers['x-api-key'] as string

      let authenticatedUser = null

      // Try JWT authentication first
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any
          
          const { User } = database.models
          const jwtUser = await User.findByPk(decoded.userId, {
            attributes: ['id', 'username', 'email', 'is_admin'],
          })

          if (jwtUser) {
            authenticatedUser = {
              id: jwtUser.id,
              username: jwtUser.username,
              email: jwtUser.email,
              isAdmin: jwtUser.is_admin,
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
          
          const { ApiKey, User: UserModel } = database.models
          const apiKeyRecord = await ApiKey.findOne({
            where: { key_hash: keyHash, is_active: true },
            include: [{ model: UserModel, as: 'creator', attributes: ['id', 'username', 'email', 'is_admin'] }],
          })

          if (apiKeyRecord) {
            // Update API key usage
            await apiKeyRecord.update({
              last_used: new Date(),
              usage_count: database.sequelize.literal('usage_count + 1'),
            })

            const keyUser = apiKeyRecord.creator
            authenticatedUser = {
              id: keyUser.id,
              username: keyUser.username,
              email: keyUser.email,
              isAdmin: keyUser.is_admin,
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
    const { ProjectMembership } = database.models
    const membership = await ProjectMembership.findOne({
      where: { user_id: userId, project_id: projectId },
      attributes: ['role'],
    })
    return membership ? membership.role : null
  } catch (error) {
    console.error('Error checking user project role:', error)
    return null
  }
}

export async function getUserProjects(userId: number): Promise<any[]> {
  try {
    const { User, Project, ProjectMembership } = database.models
    const userRecord = await User.findByPk(userId, { attributes: ['is_admin'] })
    const isAdmin = userRecord?.is_admin || false

    if (isAdmin) {
      // Admin users get all projects with 'owner' role
      const projects = await Project.findAll({
        where: { is_active: true },
        attributes: ['id', 'name', 'description', 'slug'],
        order: [['name', 'ASC']],
      })
      return projects.map((p: any) => ({ ...p.get({ plain: true }), role: 'owner' }))
    }

    // Regular users get only their assigned projects
    const memberships = await ProjectMembership.findAll({
      where: { user_id: userId },
      include: [{
        model: Project,
        required: true,
        where: { is_active: true },
        attributes: ['id', 'name', 'description', 'slug'],
      }],
      attributes: ['role'],
    })
    return memberships.map((m: any) => ({
      id: m.Project.id,
      name: m.Project.name,
      description: m.Project.description,
      slug: m.Project.slug,
      role: m.role,
    }))
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