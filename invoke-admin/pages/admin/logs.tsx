import { useEffect, useState, useCallback } from 'react'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { Activity, Filter, Globe, ChevronLeft, ChevronRight, Loader, Layers } from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { KqlSearchBar } from '@/components/logs/KqlSearchBar'
import { TimeHistogram } from '@/components/logs/TimeHistogram'
import { LogRow, ALL_COLUMN_DEFS, DEFAULT_COLUMN_KEYS } from '@/components/logs/LogRow'
import type { ExecutionLog } from '@/components/logs/LogRow'
import { FieldSidebar } from '@/components/logs/FieldSidebar'
import { ColumnSelector } from '@/components/logs/ColumnSelector'
import { TimeRangePicker, DEFAULT_TIME_RANGE } from '@/components/logs/TimeRangePicker'
import type { TimeRange } from '@/components/logs/TimeRangePicker'

interface PaginationInfo {
  currentPage: number
  totalPages: number
  totalCount: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export default function Logs() {
  const { activeProject, loading: projectLoading } = useProject()

  // ── filter / search state ──────────────────────────────────────────────
  const [kqlQuery, setKqlQuery] = useState('')    // committed (after Enter)
  const [status, setStatus] = useState<'all' | 'success' | 'error'>('all')

  // ── pagination ────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // ── table state ───────────────────────────────────────────────────────
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_COLUMN_KEYS)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // ── data ──────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1, totalPages: 1, totalCount: 0, limit: 20,
    hasNextPage: false, hasPrevPage: false,
  })

  // ── UI panels ─────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE)

  // ── fetch logs ────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async (
    page: number,
    limit: number,
    statusFilter: string,
    q: string,
    projectId: string,
    from: Date,
    to: Date,
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        status: statusFilter,
        projectId,
        from: from.toISOString(),
        to: to.toISOString(),
      })
      if (q) params.set('q', q)

      const res = await authenticatedFetch(`/api/logs?${params}`)
      const json = await res.json()

      if (res.status === 400) {
        toast.error(json.message || 'Invalid KQL query')
        setLoading(false)
        return
      }

      if (json.success && json.data) {
        setLogs(json.data.logs ?? [])
        setPagination(json.data.pagination ?? { currentPage: 1, totalPages: 1, totalCount: 0, limit: 20, hasNextPage: false, hasPrevPage: false })
      } else {
        setLogs([])
      }
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!projectLoading && activeProject) {
      fetchLogs(currentPage, pageSize, status, kqlQuery, activeProject.id, timeRange.from, timeRange.to)
    }
  }, [currentPage, pageSize, status, kqlQuery, activeProject, projectLoading, timeRange, fetchLogs])

  // ── handlers ──────────────────────────────────────────────────────────
  const handleSearch = (query: string) => {
    setKqlQuery(query)
    setCurrentPage(1)
    setExpandedRows(new Set())
  }

  const handleStatusChange = (newStatus: 'all' | 'success' | 'error') => {
    setStatus(newStatus)
    setCurrentPage(1)
    setExpandedRows(new Set())
  }

  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range)
    setCurrentPage(1)
    setExpandedRows(new Set())
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setCurrentPage(1)
  }

  const handleToggleRow = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleClickFilter = useCallback((field: string, value: string) => {
    const escaped = value.includes(' ') ? `"${value}"` : value
    const term = `${field}:${escaped}`
    const newQuery = kqlQuery ? `${kqlQuery} AND ${term}` : term
    setKqlQuery(newQuery)
    setCurrentPage(1)
    setExpandedRows(new Set())
    setSidebarOpen(false)
  }, [kqlQuery])

  const visibleColumns = ALL_COLUMN_DEFS.filter(c => selectedColumns.includes(c.key))

  // ── loading / no-project guard ─────────────────────────────────────────
  if (projectLoading || !activeProject) {
    return (
      <ProtectedRoute>
        <Layout title="Execution Logs">
          <div className="flex justify-center items-center h-64">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader className="w-5 h-5 text-primary animate-spin" />
              <span className="animate-pulse">
                {projectLoading ? 'Loading projects...' : 'No project selected'}
              </span>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Layout title="Execution Logs">
        <div className="space-y-4">
          {/* Page Header */}
          <PageHeader
            title="Execution Logs"
            subtitle="Search and explore function execution history"
            icon={<Activity className="w-8 h-8" />}
          >
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => fetchLogs(currentPage, pageSize, status, kqlQuery, activeProject.id, timeRange.from, timeRange.to)}
            >
              <Activity className="w-3.5 h-3.5" />
              Refresh
            </Button>
            <TimeRangePicker value={timeRange} onChange={handleTimeRangeChange} />
          </PageHeader>

          {/* Search Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <KqlSearchBar
              onSearch={handleSearch}
              initialValue={kqlQuery}
            />

            <div className="flex items-center gap-2 flex-shrink-0">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={status} onValueChange={v => handleStatusChange(v as any)}>
                <SelectTrigger className="w-36 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success Only</SelectItem>
                  <SelectItem value="error">Errors Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ColumnSelector selectedKeys={selectedColumns} onChange={setSelectedColumns} />

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs flex-shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Layers className="w-3.5 h-3.5" />
              Fields
            </Button>
          </div>

          {/* Histogram */}
          <TimeHistogram
            projectId={activeProject.id}
            status={status}
            kqlQuery={kqlQuery}
            from={timeRange.from}
            to={timeRange.to}
          />

          {/* Log Table */}
          <Card>
            <CardContent className="pt-4 px-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  Log Entries
                  <Badge variant="secondary" className="text-xs">
                    {pagination.totalCount.toLocaleString()} {status !== 'all' ? status : 'total'}
                  </Badge>
                  {kqlQuery && (
                    <Badge variant="outline" className="text-xs font-mono max-w-[200px] truncate">
                      {kqlQuery}
                    </Badge>
                  )}
                </h2>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Show:</span>
                  <Select value={String(pageSize)} onValueChange={v => handlePageSizeChange(parseInt(v))}>
                    <SelectTrigger className="w-16 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 20, 50, 100].map(n => (
                        <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-16">
                  <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    {pagination.totalCount === 0 ? 'No Execution Logs' : 'No matching logs'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {pagination.totalCount === 0
                      ? 'Logs will appear here once functions are invoked'
                      : 'Try adjusting your search or filters'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-8 p-2" />
                        {visibleColumns.map(col => (
                          <TableHead key={col.key} className="text-xs font-medium py-2">
                            {col.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map(log => (
                        <LogRow
                          key={log.id}
                          log={log}
                          columns={visibleColumns}
                          isExpanded={expandedRows.has(log.id)}
                          onToggle={handleToggleRow}
                          onClickFilter={handleClickFilter}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Showing{' '}
                    {((pagination.currentPage - 1) * pagination.limit) + 1}–
                    {Math.min(pagination.currentPage * pagination.limit, pagination.totalCount)} of{' '}
                    {pagination.totalCount.toLocaleString()}
                  </p>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => setCurrentPage(p => p - 1)}
                      disabled={!pagination.hasPrevPage || loading}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>

                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      let pageNum: number
                      if (pagination.totalPages <= 5) pageNum = i + 1
                      else if (pagination.currentPage <= 3) pageNum = i + 1
                      else if (pagination.currentPage >= pagination.totalPages - 2)
                        pageNum = pagination.totalPages - 4 + i
                      else pageNum = pagination.currentPage - 2 + i

                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === pagination.currentPage ? 'default' : 'ghost'}
                          size="sm"
                          className="w-7 h-7 p-0 text-xs"
                          onClick={() => setCurrentPage(pageNum)}
                          disabled={loading}
                        >
                          {pageNum}
                        </Button>
                      )
                    })}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={!pagination.hasNextPage || loading}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Field Sidebar */}
        <FieldSidebar
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          projectId={activeProject.id}
          status={status}
          kqlQuery={kqlQuery}
          onClickFilter={handleClickFilter}
        />
      </Layout>
    </ProtectedRoute>
  )
}
