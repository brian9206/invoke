const jwt = require('jsonwebtoken');
const { resolveJwksUri, getSigningKey } = require('./jwks-manager');
const { executionClient, buildGatewayHeaders, buildInvokeUrl } = require('./execution-client');

const MIDDLEWARE_TIMEOUT_MS = 5000;

/**
 * Gateway-level authentication validators.
 *
 * Auth methods are now named, reusable configs stored per project.
 * A route may have 0 or more auth methods.
 * authLogic controls how multiple methods are evaluated:
 *   'or'  (default) — any passing method grants access
 *   'and'           — all methods must pass
 * 0 methods = public (always passes).
 *
 * Supported types:
 *   - basic_auth:    HTTP Basic credentials checked against config.credentials[]
 *   - bearer_jwt:    JWT verified against a secret or JWKS endpoint (see jwtMode)
 *                    jwtMode values: fixed_secret | microsoft | google | github |
 *                                    jwks_endpoint | oidc_discovery
 *   - api_key:       Key sent via x-api-key header, Authorization: Bearer, or ?api_key
 *   - middleware:    Invokes a project function with request metadata; pass if { allow: true }
 */

// ─── Extraction helpers ───────────────────────────────────────────────────────

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader) return null;
  if (!authorizationHeader.startsWith('Bearer ')) return null;
  return authorizationHeader.substring(7).trim() || null;
}

function extractApiKey(authorizationHeader, xApiKeyHeader, queryApiKey) {
  if (xApiKeyHeader) return xApiKeyHeader;
  if (queryApiKey) return queryApiKey;
  if (authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    return authorizationHeader.substring(7).trim() || null;
  }
  return null;
}

function extractBasicCredentials(authorizationHeader) {
  if (!authorizationHeader) return null;
  if (!authorizationHeader.startsWith('Basic ')) return null;
  const b64 = authorizationHeader.substring(6).trim();
  if (!b64) return null;
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) return null;
    return {
      username: decoded.substring(0, colonIdx),
      password: decoded.substring(colonIdx + 1),
    };
  } catch {
    return null;
  }
}

// ─── Per-type validators ──────────────────────────────────────────────────────

function validateBasicAuth(req, config) {
  const creds = extractBasicCredentials(req.headers.authorization);
  if (!creds) {
    return { authenticated: false, error: 'No Basic credentials provided', realm: config.realm || null };
  }
  const credentials = config.credentials || [];
  if (credentials.length === 0) {
    return { authenticated: false, error: 'No credentials configured for this auth method', realm: config.realm || null };
  }
  const match = credentials.some(
    (c) => c.username === creds.username && c.password === creds.password
  );
  if (match) return { authenticated: true };
  return { authenticated: false, error: 'Invalid credentials', realm: config.realm || null };
}

async function validateBearerJwt(req, config) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return { authenticated: false, error: 'No bearer token provided' };
  }

  const mode = config.jwtMode || 'fixed_secret';

  // ── Fixed secret (HMAC) ──────────────────────────────────────────────────
  if (mode === 'fixed_secret') {
    const secret = config.jwtSecret;
    if (!secret) {
      return { authenticated: false, error: 'No JWT secret configured for this auth method' };
    }
    try {
      const payload = jwt.verify(token, secret);
      return { authenticated: true, payload };
    } catch (err) {
      return { authenticated: false, error: `Invalid token: ${err.message}` };
    }
  }

  // ── JWKS-based modes ─────────────────────────────────────────────────────
  try {
    // Decode header without verification to extract kid
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header) {
      return { authenticated: false, error: 'Malformed JWT: cannot decode header' };
    }
    const kid = decoded.header.kid;

    // Resolve JWKS URI (provider-specific or user-supplied)
    const jwksUri = await resolveJwksUri(config);

    // Fetch the matching public key
    const signingKey = await getSigningKey(jwksUri, kid);

    // Build verify options (asymmetric algorithms only to prevent confusion attacks)
    const verifyOptions = {
      algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'PS256', 'PS384', 'PS512'],
    };
    if (config.audience) verifyOptions.audience = config.audience;
    if (config.issuer)   verifyOptions.issuer   = config.issuer;

    const payload = jwt.verify(token, signingKey, verifyOptions);
    return { authenticated: true, payload };
  } catch (err) {
    return { authenticated: false, error: `Invalid token: ${err.message}` };
  }
}

