import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { Activity, AlertCircle, Filter, Globe, ChevronLeft, ChevronRight, Loader } from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/cn'

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
    hasPrevPage: false,
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
      const response = await authenticatedFetch(
        `/api/logs?page=${page}&limit=${limit}&status=${statusFilter}&projectId=${activeProject.id}`
      )
      const result = await response.json()

      if (result.success && result.data) {
        setLogs(result.data.logs || [])
        setPagination(
          result.data.pagination || {
            currentPage: 1,
            totalPages: 1,
            totalCount: 0,
            limit: 20,
            hasNextPage: false,
            hasPrevPage: false,
          }
        )
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
    setCurrentPage(1)
  }

  const handleFilterChange = (newFilter: 'all' | 'success' | 'error') => {
    setFilter(newFilter)
    setCurrentPage(1)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const formatBytes = (bytes: number) => {
    if (bytes == null || isNaN(bytes)) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const getStatusVariant = (code: number) => {
    if (code >= 200 && code < 300) return 'success'
    if (code >= 400) return 'destructive'
    return 'warning'
  }

  if (projectLoading || loading || !activeProject) {
    return (
      <ProtectedRoute>
        <Layout title="Execution Logs">
          <div className="flex justify-center items-center h-64">
            <div className="text-muted-foreground">
              {projectLoading ? (
                <div className="flex items-center gap-2">
                  <Loader className="w-5 h-5 text-primary animate-spin" />
                  <span className="animate-pulse">Loading projects...</span>
                </div>
              ) : !activeProject ? (
                'No project selected'
              ) : (
                <div className="flex items-center gap-2">
                  <Loader className="w-5 h-5 text-primary animate-spin" />
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
          <PageHeader
            title="Execution Logs"
            subtitle="Monitor all function execution history and performance across your serverless functions"
            icon={<Activity className="w-8 h-8" />}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Select value={filter} onValueChange={(v) => handleFilterChange(v as any)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="success">Success Only</SelectItem>
                    <SelectItem value="error">Errors Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => fetchLogs(currentPage, pageSize, filter)}>
                <Activity className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </PageHeader>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  All Function Executions
                  <Badge variant="secondary" className="ml-1">
                    {filter === 'all'
                      ? `${pagination.totalCount} total`
                      : `${pagination.totalCount} ${filter}`}
                  </Badge>
                </h2>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Show:</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => handlePageSizeChange(parseInt(v))}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">per page</span>
                </div>
              </div>

              {logs.length === 0 && !loading ? (
                <div className="text-center py-12">
                  <Activity className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {pagination.totalCount === 0 ? 'No Execution Logs' : `No ${filter} executions found`}
                  </h3>
                  <p className="text-muted-foreground">
                    {pagination.totalCount === 0
                      ? 'Function execution logs will appear here once functions are invoked'
                      : 'Try adjusting your filter or refresh the logs'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Function</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Request Size</TableHead>
                        <TableHead>Response Size</TableHead>
                        <TableHead>Client IP</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/admin/functions/${log.function_id}`}
                                className="text-foreground font-medium hover:text-primary transition-colors"
                              >
                                {log.function_name}
                              </Link>
                              {log.api_key_used && (
                                <Badge variant="warning">API Key</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(log.executed_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(log.status_code) as any}>
                              {log.status_code}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {log.execution_time_ms}ms
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatBytes(log.request_size)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatBytes(log.response_size)}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {log.client_ip}
                          </TableCell>
                          <TableCell>
                            {log.error_message ? (
                              <div className="flex items-center gap-1 text-red-400">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span className="text-xs" title={log.error_message}>
                                  {(() => {
                                    const msg = log.error_message.split('\n').find(s => s.trim()) ?? log.error_message
                                    return msg.length > 30 ? `${msg.substring(0, 30)}...` : msg
                                  })()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                router.push(
                                  `/admin/functions/${log.function_id}/execution-logs/${log.id}`
                                )
                              }
                              className="text-primary hover:text-primary"
                            >
                              <Activity className="w-4 h-4 mr-1" />
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    Showing {((pagination.currentPage - 1) * pagination.limit) + 1} to{' '}
                    {Math.min(pagination.currentPage * pagination.limit, pagination.totalCount)} of{' '}
                    {pagination.totalCount} results
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={!pagination.hasPrevPage || loading}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        let pageNum: number
                        if (pagination.totalPages <= 5) {
                          pageNum = i + 1
                        } else if (pagination.currentPage <= 3) {
                          pageNum = i + 1
                        } else if (pagination.currentPage >= pagination.totalPages - 2) {
                          pageNum = pagination.totalPages - 4 + i
                        } else {
                          pageNum = pagination.currentPage - 2 + i
                        }

                        return (
                          <Button
                            key={pageNum}
                            variant={pageNum === pagination.currentPage ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => handlePageChange(pageNum)}
                            disabled={loading}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        )
                      })}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={!pagination.hasNextPage || loading}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
