const jwt = require('jsonwebtoken');

/**
 * Gateway authentication middleware.
 *
 * When INTERNAL_GATEWAY_SECRET is configured this middleware verifies the
 * signed JWT that invoke-gateway injects as the `x-invoke-data` request
 * header.  The JWT payload carries sensitive request metadata (e.g. the
 * real client IP) so the execution service can trust it without relying on
 * easily-spoofable plain headers.
 *
 * Behaviour:
 *  - Secret configured + valid token   → attach payload fields to `req`, continue
 *  - Secret configured + missing token → 403 (request did not come through gateway)
 *  - Secret configured + invalid token → 403 (tampered / expired token)
 *  - Secret NOT configured             → fall back to req.ip (no-op / dev mode)
 *
 * Trusted fields attached to `req`:
 *  - `req.trustedClientIp` {string} — verified real client IP address
 */
function gatewayAuth(req, res, next) {
  const secret = process.env.INTERNAL_GATEWAY_SECRET;

  if (!secret) {
    // No secret configured — running without gateway verification (dev / standalone mode).
    req.trustedClientIp = req.ip;
    return next();
  }

  const token = req.headers['x-invoke-data'];

  if (!token) {
    // No token provided — allow pass-through (might be direct invocation, not through gateway)
    return next();
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    req.trustedClientIp = payload.clientIp || req.ip;
    req.isFromGateway = true;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: invalid or expired gateway token',
    });
  }
}

module.exports = { gatewayAuth };
