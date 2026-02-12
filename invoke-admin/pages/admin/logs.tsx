import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { Activity, AlertCircle, Filter, Globe, Clock, User, ChevronLeft, ChevronRight, Loader } from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'

interface ExecutionLog {
  id: number
  function_id: string
  function_name: string
  status_code: number
  execution_time_ms: number
  request_size: number
  response_size: number
  error_message?: string
  client_ip: string
  user_agent: string
  executed_at: string
  api_key_used?: boolean
}

interface PaginationInfo {
  currentPage: number
  totalPages: number
  totalCount: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

interface LogsResponse {
  logs: ExecutionLog[]
  pagination: PaginationInfo
}

export default function Logs() {
  const router = useRouter()
  const { activeProject, loading: projectLoading } = useProject()
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all')
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    limit: 20,
    hasNextPage: false,
    hasPrevPage: false
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    if (!projectLoading && activeProject) {
      fetchLogs()
    }
  }, [currentPage, pageSize, filter, activeProject, projectLoading])

  const fetchLogs = async (page = currentPage, limit = pageSize, statusFilter = filter) => {
    if (!activeProject) return
    
    setLoading(true)
    try {
      const response = await authenticatedFetch(`/api/logs?page=${page}&limit=${limit}&status=${statusFilter}&projectId=${activeProject.id}`)
      const result = await response.json()
      
      if (result.success && result.data) {
        setLogs(result.data.logs || [])
        setPagination(result.data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
          limit: 20,
          hasNextPage: false,
          hasPrevPage: false
        })
      } else {
        setLogs([])
      }
    } catch (error) {
      console.error('Error fetching logs:', error)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
  }

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize)
    setCurrentPage(1) // Reset to first page when changing page size
  }

  const handleFilterChange = (newFilter: 'all' | 'success' | 'error') => {
    setFilter(newFilter)
    setCurrentPage(1) // Reset to first page when changing filter
  }

  const handleRefresh = () => {
    fetchLogs(currentPage, pageSize, filter)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const formatBytes = (bytes: number) => {
    if (bytes == null || isNaN(bytes)) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes == 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  if (projectLoading || loading || !activeProject) {
    return (
      <ProtectedRoute>
        <Layout title="Execution Logs">
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-400">
              {projectLoading ? (
                <div className="flex items-center gap-2">
                  <Loader className="w-5 h-5 text-primary-500 animate-spin" />
                  <span className="animate-pulse">Loading projects...</span>
                </div>
              ) : !activeProject ? (
                'No project selected'
              ) : (
                <div className="flex items-center gap-2">
                  <Loader className="w-5 h-5 text-primary-500 animate-spin" />
                  <span className="animate-pulse">Loading execution logs...</span>
                </div>
              )}
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Layout title="Execution Logs">
        <div className="space-y-6">
          {/* Header */}
          <PageHeader
            title="Execution Logs"
            subtitle="Monitor all function execution history and performance across your serverless functions"
            icon={<Activity className="w-8 h-8" />}
          >
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={filter}
                  onChange={(e) => handleFilterChange(e.target.value as any)}
                  className="block w-full bg-gray-800 border-2 border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-100 px-3 py-2"
                >
                  <option value="all">All Status</option>
                  <option value="success">Success Only</option>
                  <option value="error">Errors Only</option>
                </select>
              </div>
              <button
                onClick={handleRefresh}
                className="btn-secondary flex items-center"
              >
                <Activity className="w-4 h-4 mr-2" />
                Refresh
              </button>
            </div>
          </PageHeader>

          {/* Execution Logs Table */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-100 flex items-center">
                <Globe className="w-5 h-5 mr-2" />
                All Function Executions
                <span className="ml-2 text-sm bg-gray-700 px-2 py-1 rounded">
                  {filter === 'all' ? `${pagination.totalCount} total entries` : `${pagination.totalCount} ${filter} entries`}
                </span>
              </h2>
              
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-400">Show:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
                    className="block bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-100"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm text-gray-400">per page</span>
                </div>
              </div>
            </div>

            {logs.length === 0 && !loading ? (
              <div className="text-center py-12">
                <Activity className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                <h3 className="text-xl font-semibold text-gray-300 mb-2">
                  {pagination.totalCount === 0 ? 'No Execution Logs' : `No ${filter} executions found`}
                </h3>
                <p className="text-gray-400">
                  {pagination.totalCount === 0
                    ? 'Function execution logs will appear here once functions are invoked'
                    : 'Try adjusting your filter or refresh the logs'
                  }
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-300">Function</th>
                      <th className="text-left py-3 px-4 text-gray-300">Timestamp</th>
                      <th className="text-left py-3 px-4 text-gray-300">Status</th>
                      <th className="text-left py-3 px-4 text-gray-300">Duration</th>
                      <th className="text-left py-3 px-4 text-gray-300">Request Size</th>
                      <th className="text-left py-3 px-4 text-gray-300">Response Size</th>
                      <th className="text-left py-3 px-4 text-gray-300">Client IP</th>
                      <th className="text-left py-3 px-4 text-gray-300">Error</th>
                      <th className="text-left py-3 px-4 text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-2">
                            <Link 
                              href={`/admin/functions/${log.function_id}`}
                              className="text-gray-100 font-medium hover:text-blue-400 transition-colors cursor-pointer"
                            >
                              {log.function_name}
                            </Link>
                            {log.api_key_used && (
                              <span className="px-2 py-1 text-xs rounded bg-yellow-900/30 text-yellow-400">
                                API Key
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          {formatDate(log.executed_at)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            log.status_code >= 200 && log.status_code < 300
                              ? 'bg-green-900/50 text-green-400'
                              : log.status_code >= 400
                              ? 'bg-red-900/50 text-red-400'
                              : 'bg-yellow-900/50 text-yellow-400'
                          }`}>
                            {log.status_code}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          {log.execution_time_ms}ms
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          {formatBytes(log.request_size)}
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          {formatBytes(log.response_size)}
                        </td>
                        <td className="py-3 px-4 text-gray-400 font-mono text-xs">
                          {log.client_ip}
                        </td>
                        <td className="py-3 px-4">
                          {log.error_message ? (
                            <div className="flex items-center text-red-400">
                              <AlertCircle className="w-4 h-4 mr-1" />
                              <span className="text-xs" title={log.error_message}>
                                {(log.error_message.split('\n').find(str => str.trim()) ?? log.error_message).length > 30 
                                  ? `${(log.error_message.split('\n').find(str => str.trim()) ?? log.error_message).substring(0, 30)}...`
                                  : (log.error_message.split('\n').find(str => str.trim()) ?? log.error_message)
                                }
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => router.push(`/admin/functions/${log.function_id}/execution-logs/${log.id}`)}
                            className="text-blue-400 hover:text-blue-300 text-sm flex items-center transition-colors active:scale-95"
                          >
                            <Activity className="w-4 h-4 mr-1" />
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-700">
                <div className="text-sm text-gray-400">
                  Showing {((pagination.currentPage - 1) * pagination.limit) + 1} to {Math.min(pagination.currentPage * pagination.limit, pagination.totalCount)} of {pagination.totalCount} results
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={!pagination.hasPrevPage || loading}
                    className="p-2 text-gray-400 hover:text-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      let pageNum;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (pagination.currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (pagination.currentPage >= pagination.totalPages - 2) {
                        pageNum = pagination.totalPages - 4 + i;
                      } else {
                        pageNum = pagination.currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          disabled={loading}
                          className={`px-3 py-1 text-sm rounded ${
                            pageNum === pagination.currentPage
                              ? 'bg-primary-600 text-white'
                              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                          } disabled:cursor-not-allowed`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={!pagination.hasNextPage || loading}
                    className="p-2 text-gray-400 hover:text-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}