import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const { createResponse } = require('../../../lib/utils')
const database = require('../../../lib/database')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

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
      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.is_admin
      }

      res.status(200).json(createResponse(true, userData, 'User authenticated'))

    } catch (jwtError) {
      return res.status(401).json(createResponse(false, null, 'Invalid token', 401))
    }

  } catch (error) {
    console.error('Auth check error:', error)
    res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}