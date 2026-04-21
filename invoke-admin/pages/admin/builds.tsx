import { useEffect, useState, useCallback } from 'react'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Hammer, Loader, AlertCircle, RefreshCw, FileText } from 'lucide-react'
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
  build_log: string | null
  error_message: string | null
  created_by_name: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

function statusBadge(status: string) {
  switch (status) {
    case 'queued':   return <Badge variant="secondary">Queued</Badge>
    case 'running':  return <Badge className="bg-blue-500 text-white">Running</Badge>
    case 'success':  return <Badge className="bg-green-600 text-white">Success</Badge>
    case 'failed':   return <Badge variant="destructive">Failed</Badge>
    default:         return <Badge variant="outline">{status}</Badge>
  }
}

export default function Builds() {
  const { activeProject } = useProject()
  const [builds, setBuilds] = useState<Build[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logModal, setLogModal] = useState<{ open: boolean; build: Build | null }>({ open: false, build: null })

  const limit = 20

  const fetchBuilds = useCallback(async (p = page) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) })
      if (activeProject?.id && activeProject.id !== 'system') {
        params.set('project_id', activeProject.id)
      }
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
  }, [activeProject, page])

  useEffect(() => {
    setPage(1)
    fetchBuilds(1)
  }, [activeProject])

  useEffect(() => {
    fetchBuilds(page)
  }, [page])

  // Auto-refresh every 3 seconds if any build is queued or running
  useEffect(() => {
    const hasActive = builds.some(b => b.status === 'queued' || b.status === 'running')
    if (!hasActive) return
    const timer = setInterval(() => fetchBuilds(page), 3000)
    return () => clearInterval(timer)
  }, [builds, page, fetchBuilds])

  const totalPages = Math.ceil(total / limit)

  function formatDate(dt: string | null) {
    if (!dt) return '—'
    return new Date(dt).toLocaleString()
  }

  return (
    <ProtectedRoute>
      <Layout title="Builds">
        <div className="flex flex-col gap-6">
          <PageHeader
            title="Builds"
            description="Build queue and history for function versions"
            icon={<Hammer className="h-6 w-6" />}
            actions={
              <Button variant="outline" size="sm" onClick={() => fetchBuilds(page)} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            }
          />

          {error && (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              {loading && builds.length === 0 ? (
                <div className="flex items-center justify-center p-12 text-muted-foreground">
                  <Loader className="h-6 w-6 animate-spin mr-2" />
                  Loading builds…
                </div>
              ) : builds.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2">
                  <Hammer className="h-8 w-8 opacity-40" />
                  <p>No builds found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Function</th>
                        <th className="text-left p-3 font-medium">Version</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium">Action</th>
                        <th className="text-left p-3 font-medium">Created</th>
                        <th className="text-left p-3 font-medium">Completed</th>
                        <th className="text-left p-3 font-medium">By</th>
                        <th className="text-left p-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {builds.map(build => (
                        <tr key={build.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-medium">{build.function_name}</td>
                          <td className="p-3 text-muted-foreground">v{build.version_number}</td>
                          <td className="p-3">{statusBadge(build.status)}</td>
                          <td className="p-3 text-muted-foreground capitalize">{build.after_build_action}</td>
                          <td className="p-3 text-muted-foreground text-xs">{formatDate(build.created_at)}</td>
                          <td className="p-3 text-muted-foreground text-xs">{formatDate(build.completed_at)}</td>
                          <td className="p-3 text-muted-foreground">{build.created_by_name ?? '—'}</td>
                          <td className="p-3">
                            {(build.build_log || build.error_message) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLogModal({ open: true, build })}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Log
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        <Modal
          open={logModal.open}
          onClose={() => setLogModal({ open: false, build: null })}
          title={logModal.build ? `Build Log — ${logModal.build.function_name} v${logModal.build.version_number}` : 'Build Log'}
          maxWidth="max-w-3xl"
        >
          {logModal.build && (
            <div className="space-y-4">
              {logModal.build.error_message && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {logModal.build.error_message}
                </div>
              )}
              <pre className="bg-muted rounded-md p-4 text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                {logModal.build.build_log || '(no log output)'}
              </pre>
            </div>
          )}
        </Modal>
      </Layout>
    </ProtectedRoute>
  )
}
