import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import {
  Hammer,
  Clock,
  Calendar,
  User,
  Loader,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Zap,
  Terminal,
  RefreshCw,
  ArrowLeft,
  Package,
  Ban,
  Circle,
  Download,
} from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import type { BuildDetailResponse, BuildContextData } from '@/pages/api/builds/[id]'

function statusBadge(status: string) {
  switch (status) {
    case 'queued':   return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="w-3 h-3" />Queued</Badge>
    case 'running':  return <Badge className="bg-blue-500/20 text-blue-400 border-blue-800/50 flex items-center gap-1"><Loader className="w-3 h-3 animate-spin" />Running</Badge>
    case 'success':  return <Badge className="bg-green-900/30 text-green-400 border-green-800/50 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Success</Badge>
    case 'failed':   return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="w-3 h-3" />Failed</Badge>
    case 'cancelled': return <Badge variant="secondary" className="flex items-center gap-1"><Ban className="w-3 h-3" />Cancelled</Badge>
    default:         return <Badge variant="outline">{status}</Badge>
  }
}

// ---------------------------------------------------------------------------
// Pipeline Graph — renders stages as a dynamic DAG visualization
// ---------------------------------------------------------------------------

const stageStatusStyles: Record<string, { bg: string; border: string; text: string; icon: typeof Circle }> = {
  pending: { bg: 'bg-muted/50', border: 'border-muted-foreground/30', text: 'text-muted-foreground', icon: Circle },
  cancelled: { bg: 'bg-muted/50', border: 'border-muted-foreground/30', text: 'text-muted-foreground', icon: XCircle },
  running: { bg: 'bg-blue-500/10', border: 'border-blue-500', text: 'text-blue-400', icon: Loader },
  success: { bg: 'bg-green-500/10', border: 'border-green-600', text: 'text-green-400', icon: CheckCircle2 },
  failure: { bg: 'bg-red-500/10', border: 'border-red-600', text: 'text-red-400', icon: XCircle },
}

/** Compute topological layers — stages in the same layer have all deps in earlier layers */
function computeLayers(ctx: BuildContextData): string[][] {
  const stageMap = new Map(ctx.pipeline.stages.map((s) => [s.name, s]))
  const inDegree = new Map(ctx.pipeline.stages.map((s) => [s.name, 0]))
  const dependents = new Map<string, string[]>(ctx.pipeline.stages.map((s) => [s.name, []]))

  for (const stage of ctx.pipeline.stages) {
    for (const dep of stage.dependsOn) {
      inDegree.set(stage.name, (inDegree.get(stage.name) ?? 0) + 1)
      dependents.get(dep)?.push(stage.name)
    }
  }

  const layers: string[][] = []
  let ready = ctx.pipeline.stages.filter((s) => inDegree.get(s.name) === 0).map((s) => s.name)

  while (ready.length > 0) {
    layers.push(ready)
    const next: string[] = []
    for (const name of ready) {
      for (const dep of dependents.get(name) ?? []) {
        const remaining = (inDegree.get(dep) ?? 1) - 1
        inDegree.set(dep, remaining)
        if (remaining === 0) next.push(dep)
      }
    }
    ready = next
  }
  return layers
}

function formatStageName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function PipelineGraph({ ctx }: { ctx: BuildContextData }) {
  const layers = computeLayers(ctx)
  // Build a lookup: stage → { layerIdx, rowIdx } for arrow drawing
  const stagePosition = new Map<string, { layer: number; row: number }>()
  layers.forEach((layer, li) => layer.forEach((name, ri) => stagePosition.set(name, { layer: li, row: ri })))

  // Build dependency map for quick lookup
  const depsMap = new Map(ctx.pipeline.stages.map((s) => [s.name, s.dependsOn]))

  return (
    <div className="flex items-start gap-2 overflow-x-auto py-2">
      {layers.map((layer, li) => (
        <div key={li} className="flex flex-col gap-2 items-center">
          {layer.map((stageName) => {
            const stageStatus = ctx.stages[stageName]?.status ?? 'pending'
            const stageError = ctx.stages[stageName]?.error
            const style = stageStatusStyles[stageStatus] ?? stageStatusStyles.pending
            const Icon = style.icon

            return (
              <div
                key={stageName}
                className={cn(
                  'relative flex items-center gap-2 rounded-lg border-2 px-4 py-3 min-w-[180px] transition-all',
                  style.bg,
                  style.border,
                )}
                title={stageError ? `Error: ${stageError}` : undefined}
              >
                <Icon className={cn('w-4 h-4 flex-shrink-0', style.text, stageStatus === 'running' && 'animate-spin')} />
                <div className="min-w-0">
                  <p className={cn('text-sm font-medium truncate', style.text)} title={stageName}>
                    {formatStageName(stageName)}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{stageStatus}</p>
                </div>
              </div>
            )
          })}
          {/* Arrow to next layer */}
          {li < layers.length - 1 && (
            <div className="absolute" />
          )}
        </div>
      ))}
      {/* SVG arrows overlay — rendered separately for clean layering */}
    </div>
  )
}

