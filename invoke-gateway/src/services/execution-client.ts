import axios, { AxiosInstance } from 'axios'
import jwt from 'jsonwebtoken'

const EXECUTION_SERVICE_URL = process.env.EXECUTION_SERVICE_URL || 'http://localhost:3001'

/**
 * Pre-configured axios instance pointing at the execution service.
 * All function invocations from the gateway should go through this client
 * so that base URL, timeouts, and common headers are applied consistently.
 */
const executionClient: AxiosInstance = axios.create({
  baseURL: EXECUTION_SERVICE_URL,
  timeout: 30000
})

/**
 * Sign a short-lived internal JWT for the execution service.
 * Returns null when INTERNAL_SERVICE_SECRET is not set (dev / trust-all mode).
 */
function signGatewayToken(clientIp = ''): string | null {
  const secret = process.env.INTERNAL_SERVICE_SECRET
  if (!secret) return null
  return jwt.sign({ clientIp }, secret, { expiresIn: '60s', algorithm: 'HS256' })
}

/**
 * Build the standard set of headers that identify a gateway-originated
 * invocation to the execution service.
 */
function buildGatewayHeaders(clientIp = '', extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { 'x-gateway-request': '1', ...extraHeaders }
  const token = signGatewayToken(clientIp)
  if (token) headers['x-invoke-data'] = token
  return headers
}

/**
 * Build the invocation URL for a given function.
 */
function buildInvokeUrl(functionId: string, pathSuffix = '', query: Record<string, string> = {}): string {
  const suffix = pathSuffix || ''
  const base = `/invoke/${functionId}${suffix}`
  const qs = new URLSearchParams(query).toString()
  return qs ? `${base}?${qs}` : base
}

export { executionClient, signGatewayToken, buildGatewayHeaders, buildInvokeUrl, EXECUTION_SERVICE_URL }