function validateApiKey(req, config) {
  const key = extractApiKey(
    req.headers.authorization,
    req.headers['x-api-key'],
    req.query.api_key || req.query.apiKey
  );
  if (!key) {
    return { authenticated: false, error: 'No API key provided' };
  }
  const keys = config.apiKeys || [];
  if (keys.length === 0) {
    return { authenticated: false, error: 'No API keys configured for this auth method' };
  }
  if (keys.includes(key)) {
    return { authenticated: true };
  }
  return { authenticated: false, error: 'Invalid API key' };
}

/**
 * Invoke a project function as an auth middleware.
 * POSTs request metadata (path, query, headers — no body) to the execution service.
 * Returns { authenticated: true } if the function responds with { allow: true }.
 */
async function validateMiddleware(req, config) {
  const functionId = config.functionId;
  if (!functionId) {
    return { authenticated: false };
  }

  try {
    const { data } = await executionClient.post(
      buildInvokeUrl(functionId),
      { path: req.path, query: req.query, headers: req.headers },
      {
        headers: buildGatewayHeaders(req.ip || ''),
        timeout: MIDDLEWARE_TIMEOUT_MS,
        validateStatus: () => true,
      },
    );

    if (data && data.allow === true) {
      return { authenticated: true };
    }
    return { authenticated: false };
  } catch (err) {
    console.error('[Gateway] Middleware auth error:', err.message);
    return { authenticated: false };
  }
}

// ─── Main authenticate function ───────────────────────────────────────────────

/**
 * Authenticate a request against a route's auth methods.
 *
 * @param {object} req          - Express request
 * @param {Array}  authMethods  - Array of { type, config } objects from route cache
 * @param {string} authLogic    - 'or' (any passing = allow) or 'and' (all must pass)
 * @returns {Promise<{ authenticated: boolean, realm?: string }>}
 */
async function authenticate(req, authMethods, authLogic = 'or') {
  // No auth methods = public
  if (!authMethods || authMethods.length === 0) {
    return { authenticated: true };
  }

  let firstRealm = null;

  if (authLogic === 'and') {
    // AND logic: every method must pass
    for (const method of authMethods) {
      let result;

      switch (method.type) {
        case 'basic_auth':
          result = validateBasicAuth(req, method.config);
          break;
        case 'bearer_jwt':
          result = await validateBearerJwt(req, method.config);
          break;
        case 'api_key':
          result = validateApiKey(req, method.config);
          break;
        case 'middleware':
          result = await validateMiddleware(req, method.config);
          break;
        default:
          result = { authenticated: false };
      }

      if (!result.authenticated) {
        if (result.realm) firstRealm = result.realm;
        return { authenticated: false, realm: firstRealm };
      }
    }
    return { authenticated: true };
  }

  // OR logic (default): first passing method grants access
  for (const method of authMethods) {
    let result;

    switch (method.type) {
      case 'basic_auth':
        result = validateBasicAuth(req, method.config);
        break;
      case 'bearer_jwt':
        result = await validateBearerJwt(req, method.config);
        break;
      case 'api_key':
        result = validateApiKey(req, method.config);
        break;
      case 'middleware':
        result = await validateMiddleware(req, method.config);
        break;
      default:
        result = { authenticated: false };
    }

    if (result.authenticated) return { authenticated: true };
    if (!firstRealm && result.realm) firstRealm = result.realm;
  }

  return { authenticated: false, realm: firstRealm };
}

module.exports = { authenticate };
