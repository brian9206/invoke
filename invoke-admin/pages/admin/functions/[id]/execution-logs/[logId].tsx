import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { ArrowLeft, Activity, Calendar, Clock, Globe, User, Terminal, Code, AlertCircle, CheckCircle, XCircle, Copy, Eye, EyeOff, Loader } from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'

interface ExecutionLogDetail {
  id: number
  function_id: string
  function_name: string
  function_version: string
  project_id: string
  project_name: string
  status_code: number
  execution_time_ms: number
  request_size: number
  response_size: number
  error_message?: string
  client_ip: string
  user_agent: string
  executed_at: string
  console_logs: Array<{ level: string; message: string; timestamp: number }>
  request_headers: Record<string, string>
  response_headers: Record<string, string>
  request_body: string
  response_body: string
  request_method: string
  request_url: string
}

export default function ExecutionLogDetails() {
  const router = useRouter()
  const { id: functionId, logId } = router.query
  const { lockProject, unlockProject } = useProject()
  const hasLockedProject = useRef(false)

  const [logDetail, setLogDetail] = useState<ExecutionLogDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showRequestBody, setShowRequestBody] = useState(false)
  const [showResponseBody, setShowResponseBody] = useState(false)
  const [showHeaders, setShowHeaders] = useState({ request: false, response: false })

  useEffect(() => { if (logId) fetchLogDetail() }, [logId])

  useEffect(() => {
    if (logDetail?.project_id && logDetail?.project_name && !hasLockedProject.current) {
      hasLockedProject.current = true
      lockProject({ id: logDetail.project_id, name: logDetail.project_name, description: '', role: 'locked' })
    }
    return () => { if (hasLockedProject.current) { hasLockedProject.current = false; unlockProject() } }
  }, [logDetail?.project_id])

  const fetchLogDetail = async () => {
    setLoading(true)
    try {
      const response = await authenticatedFetch(`/api/functions/${functionId}/execution-logs/${logId}`)
      const data = await response.json()
      if (data.success) setLogDetail(data.data)
      else setError(data.message)
    } catch { setError('Failed to fetch execution log details') }
    finally { setLoading(false) }
  }

  const formatDate = (ds: string) => new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date(ds))
  const formatBytes = (bytes: number | string | null | undefined) => {
    const value = typeof bytes === 'string' ? Number(bytes) : bytes
    if (value == null || !Number.isFinite(value) || value < 0) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (value === 0) return '0 Bytes'
    const index = Math.floor(Math.log(value) / Math.log(1024))
    const i = Math.min(index, sizes.length - 1)
    return Math.round(value / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }
  const formatLogLevel = (level: string) => ({ log: 'text-muted-foreground', info: 'text-blue-400', warn: 'text-yellow-400', error: 'text-red-400' }[level as string] || 'text-muted-foreground')
  const formatJSON = (jsonString: string) => { try { return JSON.stringify(JSON.parse(jsonString), null, 2) } catch { return jsonString } }

  if (loading) return (
    <ProtectedRoute><Layout><div className="flex items-center justify-center h-64"><Loader className="w-8 h-8 text-primary animate-spin" /></div></Layout></ProtectedRoute>
  )
  if (error || !logDetail) return (
    <ProtectedRoute><Layout><div className="flex items-center justify-center h-64 text-destructive">{error || 'Execution log not found'}</div></Layout></ProtectedRoute>
  )

  const isSuccess = logDetail.status_code >= 200 && logDetail.status_code < 300
  const isError = logDetail.status_code >= 400

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/functions/${functionId}`)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <PageHeader
                title="Execution Log Details"
                subtitle={`${logDetail.function_name} v${logDetail.function_version}`}
                icon={<Activity className="w-8 h-8 text-primary" />}
              />
            </div>
            <Badge variant={isSuccess ? 'success' : isError ? 'destructive' : 'warning'} className="flex items-center gap-1">
              {isSuccess ? <CheckCircle className="w-4 h-4" /> : isError ? <XCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {logDetail.status_code}
            </Badge>
          </div>

          {/* Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: 'Execution Time', value: `${logDetail.execution_time_ms}ms`, icon: Clock },
              { label: 'Request Size', value: formatBytes(logDetail.request_size), icon: Globe },
              { label: 'Response Size', value: formatBytes(logDetail.response_size), icon: Code },
              { label: 'Executed At', value: formatDate(logDetail.executed_at), icon: Calendar },
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
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-base font-bold flex items-center gap-2 text-foreground"><Globe className="w-5 h-5" />Request Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground font-medium">Method</p><p className="text-foreground font-mono">{logDetail.request_method}</p></div>
                <div><p className="text-muted-foreground font-medium">URL</p><p className="text-foreground font-mono break-all">{logDetail.request_url}</p></div>
                <div><p className="text-muted-foreground font-medium">Client IP</p><p className="text-foreground font-mono">{logDetail.client_ip}</p></div>
                <div><p className="text-muted-foreground font-medium">User Agent</p><p className="text-foreground break-all">{logDetail.user_agent}</p></div>
              </div>
              <div>
                <button onClick={() => setShowHeaders(p => ({ ...p, request: !p.request }))} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {showHeaders.request ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  Request Headers ({Object.keys(logDetail.request_headers).length})
                </button>
                {showHeaders.request && <pre className="mt-2 bg-muted rounded p-3 text-sm text-muted-foreground overflow-x-auto">{formatJSON(JSON.stringify(logDetail.request_headers))}</pre>}
              </div>
              {logDetail.request_body && (
                <div>
                  <button onClick={() => setShowRequestBody(!showRequestBody)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {showRequestBody ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}Request Body
                  </button>
                  {showRequestBody && <pre className="mt-2 bg-muted rounded p-3 text-sm text-muted-foreground overflow-x-auto">{formatJSON(logDetail.request_body)}</pre>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Console Output */}
          {logDetail.console_logs && logDetail.console_logs.length > 0 && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-base font-bold flex items-center gap-2 text-foreground"><Terminal className="w-5 h-5" />Console Output</h2>
                <div className="bg-black rounded-lg p-4 font-mono text-sm space-y-1 max-h-96 overflow-y-auto">
                  {logDetail.console_logs.map((log, index) => (
                    <div key={index} className={cn('flex gap-3', formatLogLevel(log.level))}>
                      <span className="text-muted-foreground whitespace-nowrap">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="flex-1 break-words whitespace-pre-wrap break-all">{log.message}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Response Details */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-base font-bold flex items-center gap-2 text-foreground"><Code className="w-5 h-5" />Response Details</h2>
              {logDetail.error_message && (
                <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-red-400 font-medium">Error Message</p>
                    <pre className="text-red-300 mt-1 text-sm whitespace-pre-wrap">{logDetail.error_message}</pre>
                  </div>
                </div>
              )}
              <div>
                <button onClick={() => setShowHeaders(p => ({ ...p, response: !p.response }))} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {showHeaders.response ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  Response Headers ({Object.keys(logDetail.response_headers).length})
                </button>
                {showHeaders.response && <pre className="mt-2 bg-muted rounded p-3 text-sm text-muted-foreground overflow-x-auto">{formatJSON(JSON.stringify(logDetail.response_headers))}</pre>}
              </div>
              {logDetail.response_body && (
                <div>
                  <button onClick={() => setShowResponseBody(!showResponseBody)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {showResponseBody ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}Response Body
                  </button>
                  {showResponseBody && <pre className="mt-2 bg-muted rounded p-3 text-sm text-muted-foreground overflow-x-auto">{formatJSON(logDetail.response_body)}</pre>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
