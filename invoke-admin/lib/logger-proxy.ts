/**
 * Thin HTTP proxy helper for forwarding requests to the invoke-logger service.
 */

const LOGGER_URL = (process.env.LOGGER_SERVICE_URL || 'http://localhost:3002').replace(/\/$/, '')
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET

export interface ProxyResult<T = unknown> {
  status: number
  data: T | null
  message: string | null
  success: boolean
}

export async function proxyToLogger<T = unknown>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'DELETE'
    body?: Record<string, unknown>
    query?: Record<string, string | number | boolean | undefined | null>
  } = {}
): Promise<ProxyResult<T>> {
  const { method = 'GET', body, query } = opts

  const url = new URL(`${LOGGER_URL}${path}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (INTERNAL_SECRET) {
    headers['x-internal-secret'] = INTERNAL_SECRET
  }

  const fetchOpts: RequestInit = {
    method,
    headers
  }
  if (body !== undefined && method !== 'GET') {
    fetchOpts.body = JSON.stringify(body)
  }

  const response = await fetch(url.toString(), fetchOpts)
  const json: any = await response.json().catch(() => ({}))

  return {
    status: response.status,
    success: json.success ?? response.ok,
    data: (json.data as T) ?? null,
    message: json.message ?? null
  }
}
