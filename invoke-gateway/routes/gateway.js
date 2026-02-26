const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { resolveRoute, getDefaultDomain } = require('../services/route-cache');
const { authenticate } = require('../services/auth');

const router = express.Router();

const EXECUTION_SERVICE_URL = process.env.EXECUTION_SERVICE_URL || 'http://localhost:3001';

// Headers to strip before forwarding to execution service
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'authorization',
  'x-api-key',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'connection',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
]);

// Response headers to strip from upstream response
const STRIPPED_RESPONSE_HEADERS = new Set([
  'transfer-encoding',
  'connection',
  'keep-alive',
  'trailer',
  'upgrade',
]);

/**
 * Apply CORS headers to the response based on route settings.
 * Returns true if this was a preflight request (caller should end the response).
 */
function applyCors(req, res, corsSettings) {
  if (!corsSettings.enabled) return false;

  const origin = req.headers['origin'];
  const allowedOrigins = corsSettings.allowedOrigins;

  // Determine allowed origin
  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    // Origin not allowed — don't set CORS headers (browser will block it)
    return false;
  }

  if (corsSettings.allowCredentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (corsSettings.exposeHeaders.length > 0) {
    res.setHeader('Access-Control-Expose-Headers', corsSettings.exposeHeaders.join(', '));
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    const requestedMethod = req.headers['access-control-request-method'];
    const requestedHeaders = req.headers['access-control-request-headers'];

    if (requestedMethod) {
      res.setHeader('Access-Control-Allow-Methods', requestedMethod);
    }

    const headersToAllow = corsSettings.allowedHeaders.length > 0
      ? corsSettings.allowedHeaders.join(', ')
      : (requestedHeaders || 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Headers', headersToAllow);
    res.setHeader('Access-Control-Max-Age', String(corsSettings.maxAge));

    res.status(204).end();
    return true;
  }

  return false;
}

/**
 * Build the upstream URL for the execution service.
 */
function buildUpstreamUrl(functionId, routeParams, originalQuery, pathSuffix) {
  // Append any unmatched path suffix so e.g. route "/test" + request "/test/abc" → /invoke/<id>/abc
  const suffix = pathSuffix || '';
  const base = `${EXECUTION_SERVICE_URL}/invoke/${functionId}${suffix}`;
  const merged = Object.assign({}, originalQuery);

  // Route params take precedence over query params with same name
  for (const [key, value] of Object.entries(routeParams)) {
    merged[key] = String(value);
  }

  const qs = new URLSearchParams(merged).toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Normalize an IP address: strip IPv4-mapped IPv6 prefix (::ffff:x.x.x.x → x.x.x.x).
 */
function normalizeIp(ip) {
  if (!ip) return ip;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * Proxy the request to the execution service and pipe the response back.
 */
function proxyRequest(req, res, upstreamUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(upstreamUrl);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    // Build filtered headers
    const forwardHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
        forwardHeaders[key] = value;
      }
    }

    // Real client IP — use Express's req.ip (respects trust proxy setting) and
    // the direct socket address for building the forwarding chain.
    const socketIp = normalizeIp(req.socket.remoteAddress);
    const clientIp = normalizeIp(req.ip) || socketIp;

    // Build x-forwarded-for chain: when behind a trusted proxy req.ips contains
    // the full chain [client, ...intermediaries]; otherwise just use clientIp.
    const ips = (req.ips && req.ips.length > 0)
      ? req.ips.map(normalizeIp)
      : [clientIp];
    forwardHeaders['x-forwarded-for'] = ips.join(', ');

    // x-real-ip: the original client IP (first in the chain)
    forwardHeaders['x-real-ip'] = ips[0];

    forwardHeaders['x-forwarded-host'] = req.hostname;
    forwardHeaders['x-forwarded-proto'] = req.protocol;
    forwardHeaders['x-gateway-request'] = '1';

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: req.method,
      headers: forwardHeaders,
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      // Copy status
      res.status(proxyRes.statusCode || 200);

      // Copy response headers (filtered)
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      }

      // Pipe body
      proxyRes.pipe(res, { end: true });
      proxyRes.on('end', resolve);
    });

    proxyReq.on('error', reject);

    // Forward request body
    if (req.body && Buffer.isBuffer(req.body)) {
      proxyReq.write(req.body);
    } else if (req.body) {
      // body-parser already parsed it; re-serialize
      const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      proxyReq.write(bodyStr);
    }

    proxyReq.end();
  });
}

/**
 * Main catch-all route handler.
 */
router.all('/{*path}', async (req, res) => {
  try {
    const hostname = (req.headers.host || '').toLowerCase();
    const pathname = req.path;

    // Resolve route from cache
    const resolved = resolveRoute(hostname, pathname, getDefaultDomain());

    if (!resolved) {
      return res.status(404).json({ success: false, message: 'No route matched' });
    }

    const { route, params } = resolved;

    // Check allowed methods (allow OPTIONS through for CORS preflight regardless)
    if (req.method !== 'OPTIONS' && !route.allowedMethods.includes(req.method.toUpperCase())) {
      res.setHeader('Allow', route.allowedMethods.join(', '));
      return res.status(405).json({ success: false, message: `Method ${req.method} not allowed. Allowed: ${route.allowedMethods.join(', ')}` });
    }

    // Apply CORS (may end response for OPTIONS preflight)
    const wasPreflight = applyCors(req, res, route.corsSettings);
    if (wasPreflight) return;

    // Validate authentication
    const authResult = authenticate(req, route.authMethods);
    if (!authResult.authenticated) {
      if (authResult.realm) {
        res.set('WWW-Authenticate', `Basic realm="${authResult.realm}"`);
      }
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Check function is configured
    if (!route.functionId) {
      return res.status(502).json({ success: false, message: 'No upstream function configured for this route' });
    }

    // Build upstream URL (merging path params + query params + path suffix)
    const upstreamUrl = buildUpstreamUrl(route.functionId, params, req.query, resolved.pathSuffix);

    // Proxy to execution service
    await proxyRequest(req, res, upstreamUrl);

  } catch (err) {
    console.error('[Gateway] Request error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ success: false, message: 'Gateway error', error: err.message });
    }
  }
});

module.exports = router;
