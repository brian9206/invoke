import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const database = require('@/lib/database')
const { createResponse } = require('@/lib/utils')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    // Verify JWT token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(createResponse(false, null, 'Unauthorized', 401))
    }

    const token = authHeader.substring(7)
    let decoded: any

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret')
    } catch (error) {
      return res.status(401).json(createResponse(false, null, 'Invalid or expired token', 401))
    }

    const userId = decoded.userId
    const { email } = req.body

    // Validate input
    if (!email) {
      return res.status(400).json(createResponse(
        false, 
        null, 
        'Email is required', 
        400
      ))
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json(createResponse(
        false,
        null,
        'Invalid email format',
        400
      ))
    }

    await database.connect()

    // Check if email is already used by another user
    const existingEmail = await database.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, userId]
    )

    if (existingEmail.rows.length > 0) {
      return res.status(409).json(createResponse(
        false,
        null,
        'Email is already in use by another account',
        409
      ))
    }

    // Update email in database
    const result = await database.query(
      'UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2 RETURNING username, email',
      [email, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json(createResponse(false, null, 'User not found', 404))
    }

    const user = result.rows[0]

    res.status(200).json(createResponse(
      true, 
      { username: user.username, email: user.email }, 
      'Email updated successfully'
    ))

  } catch (error: any) {
    console.error('Change email error:', error)
    res.status(500).json(createResponse(
      false, 
      null, 
      'Failed to update email: ' + error.message, 
      500
    ))
  }
}
