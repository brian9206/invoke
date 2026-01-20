import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const { createResponse } = require('@/lib/utils')
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

// Auth-only middleware for routes with special requirements (like multer)
export async function authenticate(req: AuthenticatedRequest): Promise<{ success: boolean, user?: any, error?: string }> {
  try {
    await database.connect()

    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, error: 'No token provided' }
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
        return { success: false, error: 'User not found' }
      }

      const user = result.rows[0]
      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.is_admin
      }

      return { success: true, user: userData }

    } catch (jwtError) {
      return { success: false, error: 'Invalid token' }
    }

  } catch (error) {
    console.error('Auth middleware error:', error)
    return { success: false, error: 'Internal server error' }
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

export function hasProjectAccess(role: string, requiredLevel: 'viewer' | 'editor' | 'owner'): boolean {
  const roleHierarchy = { viewer: 0, editor: 1, owner: 2 }
  return roleHierarchy[role as keyof typeof roleHierarchy] >= roleHierarchy[requiredLevel]
}

// Project-scoped middleware for function operations
export function withProjectAccess(requiredRole: 'viewer' | 'editor' | 'owner' = 'viewer') {
  return function (handler: NextApiHandler) {
    return withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
      // Admin users bypass project restrictions
      if (req.user?.isAdmin) {
        return handler(req, res)
      }

      const { projectId } = req.query || req.body
      
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