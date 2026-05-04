import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

/**
 * Gateway authentication middleware.
 *
 * When INTERNAL_SERVICE_SECRET is configured this middleware verifies the
 * signed JWT that invoke-gateway injects as the `x-invoke-data` request
 * header.
 */
export function gatewayAuth(req: Request, res: Response, next: NextFunction): void {
  // Always initialize a safe fallback so execution logs never store a blank client IP.
  req.trustedClientIp = req.ip

  const secret = process.env.INTERNAL_SERVICE_SECRET

  if (!secret) {
    return next()
  }

  const token = req.headers['x-invoke-data'] as string | undefined

  if (!token) {
    return next()
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload
    req.trustedClientIp = (payload.clientIp as string) || req.trustedClientIp
    req.isFromGateway = true
    next()
  } catch {
    res.status(403).json({
      success: false,
      message: 'Forbidden: invalid or expired gateway token'
    })
  }
}
