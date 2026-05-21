const SQL_SERVICE_URL = (process.env.SQL_SERVICE_URL || 'http://localhost:3010').replace(/\/$/, '')
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET

interface SqlServiceResponse<T = unknown> {
  success?: boolean
  data?: T
  message?: string
}

export interface SqlServiceResult<T = unknown> {
  ok: boolean
  status: number
  data: T | null
  message: string | null
}

async function requestSqlService<T = unknown>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE'
    body?: Record<string, unknown>
  } = {}
): Promise<SqlServiceResult<T>> {
  if (!INTERNAL_SECRET) {
    return {
      ok: false,
      status: 500,
      data: null,
      message: 'INTERNAL_SERVICE_SECRET is not configured'
    }
  }

  const { method = 'GET', body } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  headers['Authorization'] = `Bearer ${INTERNAL_SECRET}`

  const res = await fetch(`${SQL_SERVICE_URL}${path}`, {
    method,
    headers,
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined
  })

  const json: SqlServiceResponse<T> = await res.json().catch(() => ({}))

  return {
    ok: res.ok && (json.success ?? true),
    status: res.status,
    data: json.data ?? null,
    message: json.message ?? null
  }
}

export function initializeProjectDatabase(projectId: string, initializedBy?: number) {
  return requestSqlService('/databases/initialize', {
    method: 'POST',
    body: { projectId, initializedBy }
  })
}

export function getProjectDatabaseStatus(projectId: string) {
  return requestSqlService(`/databases/${projectId}/status`)
}

export function executeProjectQuery(projectId: string, sql: string, sessionContext?: string) {
  return requestSqlService(`/databases/${projectId}/query`, {
    method: 'POST',
    body: { sql, sessionContext }
  })
}

export function getProjectDatabaseCredentials(projectId: string) {
  return requestSqlService(`/databases/${projectId}/credentials`)
}

export function destroyProjectDatabase(projectId: string, confirmName: string) {
  return requestSqlService(`/databases/${projectId}`, {
    method: 'DELETE',
    body: { confirmName }
  })
}
