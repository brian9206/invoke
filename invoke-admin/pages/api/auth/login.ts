import { NextApiRequest, NextApiResponse } from 'next'
import { Op } from 'sequelize'
import { verifyPassword, createResponse } from '@/lib/utils'
import database from '@/lib/database'
import {
  recordFailedLogin,
  recordSuccessfulLogin,
  isAccountLocked,
  getRemainingLockoutTime,
  getLockoutConfig,
  getClientIp
} from '@/lib/rate-limiter'
import { getUserProjects } from '@/lib/middleware'
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiresAt,
  setAuthCookies
} from '@/lib/token-utils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    const { username, password, turnstileToken } = req.body

    if (!username || !password) {
      return res.status(400).json(createResponse(false, null, 'Username and password are required', 400))
    }

    // Verify Turnstile token
    if (!turnstileToken) {
      return res.status(400).json(createResponse(false, null, 'Verification challenge required', 400))
    }

    try {
      const turnstileVerification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: turnstileToken,
          remoteip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
        })
      })
      const turnstileResult = await turnstileVerification.json()
      if (!turnstileResult.success) {
        console.error('Turnstile verification failed:', turnstileResult)
        return res.status(400).json(createResponse(false, null, 'Verification challenge failed', 400))
      }
    } catch (turnstileError) {
      console.error('Turnstile verification error:', turnstileError)
      return res.status(500).json(createResponse(false, null, 'Verification service error', 500))
    }

    // Check if account is locked due to too many failed attempts
    const clientIp = getClientIp(req)
    if (await isAccountLocked(username, clientIp)) {
      const remainingTime = await getRemainingLockoutTime(username, clientIp)
      const config = getLockoutConfig()
      return res
        .status(429)
        .json(
          createResponse(
            false,
            null,
            `Account temporarily locked due to too many failed login attempts. Try again in ${remainingTime} seconds. (Max ${config.maxAttempts} attempts per ${config.attemptWindowMinutes} minutes)`,
            429
          )
        )
    }

    // Find user in database
    const { User } = database.models
    const user = await User.findOne({
      where: { [Op.or]: [{ username }, { email: username }] }
    })

    if (!user) {
      await recordFailedLogin(username, clientIp)
      return res.status(401).json(createResponse(false, null, 'Invalid credentials', 401))
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash)

    if (!isValidPassword) {
      await recordFailedLogin(username, clientIp)

      if (await isAccountLocked(username, clientIp)) {
        const remainingTime = await getRemainingLockoutTime(username, clientIp)
        return res
          .status(429)
          .json(
            createResponse(
              false,
              null,
              `Account temporarily locked due to too many failed login attempts. Try again in ${remainingTime} seconds.`,
              429
            )
          )
      }

      return res.status(401).json(createResponse(false, null, 'Invalid credentials', 401))
    }

    // If not admin, check project membership
    if (!user.is_admin) {
      const userProjects = await getUserProjects(user.id)
      if (!userProjects || userProjects.length === 0) {
        return res
          .status(403)
          .json(
            createResponse(
              false,
              null,
              'Access denied: You are not a member of any project. Please contact your system administrator.',
              403
            )
          )
      }
    }

    // Update last login
    await user.update({ last_login: new Date() })

    // Clear failed login attempts on successful login
    await recordSuccessfulLogin(username, clientIp)

    // Generate short-lived access token + refresh token
    const tokenUser = { id: user.id }
    const accessToken = generateAccessToken(tokenUser)
    const refreshTokenRaw = generateRefreshToken()
    const refreshTokenHash = hashRefreshToken(refreshTokenRaw)

    // Store refresh token hash in database
    const { RefreshToken } = database.models
    await RefreshToken.create({
      user_id: user.id,
      token_hash: refreshTokenHash,
      expires_at: getRefreshTokenExpiresAt(),
      created_at: new Date()
    })

    // Set HttpOnly cookies
    setAuthCookies(req, res, accessToken, refreshTokenRaw)

    res.status(200).json(
      createResponse(
        true,
        {
          user: { id: user.id, username: user.username, email: user.email, isAdmin: user.is_admin }
        },
        'Login successful'
      )
    )
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}
