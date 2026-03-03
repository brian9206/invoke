import express, { Request, Response } from 'express';
import routeCache, { CorsSettings } from '../services/route-cache';
import { authenticate } from '../services/auth';
import { executionClient, buildGatewayHeaders, buildInvokeUrl } from '../services/execution-client';

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
function applyCors(req: Request, res: Response, corsSettings: CorsSettings): boolean {
  if (!corsSettings.enabled) return false;

  const origin = req.headers['origin'];
  const allowedOrigins = corsSettings.allowedOrigins;

  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
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

    const headersToAllow =
      corsSettings.allowedHeaders.length > 0
        ? corsSettings.allowedHeaders.join(', ')
        : requestedHeaders || 'Content-Type, Authorization';
    res.setHeader('Access-Control-Allow-Headers', headersToAllow);
    res.setHeader('Access-Control-Max-Age', String(corsSettings.maxAge));

    res.status(204).end();
    return true;
  }

  return false;
}

/** Normalize an IP address: strip IPv4-mapped IPv6 prefix. */
function normalizeIp(ip: string | undefined): string | undefined {
  if (!ip) return ip;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

interface ProxyOptions {
  pathSuffix: string;
  routeParams: Record<string, string>;
  query: Record<string, unknown>;
}

/**
 * Proxy the request to the execution service and stream the response back.
 */
async function proxyRequest(
  req: Request,
  res: Response,
  functionId: string,
  { pathSuffix, routeParams, query }: ProxyOptions,
): Promise<void> {
  const forwardHeaders: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase()) && value !== undefined) {
      forwardHeaders[key] = value;
    }
  }

  const socketIp = normalizeIp(req.socket.remoteAddress);
  const clientIp = normalizeIp(req.ip) || socketIp;
  const ips =
    req.ips && req.ips.length > 0 ? req.ips.map(normalizeIp) : [clientIp];

  forwardHeaders['x-forwarded-for'] = ips.filter(Boolean).join(', ');
  forwardHeaders['x-real-ip'] = ips[0] ?? '';
  forwardHeaders['x-forwarded-host'] = req.hostname;
  forwardHeaders['x-forwarded-proto'] = req.protocol;

  const headers = {
    ...forwardHeaders,
    ...buildGatewayHeaders(ips[0] ?? ''),
  };

  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    merged[key] = String(value);
  }
  for (const [key, value] of Object.entries(routeParams)) {
    merged[key] = String(value);
  }

  const url = buildInvokeUrl(functionId, pathSuffix, merged);

  let data: Buffer | string | undefined;
  if (req.body && Buffer.isBuffer(req.body)) {
    data = req.body;
  } else if (req.body) {
    data = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  const response = await executionClient({
    method: req.method,
    url,
    headers: headers as Record<string, string>,
    data,
    responseType: 'stream',
    decompress: false,
    validateStatus: () => true,
  });

  res.status(response.status);
  for (const [key, value] of Object.entries(
    response.headers as Record<string, string>,
  )) {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  }

  await new Promise<void>((resolve, reject) => {
    (response.data as NodeJS.ReadableStream).pipe(res, { end: true });
    (response.data as NodeJS.ReadableStream).on('end', resolve);
    (response.data as NodeJS.ReadableStream).on('error', reject);
  });
}

/**
 * Main catch-all route handler.
 */
router.all('/{*path}', async (req: Request, res: Response) => {
  try {
    const hostname = (req.headers.host || '').toLowerCase();
    const pathname = req.path;

    const resolved = routeCache.resolveRoute(hostname, pathname, routeCache.getDefaultDomain());

    if (!resolved) {
      return res.status(404).json({ success: false, message: 'No route matched' });
    }

    const { route, params } = resolved;

    if (
      req.method !== 'OPTIONS' &&
      !route.allowedMethods.includes(req.method.toUpperCase())
    ) {
      res.setHeader('Allow', route.allowedMethods.join(', '));
      return res.status(405).json({
        success: false,
        message: `Method ${req.method} not allowed. Allowed: ${route.allowedMethods.join(', ')}`,
      });
    }

    const wasPreflight = applyCors(req, res, route.corsSettings);
    if (wasPreflight) return;

    const authResult = await authenticate(req, route.authMethods, route.authLogic);
    if (!authResult.authenticated) {
      if (authResult.realm) {
        res.set('WWW-Authenticate', `Basic realm="${authResult.realm}"`);
      }
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!route.functionId) {
      return res.status(502).json({
        success: false,
        message: 'No upstream function configured for this route',
      });
    }

    await proxyRequest(req, res, route.functionId, {
      pathSuffix: resolved.pathSuffix,
      routeParams: params,
      query: req.query as Record<string, unknown>,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Gateway] Request error:', message);
    if (!res.headersSent) {
      res.status(502).json({ success: false, message: 'Gateway error', error: message });
    }
  }
});

export default router;
