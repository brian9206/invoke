import { Request, Response, NextFunction } from 'express'

export function requireInternalServiceAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_SERVICE_SECRET
  if (!expected) {
    res.status(500).json({ success: false, message: 'INTERNAL_SERVICE_SECRET is not configured' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Missing authorization token' })
    return
  }

  const provided = authHeader.slice('Bearer '.length)
  if (provided !== expected) {
    res.status(401).json({ success: false, message: 'Invalid authorization token' })
    return
  }

  next()
}
