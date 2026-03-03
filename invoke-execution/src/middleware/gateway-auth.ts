import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      trustedClientIp?: string;
      isFromGateway?: boolean;
    }
  }
}

/**
 * Gateway authentication middleware.
 *
 * When INTERNAL_SERVICE_SECRET is configured this middleware verifies the
 * signed JWT that invoke-gateway injects as the `x-invoke-data` request
 * header.
 */
export function gatewayAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.INTERNAL_SERVICE_SECRET;

  if (!secret) {
    req.trustedClientIp = req.ip;
    return next();
  }

  const token = req.headers['x-invoke-data'] as string | undefined;

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    req.trustedClientIp = (payload.clientIp as string) || req.ip;
    req.isFromGateway = true;
    next();
  } catch {
    res.status(403).json({
      success: false,
      message: 'Forbidden: invalid or expired gateway token',
    });
  }
}
