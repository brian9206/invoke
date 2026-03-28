import React from 'react'
import Link from 'next/link'
import { ChevronRight, Plus, ExternalLink } from 'lucide-react'
import { TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'

export interface FunctionLogPayload {
  execution_time_ms: number
  request: {
    url: string
    method: string
    ip: string
    headers: Record<string, string>
    body: { size: number | null; payload?: string }
  }
  response: {
    status: number
    headers: Record<string, string>
    body: { size: number | null; payload?: string }
  }
  error?: string
  console?: Array<{ level: string; message: string; timestamp: number }>
}

export interface ExecutionLog {
  id: number
  function_id: string
  function_name: string
  executed_at: string
  payload: FunctionLogPayload
}

export interface ColumnDef {
  key: string
  label: string
  width?: string
  render: (log: ExecutionLog) => React.ReactNode
}

interface LogRowProps {
  log: ExecutionLog
  columns: ColumnDef[]
  isExpanded: boolean
  onToggle: (id: number) => void
  onClickFilter: (field: string, value: string) => void
}

/** Flatten a nested object to `[dotPath, value]` pairs */
function flattenPayload(obj: unknown, prefix = ''): [string, unknown][] {
  const out: [string, unknown][] = []
  if (obj == null || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenPayload(v, path))
    } else if (Array.isArray(v)) {
      out.push([path, `[Array(${v.length})]`])
    } else {
      out.push([path, v])
    }
  }
  return out
}

function FilterButton({ field, value, onClick }: { field: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick() }}
      title={`Filter: ${field}:${value}`}
      className="inline-flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
    >
      <Plus className="w-3 h-3" />
    </button>
  )
}

export function LogRow({ log, columns, isExpanded, onToggle, onClickFilter }: LogRowProps) {
  const totalCols = columns.length + 1 // +1 for chevron

  const addFilter = (field: string, value: unknown) => {
    if (value == null) return
    const v = String(value)
    onClickFilter(field, v)
  }

  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer transition-colors',
          isExpanded ? 'bg-muted/40 hover:bg-muted/40 border-l-2 border-l-primary' : 'hover:bg-muted/30'
        )}
        onClick={() => onToggle(log.id)}
      >
        <TableCell className="w-8 p-2 pl-3">
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 text-muted-foreground transition-transform duration-150',
              isExpanded && 'rotate-90'
            )}
          />
        </TableCell>
        {columns.map(col => (
          <TableCell key={col.key} className="py-2 text-sm">
            {col.render(log)}
          </TableCell>
        ))}
      </TableRow>

      {isExpanded && (
        <TableRow className="hover:bg-transparent border-0">
          <TableCell colSpan={totalCols} className="p-0 pb-1">
            <div className="mx-2 mb-1 rounded-md border border-border bg-card shadow-sm">
              <Tabs defaultValue="table" className="w-full">
                <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-border">
                  <TabsList className="h-6 gap-0.5 bg-muted/50 overflow-hidden">
                    <TabsTrigger value="table" className="text-xs h-5 px-2.5 data-[state=active]:bg-background">
                      Table
                    </TabsTrigger>
                    <TabsTrigger value="json" className="text-xs h-5 px-2.5 data-[state=active]:bg-background">
                      JSON
                    </TabsTrigger>
                  </TabsList>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={e => e.stopPropagation()}
                  >
                    <Link href={`/admin/functions/${log.function_id}/execution-logs/${log.id}`}>
                      <ExternalLink className="w-3 h-3" />
                      Full details
                    </Link>
                  </Button>
                </div>

                {/* ── Table view ── */}
                <TabsContent value="table" className="m-0 p-0">
                  <div className="max-h-64 overflow-y-auto border-t border-border">
                    <table className="w-full text-xs">
                      <tbody>
                        {flattenPayload(log.payload).map(([field, value]) => (
                          <tr
                            key={field}
                            className="group border-b border-border/40 last:border-0 hover:bg-muted/30"
                          >
                            <td className="py-1 pl-3 pr-2 text-muted-foreground font-mono align-top text-xs break-all w-[250px]">
                              {field}
                            </td>
                            <td className="py-1 pr-3 font-mono">
                              <div className="flex items-start gap-1.5">
                                <span className="break-all text-foreground">{String(value ?? '—')}</span>
                                {value != null && value !== '' && (
                                  <FilterButton
                                    field={field}
                                    value={String(value)}
                                    onClick={() => addFilter(field, value)}
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* ── JSON view ── */}
                <TabsContent value="json" className="m-0 p-0">
                  <pre className="text-xs font-mono max-h-32 overflow-y-auto p-3 leading-relaxed whitespace-pre-wrap break-all text-foreground border-t border-border">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                </TabsContent>
              </Tabs>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ── Shared column definitions ──────────────────────────────────────────────

function formatBytes(bytes: number | string | null | undefined): string {
  const value = typeof bytes === 'string' ? Number(bytes) : bytes
  if (value == null || !Number.isFinite(value) || value < 0) return 'N/A'
  if (value === 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), sizes.length - 1)
  return `${Math.round((value / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`
}

function getStatusVariant(code: number): string {
  if (code >= 200 && code < 300) return 'success'
  if (code >= 400) return 'destructive'
  return 'warning'
}

export const ALL_COLUMN_DEFS: ColumnDef[] = [
  {
    key: 'timestamp',
    label: 'Timestamp',
    render: (log) => (
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {new Date(log.executed_at).toLocaleString()}
      </span>
    ),
  },
  {
    key: 'function',
    label: 'Function',
    render: (log) => (
      <Link
        href={`/admin/functions/${log.function_id}`}
        className="font-medium text-foreground hover:text-primary transition-colors"
        onClick={e => e.stopPropagation()}
      >
        {log.function_name}
      </Link>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (log) => {
      const status = (log.payload as any)?.response?.status
      return status ? (
        <Badge variant={getStatusVariant(status) as any} className="font-mono text-xs">
          {status}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      )
    },
  },
  {
    key: 'duration',
    label: 'Duration',
    render: (log) => (
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {(log.payload as any)?.execution_time_ms ?? '—'}ms
      </span>
    ),
  },
  {
    key: 'method',
    label: 'Method',
    render: (log) => (
      <Badge variant="outline" className="font-mono text-xs">
        {(log.payload as any)?.request?.method ?? '—'}
      </Badge>
    ),
  },
  {
    key: 'ip',
    label: 'Client IP',
    render: (log) => (
      <span className="text-muted-foreground font-mono text-xs">{(log.payload as any)?.request?.ip ?? '—'}</span>
    ),
  },
  {
    key: 'req_size',
    label: 'Req Size',
    render: (log) => (
      <span className="text-muted-foreground text-xs">{formatBytes((log.payload as any)?.request?.body?.size)}</span>
    ),
  },
  {
    key: 'res_size',
    label: 'Res Size',
    render: (log) => (
      <span className="text-muted-foreground text-xs">{formatBytes((log.payload as any)?.response?.body?.size)}</span>
    ),
  },
  {
    key: 'error',
    label: 'Error',
    render: (log) => {
      const error = (log.payload as any)?.error
      return error ? (
        <span
          className="text-red-400 text-xs max-w-[200px] truncate block"
          title={error}
        >
          {error.split('\n').find((s: string) => s.trim()) ?? error}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      )
    },
  },
]

export const DEFAULT_COLUMN_KEYS = ['timestamp', 'function', 'status', 'duration', 'method', 'ip']
