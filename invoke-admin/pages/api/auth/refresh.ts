import { NextApiRequest, NextApiResponse } from 'next'
import { Op } from 'sequelize'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import {
  parseCookies,
  hashRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiresAt,
  setAuthCookies,
  clearAuthCookies
} from '@/lib/token-utils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    const cookies = parseCookies(req)
    const rawToken = cookies.refresh_token

    if (!rawToken) {
      return res.status(401).json(createResponse(false, null, 'No refresh token', 401))
    }

    const tokenHash = hashRefreshToken(rawToken)

    const { RefreshToken, User } = database.models
    const record = await RefreshToken.findOne({
      where: {
        token_hash: tokenHash,
        expires_at: { [Op.gt]: new Date() }
      },
      include: [{ model: User, attributes: ['id', 'username', 'email', 'is_admin'] }]
    })

    if (!record || !record.User) {
      clearAuthCookies(req, res)
      return res.status(401).json(createResponse(false, null, 'Invalid or expired refresh token', 401))
    }

    const user = record.User

    // Delete used refresh token (rotation)
    await record.destroy()

    // Update last_login
    await user.update({ last_login: new Date() })

    // Issue new token pair
    const tokenUser = { id: user.id }
    const newAccessToken = generateAccessToken(tokenUser)
    const newRefreshTokenRaw = generateRefreshToken()
    const newRefreshTokenHash = hashRefreshToken(newRefreshTokenRaw)

    await RefreshToken.create({
      user_id: user.id,
      token_hash: newRefreshTokenHash,
      expires_at: getRefreshTokenExpiresAt(),
      created_at: new Date()
    })

    setAuthCookies(req, res, newAccessToken, newRefreshTokenRaw)

    res.status(200).json(
      createResponse(
        true,
        {
          user: { id: user.id, username: user.username, email: user.email, isAdmin: user.is_admin }
        },
        'Token refreshed'
      )
    )
  } catch (error) {
    console.error('Refresh token error:', error)
    res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}
