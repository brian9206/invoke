import { NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import { proxyToLogger } from '@/lib/logger-proxy'

export interface TraceConsoleLog {
  level: string
  message: string
  timestamp: string
}

export interface TraceExecution {
  executed_at: string
  execution_time_ms: number
  function_name: string
  function_id: string | null
  project_id: string
  error: string | null
  request: {
    method: string
    url: string
    ip: string | null
    headers: Record<string, string>
    body: { size: number | null; payload?: string }
  }
  response: {
    status: number
    headers: Record<string, string>
    body: { size: number | null; payload?: string }
  }
}

export interface TraceDetailResponse {
  trace_id: string
  execution: TraceExecution | null
  consoleLogs: TraceConsoleLog[]
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { trace_id } = req.query as { trace_id: string }
    const projectId = req.query.projectId as string | undefined

    if (projectId && projectId !== 'system') {
      const userProjects = await getUserProjects(req.user!.id)
      const hasAccess = req.user?.isAdmin || userProjects.some((p: any) => p.id === projectId)
      if (!hasAccess) {
        return res.status(403).json(createResponse(false, null, 'Access denied to this project', 403))
      }
    }

    const result = await proxyToLogger('/logs/search', {
      query: {
        q: `trace_id:"${trace_id}"`,
        limit: '100',
        ...(projectId ? { projectId } : {}),
      },
    })

    if (!result.success || !result.data) {
      return res.status(result.status).json(createResponse(false, null, result.message ?? 'Failed to fetch trace logs'))
    }

    const raw = result.data as any
    const logs: any[] = Array.isArray(raw?.logs) ? raw.logs : []

    // Separate logs by type:
    // - request logs have `source` injected into payload by dbInsertLog
    // - app logs have no `source` in payload, but have `level` + `message`
    const executionLog = logs.find(
      (l) => l.payload?.source === 'execution',
    )

    const appLogs = logs
      .filter((l) => !l.payload?.source)
      .sort((a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime())

    const consoleLogs: TraceConsoleLog[] = appLogs.map((l) => ({
      level: String(l.payload?.level ?? 'log'),
      message: String(l.payload?.message ?? ''),
      timestamp: String(l.payload?.timestamp ?? l.executed_at ?? ''),
    }))

    let execution: TraceExecution | null = null
    if (executionLog) {
      const p = executionLog.payload
      execution = {
        executed_at: executionLog.executed_at,
        execution_time_ms: p.execution_time_ms ?? 0,
        function_name: executionLog.function_name ?? p?.function?.name ?? '',
        function_id: executionLog.function_id ?? p?.function?.id ?? null,
        project_id: executionLog.project_id,
        error: p.error ?? null,
        request: {
          method: p.request?.method ?? '',
          url: p.request?.url ?? '',
          ip: p.request?.ip ?? null,
          headers: p.request?.headers ?? {},
          body: {
            size: p.request?.body?.size ?? null,
            payload: p.request?.body?.payload,
          },
        },
        response: {
          status: p.response?.status ?? 0,
          headers: p.response?.headers ?? {},
          body: {
            size: p.response?.body?.size ?? null,
            payload: p.response?.body?.payload,
          },
        },
      }
    }

    const responseData: TraceDetailResponse = {
      trace_id,
      execution,
      consoleLogs,
    }

    res.json(createResponse(true, responseData, 'Trace details retrieved successfully'))
  } catch (error) {
    console.error('Trace detail error:', error)
    res.status(500).json(createResponse(false, null, 'Internal server error'))
  }
}

export default withAuthAndMethods(['GET'])(handler)
