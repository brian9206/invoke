import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../../../../components/Layout'
import ProtectedRoute from '../../../../../components/ProtectedRoute'
import { 
  ArrowLeft, 
  Activity,
  Calendar,
  Clock,
  Globe,
  User,
  Terminal,
  Code,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff
} from 'lucide-react'

interface ExecutionLogDetail {
  id: number
  function_id: string
  function_name: string
  function_version: string
  status_code: number
  execution_time_ms: number
  request_size: number
  response_size: number
  error_message?: string
  client_ip: string
  user_agent: string
  executed_at: string
  console_logs: Array<{
    level: string
    message: string
    timestamp: number
  }>
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
  
  const [logDetail, setLogDetail] = useState<ExecutionLogDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showRequestBody, setShowRequestBody] = useState(false)
  const [showResponseBody, setShowResponseBody] = useState(false)
  const [showHeaders, setShowHeaders] = useState({ request: false, response: false })

  useEffect(() => {
    if (logId) {
      fetchLogDetail()
    }
  }, [logId])

  const fetchLogDetail = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/functions/${functionId}/execution-logs/${logId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()
      if (data.success) {
        setLogDetail(data.data)
      } else {
        setError(data.message)
      }
    } catch (err) {
      setError('Failed to fetch execution log details')
      console.error('Error fetching log detail:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    }).format(new Date(dateString))
  }

  const formatBytes = (bytes: number) => {
    if (bytes == null || isNaN(bytes)) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatLogLevel = (level: string) => {
    const colors = {
      log: 'text-gray-400',
      info: 'text-blue-400',
      warn: 'text-yellow-400',
      error: 'text-red-400'
    }
    return colors[level as keyof typeof colors] || 'text-gray-400'
  }

  const formatJSON = (jsonString: string) => {
    try {
      return JSON.stringify(JSON.parse(jsonString), null, 2)
    } catch {
      return jsonString
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout>
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">Loading execution log details...</div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  if (error || !logDetail) {
    return (
      <ProtectedRoute>
        <Layout>
          <div className="flex items-center justify-center h-64">
            <div className="text-red-400">{error || 'Execution log not found'}</div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  const isSuccess = logDetail.status_code >= 200 && logDetail.status_code < 300
  const isError = logDetail.status_code >= 400

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => router.push(`/admin/functions/${functionId}`)}
                className="mr-4 p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-100 flex items-center">
                  <Activity className="w-8 h-8 mr-3" />
                  Execution Log Details
                </h1>
                <p className="text-gray-400 mt-1">
                  {logDetail.function_name} v{logDetail.function_version}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                isSuccess
                  ? 'bg-green-900/50 text-green-400'
                  : isError
                  ? 'bg-red-900/50 text-red-400'
                  : 'bg-yellow-900/50 text-yellow-400'
              }`}>
                {isSuccess ? <CheckCircle className="w-4 h-4 mr-1 inline" /> : 
                 isError ? <XCircle className="w-4 h-4 mr-1 inline" /> : 
                 <AlertCircle className="w-4 h-4 mr-1 inline" />}
                {logDetail.status_code}
              </span>
            </div>
          </div>

          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Execution Time</p>
                  <p className="text-2xl font-bold text-gray-100">
                    {logDetail.execution_time_ms}ms
                  </p>
                </div>
                <Clock className="w-8 h-8 text-gray-600" />
              </div>
            </div>

            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Request Size</p>
                  <p className="text-2xl font-bold text-gray-100">
                    {formatBytes(logDetail.request_size)}
                  </p>
                </div>
                <Globe className="w-8 h-8 text-gray-600" />
              </div>
            </div>

            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Response Size</p>
                  <p className="text-2xl font-bold text-gray-100">
                    {formatBytes(logDetail.response_size)}
                  </p>
                </div>
                <Code className="w-8 h-8 text-gray-600" />
              </div>
            </div>

            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Executed At</p>
                  <p className="text-lg font-bold text-gray-100">
                    {formatDate(logDetail.executed_at)}
                  </p>
                </div>
                <Calendar className="w-8 h-8 text-gray-600" />
              </div>
            </div>
          </div>

          {/* Request Details */}
          <div className="bg-gray-900 rounded-lg border border-gray-800">
            <div className="p-6 border-b border-gray-800">
              <h2 className="text-xl font-bold text-gray-100 flex items-center">
                <Globe className="w-5 h-5 mr-2" />
                Request Details
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-300">Method</label>
                  <p className="text-gray-100 font-mono">{logDetail.request_method}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">URL</label>
                  <p className="text-gray-100 font-mono break-all">{logDetail.request_url}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Client IP</label>
                  <p className="text-gray-100 font-mono">{logDetail.client_ip}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">User Agent</label>
                  <p className="text-gray-100 text-sm break-all">{logDetail.user_agent}</p>
                </div>
              </div>

              {/* Request Headers */}
              <div>
                <button
                  onClick={() => setShowHeaders(prev => ({ ...prev, request: !prev.request }))}
                  className="flex items-center text-gray-300 hover:text-gray-100 transition-colors"
                >
                  {showHeaders.request ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                  Request Headers ({Object.keys(logDetail.request_headers).length})
                </button>
                {showHeaders.request && (
                  <pre className="mt-2 bg-gray-800 rounded p-3 text-sm text-gray-300 overflow-x-auto">
                    {formatJSON(JSON.stringify(logDetail.request_headers))}
                  </pre>
                )}
              </div>

              {/* Request Body */}
              {logDetail.request_body && (
                <div>
                  <button
                    onClick={() => setShowRequestBody(!showRequestBody)}
                    className="flex items-center text-gray-300 hover:text-gray-100 transition-colors"
                  >
                    {showRequestBody ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                    Request Body
                  </button>
                  {showRequestBody && (
                    <pre className="mt-2 bg-gray-800 rounded p-3 text-sm text-gray-300 overflow-x-auto">
                      {formatJSON(logDetail.request_body)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Console Output */}
          {logDetail.console_logs && logDetail.console_logs.length > 0 && (
            <div className="bg-gray-900 rounded-lg border border-gray-800">
              <div className="p-6 border-b border-gray-800">
                <h2 className="text-xl font-bold text-gray-100 flex items-center">
                  <Terminal className="w-5 h-5 mr-2" />
                  Console Output
                </h2>
              </div>
              <div className="p-6">
                <div className="bg-black rounded p-4 font-mono text-sm space-y-1 max-h-96 overflow-y-auto">
                  {logDetail.console_logs.map((log, index) => (
                    <div key={index} className={`${formatLogLevel(log.level)} flex items-start`}>
                      <span className="text-gray-500 mr-3">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className="uppercase text-xs mr-3 font-bold">
                        {log.level}
                      </span>
                      <span className="flex-1 break-words">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Response Details */}
          <div className="bg-gray-900 rounded-lg border border-gray-800">
            <div className="p-6 border-b border-gray-800">
              <h2 className="text-xl font-bold text-gray-100 flex items-center">
                <Code className="w-5 h-5 mr-2" />
                Response Details
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Error Message */}
              {logDetail.error_message && (
                <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-400 mr-3 mt-0.5" />
                    <div>
                      <p className="text-red-400 font-medium">Error Message</p>
                      <p className="text-red-300 mt-1">{logDetail.error_message}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Response Headers */}
              <div>
                <button
                  onClick={() => setShowHeaders(prev => ({ ...prev, response: !prev.response }))}
                  className="flex items-center text-gray-300 hover:text-gray-100 transition-colors"
                >
                  {showHeaders.response ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                  Response Headers ({Object.keys(logDetail.response_headers).length})
                </button>
                {showHeaders.response && (
                  <pre className="mt-2 bg-gray-800 rounded p-3 text-sm text-gray-300 overflow-x-auto">
                    {formatJSON(JSON.stringify(logDetail.response_headers))}
                  </pre>
                )}
              </div>

              {/* Response Body */}
              {logDetail.response_body && (
                <div>
                  <button
                    onClick={() => setShowResponseBody(!showResponseBody)}
                    className="flex items-center text-gray-300 hover:text-gray-100 transition-colors"
                  >
                    {showResponseBody ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                    Response Body
                  </button>
                  {showResponseBody && (
                    <pre className="mt-2 bg-gray-800 rounded p-3 text-sm text-gray-300 overflow-x-auto">
                      {formatJSON(logDetail.response_body)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}