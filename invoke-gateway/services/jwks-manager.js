/**
 * JWKS Manager
 *
 * Manages JWKS clients (one per unique JWKS URI) with built-in key caching,
 * key rotation support, and rate limiting via the `jwks-rsa` library.
 *
 * Also handles OIDC Discovery: fetches and caches the well-known configuration
 * document to extract the jwks_uri, with a configurable TTL.
 *
 * Well-known JWKS endpoints for built-in providers:
 *   Microsoft: https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys
 *   Google:    https://www.googleapis.com/oauth2/v3/certs
 *   GitHub:    https://token.actions.githubusercontent.com/.well-known/openid-configuration (OIDC)
 */

const JwksClient = require('jwks-rsa');
const https = require('https');

// ─── JWKS client pool ─────────────────────────────────────────────────────────

/** @type {Map<string, import('jwks-rsa').JwksClient>} */
const clientPool = new Map();

function getOrCreateClient(jwksUri) {
  if (clientPool.has(jwksUri)) return clientPool.get(jwksUri);
  const client = JwksClient({
    jwksUri,
    cache: true,
    cacheMaxEntries: 10,
    cacheMaxAge: 600_000,         // 10 minutes
    rateLimit: true,
    jwksRequestsPerMinute: 10,
    requestHeaders: { 'User-Agent': 'invoke-gateway/1.0' },
  });
  clientPool.set(jwksUri, client);
  return client;
}

/**
 * Retrieve a signing key from a JWKS endpoint by kid.
 * Returns the public key as a PEM string or a CryptoKey.
 *
 * @param {string} jwksUri
 * @param {string|null|undefined} kid
 * @returns {Promise<string>}
 */
async function getSigningKey(jwksUri, kid) {
  const client = getOrCreateClient(jwksUri);
  const key = await client.getSigningKey(kid);
  return key.getPublicKey();
}

// ─── OIDC Discovery cache ─────────────────────────────────────────────────────

const OIDC_CACHE_TTL = 3_600_000; // 1 hour

/**
 * @type {Map<string, { jwksUri: string; expiresAt: number }>}
 */
const oidcDiscoveryCache = new Map();

/**
 * Fetch and cache a well-known OIDC configuration document.
 * Returns the jwks_uri from the document.
 *
 * @param {string} oidcUrl  Full URL to the .well-known/openid-configuration endpoint
 * @returns {Promise<string>} The jwks_uri
 */
async function resolveOidcDiscovery(oidcUrl) {
  const cached = oidcDiscoveryCache.get(oidcUrl);
  if (cached && Date.now() < cached.expiresAt) return cached.jwksUri;

  const doc = await fetchJson(oidcUrl);
  if (!doc.jwks_uri) throw new Error(`OIDC discovery document at ${oidcUrl} does not contain jwks_uri`);
  oidcDiscoveryCache.set(oidcUrl, { jwksUri: doc.jwks_uri, expiresAt: Date.now() + OIDC_CACHE_TTL });
  return doc.jwks_uri;
}

// ─── Well-known provider JWKS URIs ────────────────────────────────────────────

// GitHub uses OIDC discovery; cache the resolved URI separately.
const GITHUB_OIDC_URL = 'https://token.actions.githubusercontent.com/.well-known/openid-configuration';

async function getGitHubJwksUri() {
  return resolveOidcDiscovery(GITHUB_OIDC_URL);
}

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve the JWKS URI for a bearer_jwt config object.
 *
 * @param {object} config  The auth method config (from DB)
 * @returns {Promise<string>} The resolved JWKS endpoint URL
 */
async function resolveJwksUri(config) {
  const mode = config.jwtMode;
  switch (mode) {
    case 'microsoft': {
      const tenantId = config.tenantId;
      if (!tenantId) throw new Error('Microsoft JWT mode requires tenantId in config');
      return `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
    }
    case 'google':
      return 'https://www.googleapis.com/oauth2/v3/certs';
    case 'github':
      return getGitHubJwksUri();
    case 'jwks_endpoint': {
      const url = config.jwksUrl;
      if (!url) throw new Error('jwks_endpoint mode requires jwksUrl in config');
      return url;
    }
    case 'oidc_discovery': {
      const url = config.oidcUrl;
      if (!url) throw new Error('oidc_discovery mode requires oidcUrl in config');
      return resolveOidcDiscovery(url);
    }
    default:
      throw new Error(`Cannot resolve JWKS URI for jwtMode: ${mode}`);
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Minimal HTTPS JSON fetcher (no extra deps).
 * @param {string} url
 * @returns {Promise<any>}
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'invoke-gateway/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

module.exports = { resolveJwksUri, getSigningKey };
