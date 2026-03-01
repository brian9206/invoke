/**
 * Shared validation for API gateway auth method configs.
 * Used by both auth-methods.ts (POST) and auth-methods/[id].ts (PUT).
 */

const VALID_TYPES = ['basic_auth', 'bearer_jwt', 'api_key', 'middleware'] as const;
export type AuthMethodType = typeof VALID_TYPES[number];

const VALID_JWT_MODES = ['fixed_secret', 'microsoft', 'google', 'github', 'jwks_endpoint', 'oidc_discovery'] as const;
export type JwtMode = typeof VALID_JWT_MODES[number];

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateAuthMethodConfig(type: string, config: any): string | null {
  if (!config || typeof config !== 'object') return 'config must be an object';

  if (type === 'basic_auth') {
    if (!Array.isArray(config.credentials)) return 'basic_auth config requires credentials array';
    for (const cred of config.credentials) {
      if (!cred.username || typeof cred.username !== 'string') return 'each credential must have a username';
      if (!cred.password || typeof cred.password !== 'string') return 'each credential must have a password';
    }
    return null;
  }

  if (type === 'bearer_jwt') {
    const mode: string = config.jwtMode;
    if (!mode) return 'bearer_jwt config requires jwtMode';
    if (!VALID_JWT_MODES.includes(mode as JwtMode)) {
      return `jwtMode must be one of: ${VALID_JWT_MODES.join(', ')}`;
    }

    if (mode === 'fixed_secret') {
      if (!config.jwtSecret || typeof config.jwtSecret !== 'string') {
        return 'fixed_secret mode requires a non-empty jwtSecret string';
      }
    } else if (mode === 'microsoft') {
      if (!config.tenantId || typeof config.tenantId !== 'string' || !config.tenantId.trim()) {
        return 'microsoft mode requires a non-empty tenantId string';
      }
    } else if (mode === 'jwks_endpoint') {
      if (!config.jwksUrl || typeof config.jwksUrl !== 'string') {
        return 'jwks_endpoint mode requires jwksUrl';
      }
      if (!isValidUrl(config.jwksUrl)) {
        return 'jwksUrl must be a valid URL';
      }
    } else if (mode === 'oidc_discovery') {
      if (!config.oidcUrl || typeof config.oidcUrl !== 'string') {
        return 'oidc_discovery mode requires oidcUrl';
      }
      if (!isValidUrl(config.oidcUrl)) {
        return 'oidcUrl must be a valid URL';
      }
    }
    // google and github: no required fields beyond jwtMode

    // Optional claim fields
    if (config.audience !== undefined && typeof config.audience !== 'string') {
      return 'audience must be a string';
    }
    if (config.issuer !== undefined && typeof config.issuer !== 'string') {
      return 'issuer must be a string';
    }
    return null;
  }

  if (type === 'api_key') {
    if (!Array.isArray(config.apiKeys)) return 'api_key config requires apiKeys array';
    for (const key of config.apiKeys) {
      if (typeof key !== 'string' || !key.trim()) return 'each apiKey must be a non-empty string';
    }
    return null;
  }

  if (type === 'middleware') {
    if (!config.functionId || typeof config.functionId !== 'string' || !config.functionId.trim()) {
      return 'middleware config requires a non-empty functionId string';
    }
    return null;
  }

  return `unknown type: ${type}`;
}

export function isValidAuthMethodType(type: string): type is AuthMethodType {
  return VALID_TYPES.includes(type as AuthMethodType);
}
