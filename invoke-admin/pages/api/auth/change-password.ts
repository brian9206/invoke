import { NextApiResponse } from 'next'
import database from '@/lib/database'
import { createResponse, validatePasswordStrength, hashPassword, verifyPassword } from '@/lib/utils'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const userId = req.user!.id
    const { currentPassword, newPassword } = req.body

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json(createResponse(false, null, 'Current password and new password are required', 400))
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword)
    if (!passwordValidation.success) {
      return res
        .status(400)
        .json(createResponse(false, { score: passwordValidation.score }, passwordValidation.feedback ?? undefined, 400))
    }

    // Get current user from database
    const { User } = database.models
    const userRecord = await User.findByPk(userId, {
      attributes: ['id', 'username', 'password_hash']
    })

    if (!userRecord) {
      return res.status(404).json(createResponse(false, null, 'User not found', 404))
    }

    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, userRecord.password_hash)

    if (!isValidPassword) {
      return res.status(401).json(createResponse(false, null, 'Current password is incorrect', 401))
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword)

    // Update password in database
    await userRecord.update({ password_hash: newPasswordHash, updated_at: new Date() })

    res.status(200).json(createResponse(true, { username: userRecord.username }, 'Password changed successfully'))
  } catch (error: any) {
    console.error('Change password error:', error)
    res.status(500).json(createResponse(false, null, 'An internal error occurred', 500))
  }
}

export default withAuthAndMethods(['PUT'])(handler)
