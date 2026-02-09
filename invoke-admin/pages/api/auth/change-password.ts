import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const bcrypt = require('bcrypt')
const database = require('@/lib/database')
const { createResponse, validatePasswordStrength } = require('@/lib/utils')

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
    const { currentPassword, newPassword } = req.body

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json(createResponse(
        false, 
        null, 
        'Current password and new password are required', 
        400
      ))
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword)
    if (!passwordValidation.success) {
      return res.status(400).json(createResponse(
        false,
        { score: passwordValidation.score },
        passwordValidation.feedback,
        400
      ))
    }

    await database.connect()

    // Get current user from database
    const userResult = await database.query(
      'SELECT id, username, password_hash FROM users WHERE id = $1',
      [userId]
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json(createResponse(false, null, 'User not found', 404))
    }

    const user = userResult.rows[0]

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash)

    if (!isValidPassword) {
      return res.status(401).json(createResponse(
        false, 
        null, 
        'Current password is incorrect', 
        401
      ))
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10)

    // Update password in database
    await database.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, userId]
    )

    res.status(200).json(createResponse(
      true, 
      { username: user.username }, 
      'Password changed successfully'
    ))

  } catch (error: any) {
    console.error('Change password error:', error)
    res.status(500).json(createResponse(
      false, 
      null, 
      'Failed to change password: ' + error.message, 
      500
    ))
  }
}
