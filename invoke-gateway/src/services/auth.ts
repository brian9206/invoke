import jwt from 'jsonwebtoken';
import { Request } from 'express';
import { resolveJwksUri, getSigningKey } from './jwks-manager';
import { executionClient, buildGatewayHeaders, buildInvokeUrl } from './execution-client';
import type { AuthMethodEntry } from './route-cache';

const MIDDLEWARE_TIMEOUT_MS = 5000;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface AuthResult {
  authenticated: boolean;
  realm?: string | null;
  payload?: unknown;
  error?: string;
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  if (!authorizationHeader.startsWith('Bearer ')) return null;
  return authorizationHeader.substring(7).trim() || null;
}

function extractApiKey(
  authorizationHeader: string | undefined,
  xApiKeyHeader: string | undefined,
  queryApiKey: string | undefined,
): string | null {
  if (xApiKeyHeader) return xApiKeyHeader;
  if (queryApiKey) return queryApiKey;
  if (authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    return authorizationHeader.substring(7).trim() || null;
  }
  return null;
}

interface BasicCredentials {
  username: string;
  password: string;
}

function extractBasicCredentials(
  authorizationHeader: string | undefined,
): BasicCredentials | null {
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

function validateBasicAuth(req: Request, config: Record<string, any>): AuthResult {
  const creds = extractBasicCredentials(req.headers.authorization);
  if (!creds) {
    return {
      authenticated: false,
      error: 'No Basic credentials provided',
      realm: (config.realm as string) || null,
    };
  }
  const credentials = (config.credentials as Array<{ username: string; password: string }>) || [];
  if (credentials.length === 0) {
    return {
      authenticated: false,
      error: 'No credentials configured for this auth method',
      realm: (config.realm as string) || null,
    };
  }
  const matchFound = credentials.some(
    (c) => c.username === creds.username && c.password === creds.password,
  );
  if (matchFound) return { authenticated: true };
  return { authenticated: false, error: 'Invalid credentials', realm: (config.realm as string) || null };
}

async function validateBearerJwt(req: Request, config: Record<string, any>): Promise<AuthResult> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return { authenticated: false, error: 'No bearer token provided' };
  }

  const mode = (config.jwtMode as string) || 'fixed_secret';

  // ── Fixed secret (HMAC) ──────────────────────────────────────────────────
  if (mode === 'fixed_secret') {
    const secret = config.jwtSecret as string | undefined;
    if (!secret) {
      return {
        authenticated: false,
        error: 'No JWT secret configured for this auth method',
      };
    }
    try {
      const payload = jwt.verify(token, secret);
      return { authenticated: true, payload };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { authenticated: false, error: `Invalid token: ${message}` };
    }
  }

  // ── JWKS-based modes ─────────────────────────────────────────────────────
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header) {
      return { authenticated: false, error: 'Malformed JWT: cannot decode header' };
    }
    const kid = decoded.header.kid;

    const jwksUri = await resolveJwksUri(config);
    const signingKey = await getSigningKey(jwksUri, kid);

    const verifyOptions: jwt.VerifyOptions = {
      algorithms: [
        'RS256', 'RS384', 'RS512',
        'ES256', 'ES384', 'ES512',
        'PS256', 'PS384', 'PS512',
      ],
    };
    if (config.audience) verifyOptions.audience = config.audience as string;
    if (config.issuer) verifyOptions.issuer = config.issuer as string;

    const payload = jwt.verify(token, signingKey, verifyOptions);
    return { authenticated: true, payload };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { authenticated: false, error: `Invalid token: ${message}` };
  }
}

function validateApiKey(req: Request, config: Record<string, any>): AuthResult {
  const key = extractApiKey(
    req.headers.authorization,
    req.headers['x-api-key'] as string | undefined,
    (req.query.api_key || req.query.apiKey) as string | undefined,
  );
  if (!key) {
    return { authenticated: false, error: 'No API key provided' };
  }
  const keys = (config.apiKeys as string[]) || [];
  if (keys.length === 0) {
    return {
      authenticated: false,
      error: 'No API keys configured for this auth method',
    };
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
async function validateMiddleware(req: Request, config: Record<string, any>): Promise<AuthResult> {
  const functionId = config.functionId as string | undefined;
  if (!functionId) {
    return { authenticated: false };
  }

  try {
    const { data } = await executionClient.post<{ allow?: boolean }>(
      buildInvokeUrl(functionId),
      { path: req.path, query: req.query, headers: req.headers },
      {
        headers: buildGatewayHeaders(req.ip ?? ''),
        timeout: MIDDLEWARE_TIMEOUT_MS,
        validateStatus: () => true,
      },
    );

    if (data && data.allow === true) {
      return { authenticated: true };
    }
    return { authenticated: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Gateway] Middleware auth error:', message);
    return { authenticated: false };
  }
}

// ─── Main authenticate function ───────────────────────────────────────────────

/**
 * Authenticate a request against a route's auth methods.
 *
 * @param req         - Express request
 * @param authMethods - Array of \{ type, config \} objects from route cache
 * @param authLogic   - 'or' (any passing = allow) or 'and' (all must pass)
 */
async function authenticate(
  req: Request,
  authMethods: AuthMethodEntry[],
  authLogic: string = 'or',
): Promise<{ authenticated: boolean; realm?: string | null }> {
  // No auth methods = public
  if (!authMethods || authMethods.length === 0) {
    return { authenticated: true };
  }

  let firstRealm: string | null = null;

  if (authLogic === 'and') {
    // AND logic: every method must pass
    for (const method of authMethods) {
      let result: AuthResult;

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
    let result: AuthResult;

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

export { authenticate };
