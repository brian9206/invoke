import { useEffect, useState, useCallback, useRef } from 'react'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'
import { authenticatedFetch } from '@/lib/frontend-utils'
import {
  DatabaseZap,
  Play,
  Loader,
  AlertCircle,
  Copy,
  Trash2,
  Clock,
  Terminal,
  Info,
  Settings,
  SlidersHorizontal,
  X,
  CheckCheck
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface StorageInfo {
  bytes: number
  limit: number
  percentage: number
}

interface DatabaseStatus {
  initialized: boolean
  db_name?: string
  status?: string
  storage?: StorageInfo
  users?: { app: string; admin: string }
  initialized_at?: string
  initialized_by?: number
}

interface QueryResult {
  columns: string[]
  rows: any[][]
  rowCount: number
  totalRows: number
  truncated: boolean
  duration_ms: number
  command: string
  storage_warning?: string
}

interface QueryHistoryItem {
  sql: string
  timestamp: Date
  success: boolean
  duration_ms?: number
  rowCount?: number
}

export default function SqlDatabase() {
  const { user } = useAuth()
  const { activeProject } = useProject()

  const [loading, setLoading] = useState(true)
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>({ initialized: false })
  const [initializing, setInitializing] = useState(false)
  const [activeTab, setActiveTab] = useState('console')

  // SQL Console state
  const [sql, setSql] = useState('')
  const [sessionContext, setSessionContext] = useState('')
  const [showSessionPanel, setShowSessionPanel] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([])

  // Copy feedback state
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Destroy state
  const [showDestroyModal, setShowDestroyModal] = useState(false)
  const [destroyConfirm, setDestroyConfirm] = useState('')
  const [destroying, setDestroying] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (user && activeProject && activeProject.id !== 'system') {
      fetchStatus()
    } else {
      setLoading(false)
    }
  }, [activeProject, user])

  const fetchStatus = async () => {
    try {
      setLoading(true)
      const res = await authenticatedFetch(`/api/projects/${activeProject!.id}/database/status`)
      const data = await res.json()
      if (data.success) setDbStatus(data.data)
    } catch (err) {
      console.error('Failed to fetch database status:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleInitialize = async () => {
    try {
      setInitializing(true)
      const res = await authenticatedFetch(`/api/projects/${activeProject!.id}/database/initialize`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        await fetchStatus()
      } else {
        alert(data.message || 'Initialization failed')
      }
    } catch (err) {
      alert('Failed to initialize database')
    } finally {
      setInitializing(false)
    }
  }

  const handleExecuteQuery = useCallback(async () => {
    const trimmedSql = sql.trim()
    if (!trimmedSql || executing) return
    try {
      setExecuting(true)
      setQueryError(null)
      setQueryResult(null)
      const body: Record<string, string> = { sql: trimmedSql }
      if (sessionContext.trim()) body.sessionContext = sessionContext.trim()
      const res = await authenticatedFetch(`/api/projects/${activeProject!.id}/database/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (data.success) {
        setQueryResult(data.data)
        setQueryHistory(prev => [
          {
            sql: trimmedSql,
            timestamp: new Date(),
            success: true,
            duration_ms: data.data.duration_ms,
            rowCount: data.data.rowCount
          },
          ...prev.slice(0, 49)
        ])
        fetchStatus()
      } else {
        setQueryError(data.message || 'Query failed')
        setQueryHistory(prev => [{ sql: trimmedSql, timestamp: new Date(), success: false }, ...prev.slice(0, 49)])
      }
    } catch (err: any) {
      setQueryError(err.message || 'Failed to execute query')
    } finally {
      setExecuting(false)
    }
  }, [sql, sessionContext, executing, activeProject])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleExecuteQuery()
    }
  }

  const handleDestroy = async () => {
    try {
      setDestroying(true)
      const res = await authenticatedFetch(`/api/projects/${activeProject!.id}/database/destroy`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_name: destroyConfirm })
      })
      const data = await res.json()
      if (data.success) {
        setShowDestroyModal(false)
        setDestroyConfirm('')
        setQueryResult(null)
        setQueryError(null)
        await fetchStatus()
      } else {
        alert(data.message || 'Destroy failed')
      }
    } catch {
      alert('Failed to destroy database')
    } finally {
      setDestroying(false)
    }
  }

  const copyToClipboard = useCallback((text: string, field: string) => {
    try {
      if (typeof window === 'undefined') {
        return
      }

      // Try modern Clipboard API first
      if (window.navigator?.clipboard) {
        window.navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopiedField(field)
            setTimeout(() => setCopiedField(prev => (prev === field ? null : prev)), 1500)
          })
          .catch(() => {
            // Fallback to old method if clipboard API fails
            fallbackCopy(text, field)
          })
      } else {
        // Fallback for browsers without Clipboard API
        fallbackCopy(text, field)
      }
    } catch (e) {
      console.error('Failed to copy:', e)
    }
  }, [])

  const fallbackCopy = (text: string, field: string) => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      setCopiedField(field)
      setTimeout(() => setCopiedField(prev => (prev === field ? null : prev)), 1500)
    } catch (e) {
      console.error('Fallback copy failed:', e)
    } finally {
      document.body.removeChild(textarea)
    }
  }

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <button
      type='button'
      onClick={() => copyToClipboard(text, field)}
      className='inline-flex items-center justify-center h-6 w-6 p-0 shrink-0 rounded hover:bg-muted/50 transition-colors'
      title='Copy to clipboard'
    >
      {copiedField === field ? (
        <CheckCheck className='h-3 w-3 text-green-500' />
      ) : (
        <Copy className='h-3 w-3 text-muted-foreground' />
      )}
    </button>
  )

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatCellValue = (cell: any) => {
    if (cell === null) return null
    if (typeof cell === 'boolean') return cell
    if (typeof cell === 'object') {
      try {
        return JSON.stringify(cell, null, 0)
      } catch {
        return String(cell)
      }
    }
    return String(cell)
  }

  // ── No project selected ──────────────────────────────────────────────────
  if (!user || !activeProject || activeProject.id === 'system') {
    return (
      <ProtectedRoute>
        <Layout title='SQL Database'>
          <div className='flex items-center justify-center min-h-[400px]'>
            <div className='text-center'>
              <DatabaseZap className='w-16 h-16 text-muted-foreground mx-auto mb-4' />
              <h2 className='text-xl font-semibold text-foreground mb-2'>Please Select a Project</h2>
              <p className='text-muted-foreground'>
                SQL Database is not available for the system project. Please select a regular project to manage its
                database.
              </p>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title='SQL Database'>
          <div className='flex items-center justify-center min-h-[400px]'>
            <div className='flex items-center gap-2 text-muted-foreground'>
              <Loader className='w-5 h-5 text-primary animate-spin' />
              <p className='animate-pulse'>Loading database...</p>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  // ── Uninitialized ────────────────────────────────────────────────────────
  if (!dbStatus.initialized) {
    return (
      <ProtectedRoute>
        <Layout title='SQL Database'>
          <div className='space-y-6'>
            <PageHeader
              title='SQL Database'
              subtitle={`Managed PostgreSQL database for ${activeProject.name}`}
              icon={<DatabaseZap className='w-8 h-8 text-primary' />}
            />
            <Card>
              <CardContent className='py-12 text-center'>
                <DatabaseZap className='w-16 h-16 mx-auto text-muted-foreground mb-4' />
                <h2 className='text-xl font-semibold text-foreground mb-2'>No Database Provisioned</h2>
                <p className='text-muted-foreground mb-2'>
                  Initialize a dedicated PostgreSQL database for this project to get started.
                </p>
                <p className='text-sm text-muted-foreground mb-6'>
                  You&apos;ll get two users: <span className='font-mono text-foreground'>admin_*</span> (full DDL + DML)
                  and <span className='font-mono text-foreground'>app_*</span> (SELECT, INSERT, UPDATE, DELETE only),
                  with a 1 GB storage quota.
                </p>
                <Button onClick={handleInitialize} disabled={initializing}>
                  {initializing ? (
                    <>
                      <Loader className='mr-2 h-4 w-4 animate-spin' />
                      Initializing...
                    </>
                  ) : (
                    <>
                      <DatabaseZap className='mr-2 h-4 w-4' />
                      Initialize Database
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  // ── Initialized — tabs UI ────────────────────────────────────────────────
  const pct = dbStatus.storage?.percentage || 0
  const storageColor = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-primary'
  const storageTextColor = pct > 90 ? 'text-red-500' : pct > 75 ? 'text-yellow-500' : 'text-muted-foreground'

  return (
    <ProtectedRoute>
      <Layout title='SQL Database'>
        <div className='space-y-4'>
          {/* Header + compact storage */}
          <PageHeader
            title='SQL Database'
            subtitle={`${activeProject.name} · ${dbStatus.db_name}`}
            icon={<DatabaseZap className='w-8 h-8 text-primary' />}
          >
            <div className='text-right'>
              <p className={`text-xs font-medium tabular-nums ${storageTextColor}`}>
                {formatBytes(dbStatus.storage?.bytes || 0)} / {formatBytes(dbStatus.storage?.limit || 0)}
              </p>
              <div className='w-28 h-1.5 bg-muted rounded-full mt-1 overflow-hidden'>
                <div
                  className={`h-full rounded-full transition-all ${storageColor}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className='text-xs text-muted-foreground mt-0.5'>{pct.toFixed(1)}% used</p>
            </div>
          </PageHeader>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value='console'>
                <Terminal className='w-4 h-4 mr-1.5' />
                Console
              </TabsTrigger>
              <TabsTrigger value='info'>
                <Info className='w-4 h-4 mr-1.5' />
                Connection
              </TabsTrigger>
              <TabsTrigger value='settings'>
                <Settings className='w-4 h-4 mr-1.5' />
                Settings
              </TabsTrigger>
            </TabsList>

            {/* ── Console Tab ──────────────────────────────────────────── */}
            <TabsContent value='console' className='mt-4 space-y-3'>
              {/* Editor block */}
              <div className='rounded-lg border overflow-hidden shadow-sm'>
                {/* Editor titlebar */}
                <div className='flex items-center justify-between px-3 h-9 bg-muted/40 border-b'>
                  <span className='text-xs font-medium text-muted-foreground uppercase tracking-wide select-none'>
                    SQL Editor
                  </span>
                  <div className='flex items-center gap-0.5'>
                    <Button
                      variant='ghost'
                      size='sm'
                      className={`h-6 px-2 text-xs gap-1.5 ${showSessionPanel || sessionContext.trim() ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setShowSessionPanel(p => !p)}
                      title='Session SQL — SET commands that persist across queries'
                    >
                      <SlidersHorizontal className='h-3 w-3' />
                      Session
                      {sessionContext.trim() && <span className='w-1.5 h-1.5 rounded-full bg-amber-500' />}
                    </Button>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-6 px-2 text-xs text-muted-foreground hover:text-foreground'
                      onClick={() => {
                        setSql('')
                        setQueryResult(null)
                        setQueryError(null)
                      }}
                    >
                      <X className='h-3 w-3 mr-1' />
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Session context panel */}
                {showSessionPanel && (
                  <div className='border-b px-4 py-3'>
                    <p className='text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5'>
                      Session SQL
                      <span className='font-normal text-amber-600/80 dark:text-amber-500/80 ml-1.5'>
                        — runs before every query on the same connection, so <code className='font-mono'>SET</code>{' '}
                        commands persist
                      </span>
                    </p>
                    <textarea
                      value={sessionContext}
                      onChange={e => setSessionContext(e.target.value)}
                      placeholder='SET search_path TO myschema;'
                      className='w-full font-mono text-xs bg-transparent border-0 p-0 resize-none focus:outline-none text-foreground placeholder:text-muted-foreground/60 leading-relaxed'
                      rows={2}
                      spellCheck={false}
                    />
                  </div>
                )}

                {/* Main textarea */}
                <textarea
                  ref={textareaRef}
                  value={sql}
                  onChange={e => setSql(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={'-- Write your SQL here\n-- Ctrl+Enter  /  Cmd+Enter to run'}
                  className='w-full min-h-[200px] px-4 py-3.5 font-mono text-sm bg-card border-0 resize-y focus:outline-none leading-relaxed placeholder:text-muted-foreground/50'
                  spellCheck={false}
                  autoComplete='off'
                  autoCorrect='off'
                />

                {/* Run toolbar */}
                <div className='flex items-center justify-between px-3 h-10 border-t bg-muted/20'>
                  <div className='flex items-center gap-2.5'>
                    <Button
                      size='sm'
                      className='h-7 px-3 gap-1.5'
                      onClick={handleExecuteQuery}
                      disabled={executing || !sql.trim()}
                    >
                      {executing ? <Loader className='h-3.5 w-3.5 animate-spin' /> : <Play className='h-3.5 w-3.5' />}
                      {executing ? 'Running…' : 'Run'}
                    </Button>
                    <span className='hidden sm:flex items-center gap-1 text-xs text-muted-foreground select-none'>
                      <kbd className='px-1.5 py-0.5 bg-muted border rounded text-[10px] font-sans'>Ctrl</kbd>
                      <span>+</span>
                      <kbd className='px-1.5 py-0.5 bg-muted border rounded text-[10px] font-sans'>↵</kbd>
                    </span>
                  </div>
                  <span className='text-xs text-muted-foreground font-mono truncate max-w-[180px]'>
                    {dbStatus.db_name}
                  </span>
                </div>
              </div>

              {/* Error */}
              {queryError && (
                <div className='flex items-start gap-3 p-4 bg-destructive/8 border border-destructive/25 rounded-lg'>
                  <AlertCircle className='h-4 w-4 text-destructive mt-0.5 shrink-0' />
                  <div className='min-w-0'>
                    <p className='text-xs font-semibold text-destructive mb-1'>Error</p>
                    <pre className='text-xs text-destructive/90 whitespace-pre-wrap font-mono break-words'>
                      {queryError}
                    </pre>
                  </div>
                </div>
              )}

              {/* Storage warning */}
              {queryResult?.storage_warning && (
                <div className='flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/25 rounded-lg'>
                  <AlertCircle className='h-4 w-4 text-yellow-600 mt-0.5 shrink-0' />
                  <p className='text-sm text-yellow-700 dark:text-yellow-400'>{queryResult.storage_warning}</p>
                </div>
              )}

              {/* Results */}
              {queryResult && !queryError && (
                <div className='rounded-lg border overflow-hidden shadow-sm'>
                  <div className='flex items-center gap-3 px-3 h-9 bg-muted/40 border-b text-xs text-muted-foreground'>
                    <span className='font-mono font-semibold text-foreground'>{queryResult.command}</span>
                    <span className='text-muted-foreground/50'>·</span>
                    <span>
                      <span className='font-medium text-foreground'>{queryResult.rowCount}</span> row
                      {queryResult.rowCount !== 1 ? 's' : ''}
                    </span>
                    <span className='text-muted-foreground/50'>·</span>
                    <span>{queryResult.duration_ms}ms</span>
                    {queryResult.truncated && (
                      <>
                        <span className='text-muted-foreground/50'>·</span>
                        <span className='text-yellow-600 dark:text-yellow-400 font-medium'>
                          truncated to 1 000 rows
                        </span>
                      </>
                    )}
                  </div>

                  {queryResult.columns.length > 0 && queryResult.rows.length > 0 ? (
                    <div className='overflow-auto max-h-[420px]'>
                      <Table>
                        <TableHeader>
                          <TableRow className='bg-muted/30 hover:bg-muted/30'>
                            <TableHead className='w-10 font-mono text-[11px] text-muted-foreground text-right pr-3 pl-3 sticky top-0 bg-muted/30 select-none'>
                              #
                            </TableHead>
                            {queryResult.columns.map((col, i) => (
                              <TableHead
                                key={i}
                                className='font-mono text-[11px] whitespace-nowrap sticky top-0 bg-muted/30 py-2'
                              >
                                {col}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {queryResult.rows.map((row, i) => (
                            <TableRow key={i} className='hover:bg-muted/25'>
                              <TableCell className='font-mono text-[11px] text-muted-foreground/50 text-right pr-3 pl-3 select-none'>
                                {i + 1}
                              </TableCell>
                              {row.map((cell, j) => {
                                const formatted = formatCellValue(cell)
                                return (
                                  <TableCell key={j} className='font-mono text-xs max-w-[320px] truncate py-1.5'>
                                    {cell === null ? (
                                      <span className='text-muted-foreground/40 italic whitespace-nowrap'>NULL</span>
                                    ) : typeof cell === 'boolean' ? (
                                      <span className={cell ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                                        {String(cell)}
                                      </span>
                                    ) : (
                                      <span title={typeof cell === 'object' ? String(formatted) : ''}>{formatted}</span>
                                    )}
                                  </TableCell>
                                )
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className='px-4 py-8 text-center text-sm text-muted-foreground'>
                      Query executed successfully — no rows returned.
                    </div>
                  )}
                </div>
              )}

              {/* History */}
              {queryHistory.length > 0 && (
                <div className='rounded-lg border overflow-hidden shadow-sm'>
                  <div className='flex items-center justify-between px-3 h-9 bg-muted/40 border-b'>
                    <span className='text-xs font-medium text-muted-foreground uppercase tracking-wide select-none'>
                      History
                    </span>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-5 px-1.5 text-xs text-muted-foreground'
                      onClick={() => setQueryHistory([])}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className='divide-y max-h-[180px] overflow-auto'>
                    {queryHistory.map((item, i) => (
                      <div
                        key={i}
                        className='flex items-center gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer'
                        onClick={() => setSql(item.sql)}
                      >
                        <Clock className='h-3 w-3 text-muted-foreground/60 shrink-0' />
                        <code className='text-xs font-mono truncate flex-1 text-foreground'>{item.sql}</code>
                        <span
                          className={`text-xs shrink-0 tabular-nums ${item.success ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
                        >
                          {item.success ? `${item.duration_ms}ms` : 'error'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── Connection Tab ─────────────────────────────────────────── */}
            <TabsContent value='info' className='mt-4 space-y-4'>
              <Card>
                <CardContent className='pt-6 space-y-5'>
                  <div className='space-y-1.5'>
                    <Label className='text-xs text-muted-foreground'>Database Name</Label>
                    <div className='flex items-center gap-1.5'>
                      <code className='font-mono bg-muted px-2 py-1.5 rounded text-sm flex-1 truncate'>
                        {dbStatus.db_name}
                      </code>
                      <CopyButton text={dbStatus.db_name!} field='db_name' />
                    </div>
                  </div>

                  <div className='pt-4 border-t space-y-3'>
                    <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide'>
                      Connect with CLI
                    </p>
                    <div className='space-y-2'>
                      <p className='text-xs text-muted-foreground'>Set up a secure tunnel to your database:</p>
                      <div className='flex items-center gap-2'>
                        <code className='flex-1 font-mono bg-muted px-3 py-2 rounded text-xs break-words'>
                          invoke sql:connect --project "{activeProject.name}"
                        </code>
                        <CopyButton text={`invoke sql:connect --project "${activeProject.name}"`} field='cli_tunnel' />
                      </div>
                    </div>
                    <div className='space-y-2'>
                      <p className='text-xs text-muted-foreground'>Then connect with psql or any client:</p>
                      <div className='flex items-center gap-2'>
                        <code className='flex-1 font-mono bg-muted px-3 py-2 rounded text-xs'>
                          psql -h localhost -p 5433
                        </code>
                        <CopyButton text='psql -h localhost -p 5433' field='cli_psql' />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Settings Tab ─────────────────────────────────────────── */}
            <TabsContent value='settings' className='mt-4'>
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Danger Zone</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='flex items-start justify-between gap-6 p-4 border border-destructive/30 rounded-lg bg-destructive/5'>
                    <div>
                      <p className='text-sm font-semibold'>Destroy Database</p>
                      <p className='text-xs text-muted-foreground mt-1'>
                        Permanently delete this database, all data, and both users. This cannot be undone.
                      </p>
                    </div>
                    <Button
                      variant='destructive'
                      size='sm'
                      className='shrink-0'
                      onClick={() => setShowDestroyModal(true)}
                    >
                      <Trash2 className='mr-1.5 h-3.5 w-3.5' />
                      Destroy
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Destroy Modal */}
        <Modal
          isOpen={showDestroyModal}
          title='Destroy Database'
          description='This action is irreversible. All data in this database will be permanently deleted.'
          onCancel={() => {
            setShowDestroyModal(false)
            setDestroyConfirm('')
          }}
          onConfirm={handleDestroy}
          confirmText='Destroy Database'
          confirmVariant='danger'
          loading={destroying}
          confirmDisabled={destroyConfirm !== activeProject?.name}
        >
          <div className='space-y-3 pt-2'>
            <p className='text-sm text-muted-foreground'>
              Type <strong>{activeProject?.name}</strong> to confirm:
            </p>
            <Input
              value={destroyConfirm}
              onChange={e => setDestroyConfirm(e.target.value)}
              placeholder='Project name'
            />
          </div>
        </Modal>
      </Layout>
    </ProtectedRoute>
  )
}
