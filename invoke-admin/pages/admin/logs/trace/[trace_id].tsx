import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import {
  Activity,
  Calendar,
  Clock,
  Globe,
  Terminal,
  Code,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Loader,
} from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import type { TraceDetailResponse } from '@/pages/api/logs/trace/[trace_id]'

export default function TraceDetail() {
  const router = useRouter()
  const { trace_id } = router.query as { trace_id: string }
  const { activeProject } = useProject()

  const [data, setData] = useState<TraceDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showRequestHeaders, setShowRequestHeaders] = useState(false)
  const [showRequestBody, setShowRequestBody] = useState(false)
  const [showResponseHeaders, setShowResponseHeaders] = useState(false)
  const [showResponseBody, setShowResponseBody] = useState(false)

  useEffect(() => {
    if (trace_id) fetchTrace()
  }, [trace_id, activeProject])

  const fetchTrace = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (activeProject?.id) params.set('projectId', activeProject.id)
      const res = await authenticatedFetch(`/api/logs/trace/${trace_id}?${params}`)
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      } else {
        setError(json.message || 'Failed to load trace')
      }
    } catch {
      setError('Failed to load trace details')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (ds: string) =>
    new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(ds))

  const formatBytes = (bytes: number | null | undefined) => {
    if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return 'N/A'
    if (bytes === 0) return '0 Bytes'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const formatJSON = (str: string) => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2)
    } catch {
      return str
    }
  }

  const consoleLevelClass = (level: string) =>
    ({ log: 'text-muted-foreground', info: 'text-blue-400', warn: 'text-yellow-400', error: 'text-red-400' }[
      level
    ] ?? 'text-muted-foreground')

  const formatTimestamp = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString()
    } catch {
      return ts
    }
  }

  const HeadersTable = ({ headers }: { headers: Record<string, string> }) => (
    <table className="mt-2 w-full text-xs border border-border rounded overflow-hidden">
      <tbody>
        {Object.entries(headers).map(([k, v]) => (
          <tr key={k} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
            <td className="py-1.5 px-3 font-mono text-muted-foreground align-top w-[260px] shrink-0">{k}:</td>
            <td className="py-1.5 px-3 font-mono text-foreground break-all">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Trace Details">
          <div className="flex items-center justify-center h-64">
            <Loader className="w-8 h-8 text-primary animate-spin" />
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  if (error || !data) {
    return (
      <ProtectedRoute>
        <Layout title="Trace Details">
          <div className="flex items-center justify-center h-64 text-destructive">
            {error || 'Trace not found'}
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  const { execution, consoleLogs } = data
  const status = execution?.response?.status ?? null
  const isSuccess = status !== null && status >= 200 && status < 300
  const isError = status !== null && status >= 400

  return (
    <ProtectedRoute>
      <Layout title="Trace Details">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <PageHeader
              title="Trace Details"
              subtitle={
                execution?.function_name
                  ? `${execution.function_name} · ${trace_id}`
                  : trace_id
              }
              icon={<Activity className="w-8 h-8 text-primary" />}
            />
            {status !== null && (
              <Badge
                variant={isSuccess ? 'success' : isError ? 'destructive' : 'warning'}
                className="flex items-center gap-1"
              >
                {isSuccess ? (
                  <CheckCircle className="w-4 h-4" />
                ) : isError ? (
                  <XCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {status}
              </Badge>
            )}
          </div>

          {/* Overview cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                label: 'Execution Time',
                value: execution ? `${execution.execution_time_ms}ms` : '—',
                icon: Clock,
              },
              {
                label: 'Request Size',
                value: formatBytes(execution?.request?.body?.size),
                icon: Globe,
              },
              {
                label: 'Response Size',
                value: formatBytes(execution?.response?.body?.size),
                icon: Code,
              },
              {
                label: 'Executed At',
                value: execution ? formatDate(execution.executed_at) : '—',
                icon: Calendar,
              },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-muted-foreground text-sm">{label}</p>
                      <p className="text-xl font-bold text-foreground mt-0.5">{value}</p>
                    </div>
                    <Icon className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Request Details */}
          {execution && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
                  <Globe className="w-5 h-5" />
                  Request Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground font-medium">Method</p>
                    <p className="text-foreground font-mono">{execution.request.method}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">URL</p>
                    <p className="text-foreground font-mono break-all">{execution.request.url}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">Client IP</p>
                    <p className="text-foreground font-mono">{execution.request.ip ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">User Agent</p>
                    <p className="text-foreground break-all">
                      {execution.request.headers?.['user-agent'] ?? '—'}
                    </p>
                  </div>
                </div>
                <div>
                  <button
                    onClick={() => setShowRequestHeaders((v) => !v)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showRequestHeaders ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    Request Headers ({Object.keys(execution.request.headers ?? {}).length})
                  </button>
                  {showRequestHeaders && (
                    <HeadersTable headers={execution.request.headers ?? {}} />
                  )}
                </div>
                {execution.request.body.payload && (
                  <div>
                    <button
                      onClick={() => setShowRequestBody((v) => !v)}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showRequestBody ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      Request Body
                    </button>
                    {showRequestBody && (
                      <pre className="mt-2 bg-muted rounded p-3 text-sm text-muted-foreground overflow-x-auto">
                        {formatJSON(execution.request.body.payload)}
                      </pre>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Console Output */}
          {consoleLogs.length > 0 && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
                  <Terminal className="w-5 h-5" />
                  Console Output
                </h2>
                <div className="bg-black rounded-lg p-4 font-mono text-sm space-y-1 max-h-96 overflow-y-auto">
                  {consoleLogs.map((entry, i) => (
                    <div key={i} className={cn('flex gap-3', consoleLevelClass(entry.level))}>
                      <span className="text-muted-foreground whitespace-nowrap">
                        [{formatTimestamp(entry.timestamp)}]
                      </span>
                      <span className="flex-1 break-words whitespace-pre-wrap break-all">
                        {entry.message}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Response Details */}
          {execution && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
                  <Code className="w-5 h-5" />
                  Response Details
                </h2>
                <div>
                  <button
                    onClick={() => setShowResponseHeaders((v) => !v)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showResponseHeaders ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    Response Headers ({Object.keys(execution.response.headers ?? {}).length})
                  </button>
                  {showResponseHeaders && (
                    <HeadersTable headers={execution.response.headers ?? {}} />
                  )}
                </div>
                {execution.response.body.payload && (
                  <div>
                    <button
                      onClick={() => setShowResponseBody((v) => !v)}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showResponseBody ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      Response Body
                    </button>
                    {showResponseBody && (
                      <pre className="mt-2 bg-muted rounded p-3 text-sm text-muted-foreground overflow-x-auto">
                        {formatJSON(execution.response.body.payload)}
                      </pre>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
