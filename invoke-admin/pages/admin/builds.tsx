import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Hammer,
  Loader,
  AlertCircle,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Zap,
  Ban
} from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { useProject } from '@/contexts/ProjectContext'

interface Build {
  id: string
  function_id: string
  function_name: string
  version_id: string
  version_number: number
  status: 'queued' | 'running' | 'success' | 'failed'
  after_build_action: 'none' | 'switch'
  artifact_path: string | null
  error_message: string | null
  created_by_name: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

const statusConfig: Record<string, { icon: typeof Hammer; bg: string; text: string; label: string }> = {
  queued: { icon: Clock, bg: 'bg-muted', text: 'text-muted-foreground', label: 'Queued' },
  running: { icon: Loader, bg: 'bg-blue-900/30', text: 'text-blue-400', label: 'Running' },
  success: { icon: CheckCircle2, bg: 'bg-green-900/30', text: 'text-green-400', label: 'Success' },
  failed: { icon: XCircle, bg: 'bg-red-900/30', text: 'text-red-400', label: 'Failed' },
  cancelled: { icon: Ban, bg: 'bg-muted', text: 'text-muted-foreground', label: 'Cancelled' }
}

function statusBadge(status: string) {
  const cfg = statusConfig[status]
  if (!cfg) return <Badge variant='outline'>{status}</Badge>
  switch (status) {
    case 'queued':
      return <Badge variant='secondary'>{cfg.label}</Badge>
    case 'running':
      return <Badge className='bg-blue-500/20 text-blue-400 border-blue-800/50'>{cfg.label}</Badge>
    case 'success':
      return <Badge className='bg-green-900/30 text-green-400 border-green-800/50'>{cfg.label}</Badge>
    case 'failed':
      return <Badge variant='destructive'>{cfg.label}</Badge>
    case 'cancelled':
      return <Badge variant='secondary'>{cfg.label}</Badge>
    default:
      return <Badge variant='outline'>{status}</Badge>
  }
}

function formatRelativeTime(dt: string | null) {
  if (!dt) return '—'
  const diff = Date.now() - new Date(dt).getTime()
  if (diff < 60_000) return 'Just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dt).toLocaleDateString()
}

function formatDuration(start: string | null, end: string | null) {
  if (!start || !end) return null
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

export default function Builds() {
  const router = useRouter()
  const { activeProject } = useProject()
  const [builds, setBuilds] = useState<Build[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const limit = 20

  const fetchBuilds = useCallback(
    async (p = page, s = search, st = statusFilter) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ page: String(p), limit: String(limit) })
        if (activeProject?.id && activeProject.id !== 'system') {
          params.set('project_id', activeProject.id)
        }
        if (s) params.set('search', s)
        if (st && st !== 'all') params.set('status', st)
        const res = await authenticatedFetch(`/api/builds?${params}`)
        const data = await res.json()
        if (data.success) {
          setBuilds(data.data.builds)
          setTotal(data.data.total)
        } else {
          setError(data.message || 'Failed to load builds')
        }
      } catch {
        setError('Failed to load builds')
      } finally {
        setLoading(false)
      }
    },
    [activeProject, page, search, statusFilter]
  )

  useEffect(() => {
    setPage(1)
    setSearch('')
    setStatusFilter('all')
    fetchBuilds(1, '', 'all')
  }, [activeProject])

  useEffect(() => {
    fetchBuilds(page, search, statusFilter)
  }, [page])

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      fetchBuilds(1, value, statusFilter)
    }, 300)
  }

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setPage(1)
    fetchBuilds(1, search, value)
  }

  // Auto-refresh every 3 seconds if any build is queued or running
  useEffect(() => {
    const hasActive = builds.some(b => b.status === 'queued' || b.status === 'running')
    if (!hasActive) return
    const timer = setInterval(() => fetchBuilds(page, search, statusFilter), 3000)
    return () => clearInterval(timer)
  }, [builds, page, search, statusFilter, fetchBuilds])

  const totalPages = Math.ceil(total / limit)

  const pageNumbers = () => {
    const pages: number[] = []
    const maxVisible = 5
    let start = Math.max(1, page - Math.floor(maxVisible / 2))
    const end = Math.min(totalPages, start + maxVisible - 1)
    start = Math.max(1, end - maxVisible + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  return (
    <ProtectedRoute>
      <Layout title='Builds'>
        <div className='space-y-6'>
          <PageHeader
            title='Builds'
            subtitle='Build queue and history for function versions'
            icon={<Hammer className='h-6 w-6' />}
          >
            <Button
              variant='outline'
              size='sm'
              onClick={() => fetchBuilds(page, search, statusFilter)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </PageHeader>

          {/* Search + Filters */}
          <div className='flex items-center gap-3'>
            <div className='relative flex-1 max-w-sm'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
              <Input
                placeholder='Search by function name…'
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                className='pl-9'
              />
            </div>
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className='w-[140px]'>
                <SelectValue placeholder='All statuses' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All statuses</SelectItem>
                <SelectItem value='queued'>Queued</SelectItem>
                <SelectItem value='running'>Running</SelectItem>
                <SelectItem value='success'>Success</SelectItem>
                <SelectItem value='failed'>Failed</SelectItem>
                <SelectItem value='cancelled'>Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className='flex items-center gap-2 text-destructive'>
              <AlertCircle className='h-4 w-4' />
              {error}
            </div>
          )}

          {/* Build list */}
          {loading && builds.length === 0 ? (
            <div className='flex items-center justify-center h-64'>
              <Loader className='w-8 h-8 text-primary animate-spin' />
            </div>
          ) : builds.length === 0 ? (
            <Card>
              <CardContent className='py-16 text-center text-muted-foreground'>
                <Hammer className='w-16 h-16 mx-auto mb-4 opacity-30' />
                <p className='text-lg font-medium'>No builds found</p>
                <p className='text-sm mt-1'>
                  {search || statusFilter !== 'all'
                    ? 'Try adjusting your search or filters'
                    : 'Builds will appear here when you deploy function versions'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className='grid gap-3'>
              {builds.map(build => {
                const cfg = statusConfig[build.status] || statusConfig.queued
                const Icon = cfg.icon
                const duration = formatDuration(build.started_at, build.completed_at)
                return (
                  <Card
                    key={build.id}
                    className='hover:bg-card/80 transition-colors cursor-pointer'
                    onClick={() => router.push(`/admin/builds/${build.id}`)}
                  >
                    <CardContent className='px-4 py-3'>
                      <div className='flex items-center gap-3'>
                        <div className={`p-2 rounded ${cfg.bg} ${cfg.text} shrink-0`}>
                          <Icon className={`w-4 h-4 ${build.status === 'running' ? 'animate-spin' : ''}`} />
                        </div>
                        <div className='flex-1 min-w-0'>
                          <div className='flex items-center flex-wrap gap-1.5'>
                            <span className='text-sm font-semibold text-foreground truncate'>
                              {build.function_name}
                            </span>
                            <span className='text-xs text-muted-foreground'>v{build.version_number}</span>
                            {statusBadge(build.status)}
                            {build.after_build_action === 'switch' && (
                              <Badge variant='outline' className='text-xs px-1.5 py-0 gap-0.5'>
                                <Zap className='w-3 h-3' />
                                Switch
                              </Badge>
                            )}
                          </div>
                          <div className='flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1'>
                            <span className='text-xs text-muted-foreground'>
                              {formatRelativeTime(build.created_at)}
                            </span>
                            {build.created_by_name && (
                              <span className='text-xs text-muted-foreground'>by {build.created_by_name}</span>
                            )}
                            {duration && <span className='text-xs text-muted-foreground'>{duration}</span>}
                          </div>
                        </div>
                        <ChevronRight className='w-4 h-4 text-muted-foreground shrink-0' />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className='flex items-center justify-between text-sm text-muted-foreground'>
              <span>
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </span>
              <div className='flex items-center gap-1'>
                <Button
                  variant='outline'
                  size='icon'
                  className='h-8 w-8'
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className='h-4 w-4' />
                </Button>
                {pageNumbers().map(p => (
                  <Button
                    key={p}
                    variant={p === page ? 'default' : 'outline'}
                    size='icon'
                    className='h-8 w-8'
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant='outline'
                  size='icon'
                  className='h-8 w-8'
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className='h-4 w-4' />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
