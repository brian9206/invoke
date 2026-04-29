import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { NextApiRequest, NextApiResponse } from 'next'
import { serialize } from 'cookie'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required')
}

const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60 // 7 days
const ACCESS_TOKEN_MAX_AGE = 15 * 60 // 15 minutes

interface TokenUser {
  id: number
}

export function generateAccessToken(user: TokenUser): string {
  return jwt.sign({ sub: String(user.id) }, JWT_SECRET!, { expiresIn: ACCESS_TOKEN_EXPIRY })
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function getRefreshTokenExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000)
}

function isHttps(req: NextApiRequest): boolean {
  if (req.headers['x-forwarded-proto'] === 'https') return true
  if ((req.socket as any)?.encrypted === true) return true
  return false
}

export function setAuthCookies(
  req: NextApiRequest,
  res: NextApiResponse,
  accessToken: string,
  refreshToken: string
): void {
  const secure = isHttps(req)

  const cookies = [
    serialize('access_token', accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api',
      maxAge: ACCESS_TOKEN_MAX_AGE
    }),
    serialize('access_token', accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/admin',
      maxAge: ACCESS_TOKEN_MAX_AGE
    }),
    serialize('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: REFRESH_TOKEN_EXPIRY_SECONDS
    })
  ]

  res.setHeader('Set-Cookie', cookies)
}

export function clearAuthCookies(req: NextApiRequest, res: NextApiResponse): void {
  const secure = isHttps(req)

  const cookies = [
    serialize('access_token', '', {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api',
      maxAge: 0
    }),
    serialize('access_token', '', {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/admin',
      maxAge: 0
    }),
    serialize('refresh_token', '', {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 0
    })
  ]

  res.setHeader('Set-Cookie', cookies)
}

export function parseCookies(req: NextApiRequest): Record<string, string> {
  const header = req.headers.cookie || ''
  const cookies: Record<string, string> = {}
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=')
    if (idx < 0) continue
    const key = pair.substring(0, idx).trim()
    const val = pair.substring(idx + 1).trim()
    cookies[key] = decodeURIComponent(val)
  }
  return cookies
}
