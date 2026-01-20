import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const { hashPassword, verifyPassword, createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    await database.connect()

    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json(createResponse(false, null, 'Username and password are required', 400))
    }

    // Find user in database
    const result = await database.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [username]
    )

    if (result.rows.length === 0) {
      return res.status(401).json(createResponse(false, null, 'Invalid credentials', 401))
    }

    const user = result.rows[0]

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash)
    
    if (!isValidPassword) {
      return res.status(401).json(createResponse(false, null, 'Invalid credentials', 401))
    }


    // If not admin, check project membership
    if (!user.is_admin) {
      // Import getUserProjects dynamically to avoid circular dependency
      const { getUserProjects } = require('@/lib/middleware')
      const userProjects = await getUserProjects(user.id)
      if (!userProjects || userProjects.length === 0) {
        return res.status(403).json(createResponse(false, null, 'Access denied: You are not a member of any project. Please contact your system administrator.', 403))
      }
    }

    // Update last login
    await database.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    )

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        email: user.email,
        isAdmin: user.is_admin 
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '7d' }
    )

    // Return user data and token
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.is_admin
    }

    res.status(200).json(createResponse(true, {
      user: userData,
      token
    }, 'Login successful'))

  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}