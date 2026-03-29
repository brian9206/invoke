import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useProject } from '@/contexts/ProjectContext'
import { Activity, Layers, ChevronLeft, ChevronRight, Loader, RefreshCw, ChevronsUpDown } from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import type { PanelImperativeHandle } from 'react-resizable-panels'

import { KqlSearchBar } from '@/components/logs/KqlSearchBar'
import { TimeHistogram } from '@/components/logs/TimeHistogram'
import { LogRow, ALL_COLUMN_DEFS, getDefaultColumnKeys, makeDynamicColumnDef } from '@/components/logs/LogRow'
import type { ExecutionLog, ColumnDef } from '@/components/logs/LogRow'
import { FieldSidebar } from '@/components/logs/FieldSidebar'
import { ColumnSelector } from '@/components/logs/ColumnSelector'
import { TimeRangePicker, DEFAULT_TIME_RANGE, parseExprToDate, exprToLabel } from '@/components/logs/TimeRangePicker'
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
  const router = useRouter()
  const { activeProject, loading: projectLoading } = useProject()

  // ── URL-derived filter state ────────────────────────────────────────
  const kqlQuery = (router.query.q as string) ?? ''
  const logType = ((router.query.type as string) === 'app' ? 'app' : 'request') as 'app' | 'request'
  const currentPage = Math.max(1, parseInt((router.query.page as string) ?? '1', 10) || 1)
  const pageSize = parseInt((router.query.limit as string) ?? '20', 10) || 20

  const timeRange = useMemo<TimeRange>(() => {
    const fromExpr = router.query.from as string | undefined
    const toExpr = router.query.to as string | undefined
    if (fromExpr && toExpr) {
      const from = parseExprToDate(fromExpr)
      const to = parseExprToDate(toExpr)
      if (from && to) {
        return { from, to, label: `${exprToLabel(fromExpr)} → ${exprToLabel(toExpr)}`, fromExpr, toExpr }
      }
    }
    return DEFAULT_TIME_RANGE
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.from, router.query.to])

  const selectedColumns = useMemo<string[]>(() => {
    const colsStr = router.query.cols as string | undefined
    if (colsStr) return colsStr.split(',')
    return getDefaultColumnKeys(logType)
  }, [router.query.cols, logType])

  // ── URL params helper ───────────────────────────────────────────────
  const pushParams = useCallback((updates: Record<string, string | null>) => {
    const query = { ...router.query }
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') {
        delete query[k]
      } else {
        query[k] = v
      }
    }
    router.push({ pathname: router.pathname, query })
  }, [router])

  // ── table state ─────────────────────────────────────────────────────
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
  const [histogramCollapsed, setHistogramCollapsed] = useState(false)
  const histogramPanelRef = useRef<PanelImperativeHandle | null>(null)

  // ── fetch logs ────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async (
    page: number,
    limit: number,
    q: string,
    projectId: string,
    from: Date,
    to: Date,
    type: string,
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        projectId,
        from: from.toISOString(),
        to: to.toISOString(),
      })
      if (q) params.set('q', q)
      params.set('logType', type)

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
    if (!router.isReady || projectLoading || !activeProject) return
    fetchLogs(currentPage, pageSize, kqlQuery, activeProject.id, timeRange.from, timeRange.to, logType)
  }, [router.isReady, currentPage, pageSize, kqlQuery, activeProject, projectLoading, timeRange, logType, fetchLogs])

  // ── handlers ──────────────────────────────────────────────────────────
  const handleSearch = (query: string) => {
    pushParams({ q: query || null, page: null })
    setExpandedRows(new Set())
  }

  const handleLogTypeChange = (value: string) => {
    pushParams({ type: value === 'request' ? null : value, page: null, cols: null })
    setExpandedRows(new Set())
  }

  const handleTimeRangeChange = (range: TimeRange) => {
    const p2 = (n: number) => String(n).padStart(2, '0')
    const absExpr = (d: Date) => `${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}`
    pushParams({
      from: range.fromExpr ?? absExpr(range.from),
      to: range.toExpr ?? absExpr(range.to),
      page: null,
    })
    setExpandedRows(new Set())
  }

  const handlePageSizeChange = (newSize: number) => {
    pushParams({ limit: newSize === 20 ? null : String(newSize), page: null })
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
    const escaped = `"${value}"`
    const term = `${field}:${escaped}`
    const newQuery = kqlQuery ? `${kqlQuery} AND ${term}` : term
    pushParams({ q: newQuery, page: null })
    setExpandedRows(new Set())
    setSidebarOpen(false)
  }, [kqlQuery, pushParams])

  const handleToggleColumn = useCallback((fieldPath: string) => {
    const next = selectedColumns.includes(fieldPath)
      ? selectedColumns.filter(k => k !== fieldPath)
      : [...selectedColumns, fieldPath]
    const defaults = getDefaultColumnKeys(logType)
    const isDefault = next.length === defaults.length && next.every((k, i) => k === defaults[i])
    pushParams({ cols: isDefault ? null : next.join(',') })
  }, [logType, selectedColumns, pushParams])

  // Merge static column defs with any dynamic field paths in selectedColumns
  const visibleColumns: ColumnDef[] = selectedColumns.map(key => {
    const staticDef = ALL_COLUMN_DEFS.find(c => c.key === key)
    return staticDef ?? makeDynamicColumnDef(key)
  })

  // ── loading / no-project guard ─────────────────────────────────────────
  if (projectLoading || !activeProject) {
    return (
      <ProtectedRoute>
        <Layout title="Monitoring">
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
      <Layout title="Monitoring">
        <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)] gap-3">

          {/* ── Top Toolbar ────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <Select value={logType} onValueChange={v => handleLogTypeChange(v)}>
              <SelectTrigger className="w-36 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="request" className="text-xs">HTTP</SelectItem>
                <SelectItem value="app" className="text-xs">Application</SelectItem>
              </SelectContent>
            </Select>
            <KqlSearchBar
              onSearch={handleSearch}
              initialValue={kqlQuery}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              <TimeRangePicker value={timeRange} onChange={handleTimeRangeChange} />
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs"
                onClick={() => fetchLogs(currentPage, pageSize, kqlQuery, activeProject.id, timeRange.from, timeRange.to, logType)}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </Button>
            </div>
          </div>

          {/* ── Resizable panels ────────────────────────────────────────── */}
          <ResizablePanelGroup
            orientation="vertical"
            className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden"
          >
            {/* Panel 1: Histogram */}
            <ResizablePanel
              panelRef={histogramPanelRef}
              defaultSize={25}
              minSize={10}
              collapsible
              collapsedSize={0}
              onResize={(size) => setHistogramCollapsed(size.asPercentage === 0)}
              className="bg-card"
            >
              <TimeHistogram
                projectId={activeProject.id}
                kqlQuery={kqlQuery}
                from={timeRange.from}
                to={timeRange.to}
              />
            </ResizablePanel>

            {/* Resize handle with collapse toggle */}
            <ResizableHandle withHandle className="data-[panel-group-direction=vertical]:h-2">
              <button
                onClick={() => {
                  if (histogramCollapsed) {
                    histogramPanelRef.current?.expand()
                  } else {
                    histogramPanelRef.current?.collapse()
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-5 w-5 items-center justify-center rounded-sm bg-border hover:bg-muted-foreground/20 transition-colors"
                title={histogramCollapsed ? 'Expand histogram' : 'Collapse histogram'}
              >
                <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </ResizableHandle>

            {/* Panel 2: Log Entries */}
            <ResizablePanel defaultSize={75} minSize={30} className="bg-card flex flex-col">

              {/* Filter bar */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0 flex-wrap">
                <div className="flex items-center gap-2 mr-auto">
                  <span className="text-sm font-semibold text-foreground">Log Entries</span>
                  <Badge variant="secondary" className="text-xs">
                    {pagination.totalCount.toLocaleString()} total
                  </Badge>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <ColumnSelector
                    selectedKeys={selectedColumns}
                    onChange={(keys) => {
                      const defaults = getDefaultColumnKeys(logType)
                      const isDefault = keys.length === defaults.length && keys.every((k, i) => k === defaults[i])
                      pushParams({ cols: isDefault ? null : keys.join(',') })
                    }}
                    projectId={activeProject.id}
                    logType={logType}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setSidebarOpen(true)}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Fields
                  </Button>
                  <div className="flex items-center gap-1.5 ml-2">
                    <span className="text-xs text-muted-foreground">Show:</span>
                    <Select value={String(pageSize)} onValueChange={v => handlePageSizeChange(parseInt(v))}>
                      <SelectTrigger className="w-16 h-8 text-xs">
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
              </div>

              {/* Table (scrollable) */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader className="w-5 h-5 animate-spin text-primary" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-16">
                    <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <h3 className="text-sm font-semibold text-foreground mb-1">
                      {pagination.totalCount === 0 ? 'No logs' : 'No matching logs'}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {pagination.totalCount === 0
                        ? 'Logs will appear here once functions are invoked'
                        : 'Try adjusting your search or filters'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
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
                            selectedColumns={selectedColumns}
                            onToggleColumn={handleToggleColumn}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Pagination (pinned bottom) */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-border flex-shrink-0">
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
                      onClick={() => pushParams({ page: String(currentPage - 1) })}
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
                          onClick={() => pushParams({ page: pageNum === 1 ? null : String(pageNum) })}
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
                      onClick={() => pushParams({ page: String(currentPage + 1) })}
                      disabled={!pagination.hasNextPage || loading}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Field Sidebar */}
        <FieldSidebar
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          projectId={activeProject.id}
          kqlQuery={kqlQuery}
          selectedColumns={selectedColumns}
          onClickFilter={handleClickFilter}
          onToggleColumn={handleToggleColumn}
        />
      </Layout>
    </ProtectedRoute>
  )
}