/** Full pipeline card with SVG arrows */
function PipelineGraphCard({ ctx, buildStatus }: { ctx: BuildContextData; buildStatus: string }) {
  const isTerminalFailure = buildStatus === 'failed' || buildStatus === 'cancelled'
  const resolveStageStatus = (name: string) => {
    const s = ctx.stages[name]?.status ?? 'pending'
    if (isTerminalFailure && (s === 'running' || s === 'pending')) return 'cancelled'
    return s
  }
  const layers = computeLayers(ctx)
  const stagePosition = new Map<string, { layer: number; row: number }>()
  layers.forEach((layer, li) => layer.forEach((name, ri) => stagePosition.set(name, { layer: li, row: ri })))

  const NODE_W = 196 // min-w-[180px] + px-4*2 + border ≈ 196
  const NODE_H = 56  // py-3*2 + content ≈ 56
  const GAP_X = 48   // horizontal gap between layers
  const GAP_Y = 12   // vertical gap between rows
  const LAYER_OFFSET = NODE_W + GAP_X

  const maxRows = Math.max(...layers.map((l) => l.length))
  const svgW = layers.length * LAYER_OFFSET - GAP_X
  const svgH = maxRows * (NODE_H + GAP_Y) - GAP_Y

  const getNodeCenter = (layer: number, row: number, totalInLayer: number) => {
    const totalHeight = totalInLayer * NODE_H + (totalInLayer - 1) * GAP_Y
    const offsetY = (svgH - totalHeight) / 2
    return {
      x: layer * LAYER_OFFSET,
      cx: layer * LAYER_OFFSET + NODE_W / 2,
      cy: offsetY + row * (NODE_H + GAP_Y) + NODE_H / 2,
      right: layer * LAYER_OFFSET + NODE_W,
      left: layer * LAYER_OFFSET,
      top: offsetY + row * (NODE_H + GAP_Y),
    }
  }

  // Collect edges
  const edges: { from: string; to: string }[] = []
  for (const stage of ctx.pipeline.stages) {
    for (const dep of stage.dependsOn) {
      edges.push({ from: dep, to: stage.name })
    }
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
          <Zap className="w-5 h-5" />
          Pipeline
          <Badge variant="secondary" className="ml-1 capitalize">{ctx.pipeline.name}</Badge>
          <span className="text-muted-foreground font-normal text-sm">
            {ctx.pipeline.stages.length} stages
          </span>
        </h2>
        <div className="overflow-x-auto">
          <div className="relative" style={{ width: svgW, height: svgH, minWidth: svgW }}>
            {/* SVG arrow layer */}
            <svg className="absolute inset-0 pointer-events-none" width={svgW} height={svgH}>
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L8,3 L0,6" fill="currentColor" className="text-muted-foreground/40" />
                </marker>
              </defs>
              {edges.map(({ from, to }) => {
                const fromPos = stagePosition.get(from)
                const toPos = stagePosition.get(to)
                if (!fromPos || !toPos) return null
                const fromNode = getNodeCenter(fromPos.layer, fromPos.row, layers[fromPos.layer].length)
                const toNode = getNodeCenter(toPos.layer, toPos.row, layers[toPos.layer].length)
                const x1 = fromNode.right
                const y1 = fromNode.cy
                const x2 = toNode.left
                const y2 = toNode.cy
                const cpx = (x1 + x2) / 2
                return (
                  <path
                    key={`${from}-${to}`}
                    d={`M${x1},${y1} C${cpx},${y1} ${cpx},${y2} ${x2},${y2}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-muted-foreground/40"
                    markerEnd="url(#arrow)"
                  />
                )
              })}
            </svg>
            {/* Node layer */}
            {layers.map((layer, li) =>
              layer.map((stageName, ri) => {
                const stageStatus = resolveStageStatus(stageName)
                const stageError = ctx.stages[stageName]?.error
                const style = stageStatusStyles[stageStatus] ?? stageStatusStyles.pending
                const Icon = style.icon
                const pos = getNodeCenter(li, ri, layer.length)

                return (
                  <div
                    key={stageName}
                    className={cn(
                      'absolute flex items-center gap-2 rounded-lg border-2 px-4 py-3 transition-all',
                      style.bg,
                      style.border,
                    )}
                    style={{
                      left: pos.x,
                      top: pos.top,
                      width: NODE_W,
                      height: NODE_H,
                    }}
                    title={stageError ? `Error: ${stageError}` : undefined}
                  >
                    <Icon className={cn('w-4 h-4 flex-shrink-0', style.text, stageStatus === 'running' && 'animate-spin')} />
                    <div className="min-w-0">
                      <p className={cn('text-sm font-medium truncate', style.text)} title={stageName}>
                        {formatStageName(stageName)}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">{stageStatus}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function BuildDetail() {
  const router = useRouter()
  const { id } = router.query as { id: string }
  const { activeProject } = useProject()

  const [data, setData] = useState<BuildDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rebuilding, setRebuilding] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const fetchBuild = useCallback(async () => {
    if (!id) return
    setError('')
    try {
      const res = await authenticatedFetch(`/api/builds/${id}`)
      const json = await res.json()
      if (json.success) {
        setData(json.data)
        setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100) // scroll to bottom on data load
      } else {
        setError(json.message || 'Failed to load build')
      }
    } catch {
      setError('Failed to load build details')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchBuild()
  }, [fetchBuild])

  // Auto-refresh every 3s for queued/running builds
  useEffect(() => {
    if (!data || (data.status !== 'queued' && data.status !== 'running')) return
    const timer = setInterval(fetchBuild, 3000)
    return () => clearInterval(timer)
  }, [data, fetchBuild])

  const handleRebuild = async () => {
    if (!data) return
    setRebuilding(true)
    try {
      const res = await authenticatedFetch(`/api/functions/${data.function_id}/builds`, {
        method: 'POST',
        body: JSON.stringify({ versionId: data.version_id }),
      })
      const json = await res.json()
      if (json.success && json.data?.id) {
        router.push(`/admin/builds/${json.data.id}`)
      }
    } catch {
      // ignore
    } finally {
      setRebuilding(false)
    }
  }

  const handleDownloadArtifact = async () => {
    if (!data?.artifact_path) return
    setDownloading(true)
    try {
      const res = await authenticatedFetch(`/api/builds/${id}/artifact`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.error('Artifact download failed:', json.message)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('content-disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/) 
      a.download = match?.[1] ?? `artifact-${id}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    } finally {
      setDownloading(false)
    }
  }

  const handleCancel = async () => {
    if (!data) return
    setCancelling(true)
    try {
      const res = await authenticatedFetch(`/api/builds/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'cancel' }),
      })
      const json = await res.json()
      if (json.success) {
        fetchBuild()
      }
    } catch {
      // ignore
    } finally {
      setCancelling(false)
    }
  }

  const formatDate = (ds: string | null) => {
    if (!ds) return '—'
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(ds))
  }

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return '—'
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (ms < 1000) return `${ms}ms`
    const secs = Math.round(ms / 1000)
    if (secs < 60) return `${secs}s`
    return `${Math.floor(secs / 60)}m ${secs % 60}s`
  }

  const formatTimestamp = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString()
    } catch {
      return ts
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Build Details">
          <div className="flex items-center justify-center h-64">
            <Loader className="w-8 h-8 text-primary animate-spin" />
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  if (error || !data) {
    return (
      <ProtectedRoute>
        <Layout title="Build Details">
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-destructive">{error || 'Build not found'}</p>
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/builds')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Builds
            </Button>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  const isActive = data.status === 'queued' || data.status === 'running'
  const canRebuild = data.status === 'success' || data.status === 'failed' || data.status === 'cancelled'

  return (
    <ProtectedRoute>
      <Layout title="Build Details">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <PageHeader
              title="Build Details"
              subtitle={
                data.function_name
                  ? `${data.function_name} v${data.version_number}`
                  : id
              }
              icon={<Hammer className="w-8 h-8 text-primary" />}
            />
            <div className="flex items-center gap-2">
              {statusBadge(data.status)}
            </div>
          </div>

          {/* Action cards */}
         <Card>
            <CardContent className="overflow-x-auto">
              <div className="mt-6">
                <div className="flex gap-2 whitespace-nowrap [&>*]:shrink-0">
                  {isActive && (
                    <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelling}>
                      {cancelling ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <Ban className="w-4 h-4 mr-2" />}
                      Cancel
                    </Button>
                  )}
                  {canRebuild && (
                    <Button size="sm" onClick={handleRebuild} disabled={rebuilding}>
                      {rebuilding ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Rebuild
                    </Button>
                  )}
                  {data.artifact_path && (
                    <Button variant="outline" size="sm" onClick={handleDownloadArtifact} disabled={downloading}>
                      {downloading ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      Download Artifacts
                    </Button>
                  )}
                  {isActive && (
                    <Button variant="outline" size="sm" onClick={fetchBuild}>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Refreshing…
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Overview cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                label: 'Duration',
                value: data.status === 'running' ? 'In progress…' : formatDuration(data.started_at, data.completed_at),
                icon: Clock,
              },
              {
                label: 'Function',
                value: `${data.function_name} v${data.version_number}`,
                icon: Package,
                link: data.function_id ? `/admin/functions/${data.function_id}` : undefined,
              },
              {
                label: 'Created By',
                value: data.created_by_name ?? '—',
                icon: User,
              },
              {
                label: 'Created At',
                value: formatDate(data.created_at),
                icon: Calendar,
              },
            ].map(({ label, value, icon: Icon, link }) => (
              <Card key={label}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-muted-foreground text-sm">{label}</p>
                      {link ? (
                        <Link href={link} className="text-xl font-bold text-primary hover:underline mt-0.5 block truncate">
                          {value}
                        </Link>
                      ) : (
                        <p className="text-xl font-bold text-foreground mt-0.5 truncate">{value}</p>
                      )}
                    </div>
                    <Icon className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Timestamps detail */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-bold flex items-center gap-2 text-foreground mb-4">
                <Calendar className="w-5 h-5" />
                Timeline
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</dt>
                  <dd className="text-foreground mt-0.5">{formatDate(data.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Started</dt>
                  <dd className="text-foreground mt-0.5">{formatDate(data.started_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completed</dt>
                  <dd className="text-foreground mt-0.5">{formatDate(data.completed_at)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Pipeline Graph */}
          {data.build_context && (
            <PipelineGraphCard ctx={data.build_context} buildStatus={data.status} />
          )}

          {/* After build action */}
          {data.after_build_action === 'switch' && (
            <Card className="border-blue-800/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-blue-400 text-sm">
                  <Zap className="w-5 h-5" />
                  <span className="font-medium">This build will automatically switch the active version on success.</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error Banner */}
          {data.error_message && (
            <Card className="border-destructive/50">
              <CardContent className="pt-6">
                <h2 className="text-base font-bold flex items-center gap-2 text-destructive mb-3">
                  <AlertTriangle className="w-5 h-5" />
                  Build Error
                </h2>
                <pre className="bg-destructive/10 text-destructive rounded p-3 text-sm font-mono whitespace-pre-wrap break-all">
                  {data.error_message}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Build Log Output */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
                <Terminal className="w-5 h-5" />
                Build Output
              </h2>
              {data.logs.length > 0 ? (
                <div className="bg-black rounded-lg p-4 font-mono text-sm space-y-1">
                  {data.logs.map((entry, i) => (
                    <div key={i} className="flex gap-3 text-muted-foreground">
                      <span className="text-muted-foreground/60 whitespace-nowrap select-none">
                        [{formatTimestamp(entry.timestamp)}]
                      </span>
                      <span className="flex-1 break-words whitespace-pre-wrap break-all text-gray-200">
                        {entry.message}
                      </span>
                    </div>
                  ))}
                </div>
              ) : isActive ? (
                <div className="bg-black rounded-lg p-8 text-center text-muted-foreground">
                  <Loader className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm">Waiting for build output…</p>
                </div>
              ) : (
                <div className="bg-black rounded-lg p-8 text-center text-muted-foreground">
                  <Terminal className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No build output available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
