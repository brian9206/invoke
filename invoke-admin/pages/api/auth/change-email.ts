import { NextApiResponse } from 'next'
import { Op } from 'sequelize'
import database from '@/lib/database'
import { createResponse } from '@/lib/utils'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const userId = req.user!.id
    const { email } = req.body

    // Validate input
    if (!email) {
      return res.status(400).json(createResponse(false, null, 'Email is required', 400))
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json(createResponse(false, null, 'Invalid email format', 400))
    }

    // Check if email is already used by another user
    const { User } = database.models
    const existingUser = await User.findOne({
      where: { email, id: { [Op.ne]: userId } },
      attributes: ['id']
    })

    if (existingUser) {
      return res.status(409).json(createResponse(false, null, 'Email is already in use by another account', 409))
    }

    // Update email in database
    const userRecord = await User.findByPk(userId, { attributes: ['id', 'username'] })

    if (!userRecord) {
      return res.status(404).json(createResponse(false, null, 'User not found', 404))
    }

    await userRecord.update({ email, updated_at: new Date() })

    res.status(200).json(createResponse(true, { username: userRecord.username, email }, 'Email updated successfully'))
  } catch (error: any) {
    console.error('Change email error:', error)
    res.status(500).json(createResponse(false, null, 'An internal error occurred', 500))
  }
}

export default withAuthAndMethods(['PUT'])(handler)
