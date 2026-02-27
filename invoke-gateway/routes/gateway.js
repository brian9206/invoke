const express = require('express');
const { resolveRoute, getDefaultDomain } = require('../services/route-cache');
const { authenticate } = require('../services/auth');
const { executionClient, buildGatewayHeaders, buildInvokeUrl } = require('../services/execution-client');

const router = express.Router();

// Headers to strip before forwarding to execution service
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'authorization',
  'x-api-key',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'x-invoke-data',
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
 * Normalize an IP address: strip IPv4-mapped IPv6 prefix (::ffff:x.x.x.x → x.x.x.x).
 */
function normalizeIp(ip) {
  if (!ip) return ip;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * Proxy the request to the execution service and stream the response back.
 * Uses the shared executionClient (axios) so all execution-service calls go
 * through one place.
 */
async function proxyRequest(req, res, functionId, { pathSuffix, routeParams, query }) {
  // Build filtered forward-headers (strip hop-by-hop and sensitive auth headers)
  const forwardHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardHeaders[key] = value;
    }
  }

  // Real client IP chain
  const socketIp = normalizeIp(req.socket.remoteAddress);
  const clientIp = normalizeIp(req.ip) || socketIp;
  const ips = (req.ips && req.ips.length > 0) ? req.ips.map(normalizeIp) : [clientIp];

  forwardHeaders['x-forwarded-for'] = ips.join(', ');
  forwardHeaders['x-real-ip'] = ips[0];
  forwardHeaders['x-forwarded-host'] = req.hostname;
  forwardHeaders['x-forwarded-proto'] = req.protocol;

  // Merge gateway identity headers (x-gateway-request + signed x-invoke-data JWT)
  const headers = { ...forwardHeaders, ...buildGatewayHeaders(ips[0]) };

  // Merge route path params on top of query params (params take precedence)
  const merged = Object.assign({}, query);
  for (const [key, value] of Object.entries(routeParams)) {
    merged[key] = String(value);
  }

  const url = buildInvokeUrl(functionId, pathSuffix, merged);

  // Request body: pass through the raw buffer if present, otherwise re-serialise
  let data;
  if (req.body && Buffer.isBuffer(req.body)) {
    data = req.body;
  } else if (req.body) {
    data = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  const response = await executionClient({
    method: req.method,
    url,
    headers,
    data,
    responseType: 'stream',
    decompress: false,        // forward Content-Encoding as-is; don't double-decode
    validateStatus: () => true, // forward all status codes rather than throwing
  });

  // Copy status and filtered response headers to the client
  res.status(response.status);
  for (const [key, value] of Object.entries(response.headers)) {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  }

  // Stream response body back to the client
  await new Promise((resolve, reject) => {
    response.data.pipe(res, { end: true });
    response.data.on('end', resolve);
    response.data.on('error', reject);
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
    const authResult = await authenticate(req, route.authMethods, route.authLogic);
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

    // Build upstream URL and proxy to execution service
    await proxyRequest(req, res, route.functionId, {
      pathSuffix: resolved.pathSuffix,
      routeParams: params,
      query: req.query,
    });

  } catch (err) {
    console.error('[Gateway] Request error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ success: false, message: 'Gateway error', error: err.message });
    }
  }
});

module.exports = router;
