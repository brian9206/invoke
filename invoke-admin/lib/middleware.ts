import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const { createResponse } = require('./utils')
const database = require('./database')

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