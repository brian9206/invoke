import { NextApiRequest, NextApiResponse } from 'next'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import { parseCookies, hashRefreshToken, clearAuthCookies } from '@/lib/token-utils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    const cookies = parseCookies(req)
    const rawToken = cookies.refresh_token

    if (rawToken) {
      const tokenHash = hashRefreshToken(rawToken)
      const { RefreshToken } = database.models
      await RefreshToken.destroy({ where: { token_hash: tokenHash } })
    }

    clearAuthCookies(req, res)

    res.status(200).json(createResponse(true, null, 'Logged out'))

  } catch (error) {
    console.error('Logout error:', error)
    clearAuthCookies(req, res)
    res.status(200).json(createResponse(true, null, 'Logged out'))
  }
}
