import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const { hashPassword, verifyPassword, createResponse } = require('@/lib/utils')
const database = require('@/lib/database')
const { 
  recordFailedLogin, 
  recordSuccessfulLogin, 
  isAccountLocked, 
  getRemainingLockoutTime,
  getFailedAttemptCount,
  getLockoutConfig 
} = require('@/lib/rate-limiter')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    await database.connect()

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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: turnstileToken,
          remoteip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        }),
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
    if (isAccountLocked(username)) {
      const remainingTime = getRemainingLockoutTime(username)
      const config = getLockoutConfig()
      return res.status(429).json(createResponse(false, null, 
        `Account temporarily locked due to too many failed login attempts. Try again in ${remainingTime} seconds. (Max ${config.maxAttempts} attempts per ${config.attemptWindowMinutes} minutes)`, 
        429
      ))
    }

    // Find user in database
    const result = await database.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [username]
    )

    if (result.rows.length === 0) {
      recordFailedLogin(username)
      const attempts = getFailedAttemptCount(username)
      const config = getLockoutConfig()
      return res.status(401).json(createResponse(false, null, 
        `Invalid credentials. Failed attempts: ${attempts}/${config.maxAttempts}`, 
        401
      ))
    }

    const user = result.rows[0]

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash)
    
    if (!isValidPassword) {
      recordFailedLogin(username)
      const attempts = getFailedAttemptCount(username)
      const config = getLockoutConfig()
      
      if (isAccountLocked(username)) {
        const remainingTime = getRemainingLockoutTime(username)
        return res.status(429).json(createResponse(false, null, 
          `Account temporarily locked due to too many failed login attempts. Try again in ${remainingTime} seconds.`, 
          429
        ))
      }
      
      return res.status(401).json(createResponse(false, null, 
        `Invalid credentials. Failed attempts: ${attempts}/${config.maxAttempts}`, 
        401
      ))
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

    // Clear failed login attempts on successful login
    recordSuccessfulLogin(username)

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