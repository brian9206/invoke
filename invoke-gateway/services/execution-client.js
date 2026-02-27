const axios = require('axios');
const jwt = require('jsonwebtoken');

const EXECUTION_SERVICE_URL = process.env.EXECUTION_SERVICE_URL || 'http://localhost:3001';

/**
 * Pre-configured axios instance pointing at the execution service.
 * All function invocations from the gateway should go through this client
 * so that base URL, timeouts, and common headers are applied consistently.
 */
const executionClient = axios.create({
  baseURL: EXECUTION_SERVICE_URL,
  timeout: 30000,
});

/**
 * Sign a short-lived internal JWT for the execution service.
 * Returns null when INTERNAL_GATEWAY_SECRET is not set (dev / trust-all mode).
 *
 * @param {string} clientIp  - Original client IP to embed in the payload.
 * @returns {string | null}
 */
function signGatewayToken(clientIp = '') {
  const secret = process.env.INTERNAL_GATEWAY_SECRET;
  if (!secret) return null;
  return jwt.sign({ clientIp }, secret, { expiresIn: '60s', algorithm: 'HS256' });
}

/**
 * Build the standard set of headers that identify a gateway-originated
 * invocation to the execution service.
 *
 * @param {string}  clientIp      - Original client IP (used in the JWT payload).
 * @param {object}  extraHeaders  - Additional headers to merge in.
 * @returns {object}
 */
function buildGatewayHeaders(clientIp = '', extraHeaders = {}) {
  const headers = { 'x-gateway-request': '1', ...extraHeaders };
  const token = signGatewayToken(clientIp);
  if (token) headers['x-invoke-data'] = token;
  return headers;
}

/**
 * Build the invocation URL for a given function.
 *
 * @param {string} functionId  - Function UUID.
 * @param {string} pathSuffix  - Unmatched tail of the request path (may be empty).
 * @param {object} query       - Query-string parameters to forward.
 * @returns {string}
 */
function buildInvokeUrl(functionId, pathSuffix = '', query = {}) {
  const suffix = pathSuffix || '';
  const base = `/invoke/${functionId}${suffix}`;
  const qs = new URLSearchParams(query).toString();
  return qs ? `${base}?${qs}` : base;
}

module.exports = { executionClient, signGatewayToken, buildGatewayHeaders, buildInvokeUrl, EXECUTION_SERVICE_URL };
