import { useState, useEffect, useCallback } from 'react'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import {
  Globe,
  Plus,
  Trash2,
  Edit2,
  GripVertical,
  Loader,
  Save,
  Settings,
  ChevronDown,
  ChevronRight,
  X,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  Zap,
  Copy,
  Check,
} from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { useProject } from '@/contexts/ProjectContext'
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/cn'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CorsSettings {
  enabled: boolean
  allowedOrigins: string[]
  allowedHeaders: string[]
  exposeHeaders: string[]
  maxAge: number
  allowCredentials: boolean
}

interface AuthMethod {
  id: string
  name: string
  type: 'basic_auth' | 'bearer_jwt' | 'api_key' | 'middleware'
  config: {
    credentials?: { username: string; password: string }[]
    realm?: string
    jwtMode?: 'fixed_secret' | 'microsoft' | 'google' | 'github' | 'jwks_endpoint' | 'oidc_discovery'
    jwtSecret?: string
    tenantId?: string
    jwksUrl?: string
    oidcUrl?: string
    audience?: string
    issuer?: string
    apiKeys?: string[]
    functionId?: string
  }
  createdAt: string
  updatedAt: string
}

interface GatewayRoute {
  id: string
  routePath: string
  functionId: string | null
  functionName: string | null
  allowedMethods: string[]
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  corsSettings: CorsSettings
  authMethodIds: string[]
  authMethodNames: string[]
  authLogic: 'or' | 'and'
}

interface GatewayConfig {
  id?: string
  enabled: boolean
  customDomain: string | null
}

interface FunctionOption {
  id: string
  name: string
}

interface EventHandlerEntry {
  id?: string
  eventName: string
  functionId: string | null
}

interface RealtimeNamespace {
  id: string
  namespacePath: string
  isActive: boolean
  authLogic: 'or' | 'and'
  createdAt: string
  updatedAt: string
  eventHandlers: EventHandlerEntry[]
  authMethodIds: string[]
  authMethodNames: string[]
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const defaultCors = (): CorsSettings => ({
  enabled: false,
  allowedOrigins: [],
  allowedHeaders: [],
  exposeHeaders: [],
  maxAge: 86400,
  allowCredentials: false,
})

const parseUrlField = (value: string): { protocol: 'http' | 'https'; host: string } => {
  if (value.startsWith('http://')) return { protocol: 'http', host: value.slice(7) }
  if (value.startsWith('https://')) return { protocol: 'https', host: value.slice(8) }
  return { protocol: 'https', host: value }
}

// ─── JWT mode helpers ────────────────────────────────────────────────────────

const JWT_MODE_LABELS: Record<string, string> = {
  microsoft: 'Microsoft (Entra ID / Azure AD)',
  google: 'Google',
  github: 'GitHub',
  jwks_endpoint: 'Custom (JWKS Endpoint)',
  oidc_discovery: 'Custom (OIDC Discovery)',
  fixed_secret: 'Custom (Fixed Secret)',
}

function jwtModeShortLabel(mode?: string): string | null {
  switch (mode) {
    case 'microsoft': return 'MS'
    case 'google': return 'Google'
    case 'github': return 'GitHub'
    case 'jwks_endpoint': return 'JWKS'
    case 'oidc_discovery': return 'OIDC'
    default: return null
  }
}

function authTypeBadgeClass(type: string) {
  if (type === 'basic_auth') return 'bg-blue-900/40 text-blue-300 border border-blue-700'
  if (type === 'bearer_jwt') return 'bg-yellow-900/40 text-yellow-300 border border-yellow-700'
  if (type === 'middleware') return 'bg-purple-900/40 text-purple-300 border border-purple-700'
  return 'bg-green-900/40 text-green-300 border border-green-700'
}

function authTypeLabel(m: AuthMethod): string {
  if (m.type === 'basic_auth') return 'Basic'
  if (m.type === 'bearer_jwt') {
    const sub = jwtModeShortLabel(m.config?.jwtMode)
    return sub ? `JWT · ${sub}` : 'JWT'
  }
  if (m.type === 'middleware') return 'Middleware'
  return 'API Key'
}

// ─── Tag Input ────────────────────────────────────────────────────────────────

function TagInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [input, setInput] = useState('')

  const add = () => {
    const trimmed = input.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInput('')
  }

  return (
    <div
      className={cn(
        'flex flex-wrap gap-1 p-2 bg-background border border-input rounded-md',
        disabled && 'opacity-50'
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="flex items-center gap-1 text-xs bg-muted text-foreground px-2 py-0.5 rounded">
          {tag}
          {!disabled && (
            <button onClick={() => onChange(value.filter((t) => t !== tag))} className="text-muted-foreground hover:text-red-400">
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
          placeholder={value.length === 0 ? placeholder : 'Add...'}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-foreground outline-none placeholder-muted-foreground"
        />
      )}
    </div>
  )
}

// ─── Sortable Route Row ───────────────────────────────────────────────────────

function SortableRouteRow({
  route,
  onEdit,
  onDelete,
  gatewayDomain,
  projectSlug,
  customDomain,
}: {
  route: GatewayRoute
  onEdit: (route: GatewayRoute) => void
  onDelete: (id: string) => void
  gatewayDomain?: string
  projectSlug?: string
  customDomain?: string | null
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: route.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-8 px-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {customDomain ? (
            <a href={`${customDomain}${route.routePath}`} target="_blank" rel="noopener noreferrer"
              className="text-sm text-primary font-mono hover:underline">
              {route.routePath}
            </a>
          ) : gatewayDomain && projectSlug ? (
            <a href={`${gatewayDomain}/${projectSlug}${route.routePath}`} target="_blank" rel="noopener noreferrer"
              className="text-sm text-primary font-mono hover:underline">
              {route.routePath}
            </a>
          ) : (
            <code className="text-sm text-primary font-mono">{route.routePath}</code>
          )}
          {!route.isActive && <Badge variant="secondary" className="text-xs">disabled</Badge>}
        </div>
      </TableCell>
      <TableCell>
        {route.functionName ? (
          <code className="text-xs bg-muted px-2 py-0.5 rounded">{route.functionName}</code>
        ) : (
          <span className="text-muted-foreground italic text-xs">not configured</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {route.allowedMethods.map((m) => (
            <span key={m} className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700 px-1.5 py-0.5 rounded font-mono">
              {m}
            </span>
          ))}
        </div>
      </TableCell>
      <TableCell>
        {!route.authMethodNames || route.authMethodNames.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {route.authMethodNames.map((name) => (
              <span key={name} className="text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-700 px-1.5 py-0.5 rounded">
                {name}
              </span>
            ))}
            {route.authMethodNames.length > 1 && (
              <span className="text-xs text-muted-foreground ml-1">
                ({route.authLogic === 'and' ? 'All match' : 'Any match'})
              </span>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        {route.corsSettings.enabled ? (
          <span className="text-green-400 text-sm">Enabled</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(route)} className="h-8 w-8 text-muted-foreground hover:text-primary">
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(route.id)} className="h-8 w-8 text-muted-foreground hover:text-red-400">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── Sortable Auth Method Item ─────────────────────────────────────────────--

function SortableAuthMethodItem({
  method,
  showHandle,
  onRemove,
}: {
  method: AuthMethod
  showHandle: boolean
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: method.id,
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded px-2 py-1.5 bg-muted/60 border border-border"
    >
      {showHandle ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      ) : (
        <span className="w-3.5 h-3.5 flex-shrink-0" />
      )}
      <span className="flex-1 text-sm text-foreground">{method.name}</span>
      <span className={cn('text-xs px-1.5 py-0.5 rounded font-mono', authTypeBadgeClass(method.type))}>
        {authTypeLabel(method)}
      </span>
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-red-400 flex-shrink-0 ml-1">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Route Editor Modal ───────────────────────────────────────────────────────

function RouteEditorModal({
  isOpen,
  route,
  functions,
  authMethods,
  gatewayDomain,
  projectSlug,
  customDomain,
  onSave,
  onClose,
}: {
  isOpen: boolean
  route: Partial<GatewayRoute> | null
  functions: FunctionOption[]
  authMethods: AuthMethod[]
  gatewayDomain?: string
  projectSlug?: string
  customDomain?: string | null
  onSave: (data: any) => Promise<void>
  onClose: () => void
}) {
  const NO_FUNCTION_VALUE = '__none__'
  const [routePath, setRoutePath] = useState('')
  const [functionId, setFunctionId] = useState<string>('')
  const [allowedMethods, setAllowedMethods] = useState<string[]>(['GET', 'POST'])
  const [isActive, setIsActive] = useState(true)
  const [cors, setCors] = useState<CorsSettings>(defaultCors())
  const [selectedAuthMethodIds, setSelectedAuthMethodIds] = useState<string[]>([])
  const [authLogic, setAuthLogic] = useState<'or' | 'and'>('or')
  const [corsOpen, setCorsOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const authDndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    if (isOpen && route) {
      setRoutePath(route.routePath || '')
      const routeFunctionId = route.functionId || ''
      const functionExists = !!routeFunctionId && functions.some((f) => f.id === routeFunctionId)
      setFunctionId(functionExists ? routeFunctionId : '')
      setAllowedMethods(route.allowedMethods || ['GET', 'POST'])
      setIsActive(route.isActive !== undefined ? route.isActive : true)
      setCors(route.corsSettings ? { ...route.corsSettings } : defaultCors())
      setSelectedAuthMethodIds(route.authMethodIds ? [...route.authMethodIds] : [])
      setAuthLogic(route.authLogic || 'or')
      setCorsOpen(route.corsSettings?.enabled || false)
    }
  }, [functions, isOpen, route])

  const toggleMethod = (method: string) => {
    setAllowedMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    )
  }

  const handleSave = async () => {
    if (!routePath.trim()) { toast.error('Route path is required'); return }
    if (!routePath.startsWith('/')) { toast.error('Route path must start with /'); return }
    if (allowedMethods.length === 0) { toast.error('At least one HTTP method must be allowed'); return }

    setSaving(true)
    try {
      await onSave({
        routePath: routePath.trim(),
        functionId: functionId || null,
        allowedMethods,
        isActive,
        corsSettings: cors,
        authMethodIds: selectedAuthMethodIds,
        authLogic,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title={route?.id ? 'Edit Route' : 'Add Route'}
      onConfirm={handleSave}
      onCancel={onClose}
      confirmText="Save Route"
      cancelText="Cancel"
      loading={saving}
      size="lg"
    >
      <div className="overflow-y-auto max-h-[65vh] space-y-5 -mx-6 px-6 py-1">
        {/* Route Path */}
        <div className="space-y-1.5">
          <Label>Route Path <span className="text-red-400">*</span></Label>
          <Input
            value={routePath}
            onChange={(e) => setRoutePath(e.target.value)}
            placeholder="e.g. /users/:userId/books/:bookId"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Use <code className="bg-muted px-1 rounded">:paramName</code> for dynamic segments.
          </p>
          {(gatewayDomain || customDomain) && routePath && (
            <div className="mt-2 space-y-1">
              {gatewayDomain && projectSlug && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground shrink-0">Default:</span>
                  <a href={`${gatewayDomain}/${projectSlug}${routePath}`} target="_blank" rel="noopener noreferrer"
                    className="font-mono text-primary hover:underline truncate">
                    {`${gatewayDomain}/${projectSlug}${routePath}`}
                  </a>
                </div>
              )}
              {customDomain && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground shrink-0">Custom:</span>
                  <a href={`${customDomain}${routePath}`} target="_blank" rel="noopener noreferrer"
                    className="font-mono text-primary hover:underline truncate">
                    {`${customDomain}${routePath}`}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Upstream Function */}
        <div className="space-y-1.5">
          <Label>Upstream Function</Label>
          <Select
            value={functionId || NO_FUNCTION_VALUE}
            onValueChange={(value) => setFunctionId(value === NO_FUNCTION_VALUE ? '' : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="— Select function —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FUNCTION_VALUE}>— Select function —</SelectItem>
              {functions.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* HTTP Methods */}
        <div className="space-y-2">
          <Label>Allowed HTTP Methods</Label>
          <div className="flex flex-wrap gap-2">
            {HTTP_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => toggleMethod(method)}
                className={cn(
                  'text-xs font-mono px-2.5 py-1 rounded border transition-colors',
                  allowedMethods.includes(method)
                    ? 'bg-blue-900/70 border-blue-600 text-blue-200'
                    : 'bg-muted border-border text-muted-foreground hover:border-foreground'
                )}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        {/* Active Toggle */}
        <div className="flex items-center gap-2">
          <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
          <Label htmlFor="isActive" className="cursor-pointer">Route is active</Label>
        </div>

        {/* CORS Settings */}
        <Collapsible open={corsOpen} onOpenChange={setCorsOpen}>
          <div className="border border-border rounded-lg overflow-hidden">
            <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-sm font-medium text-foreground">
              <span className="flex items-center gap-2">
                {corsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                CORS Settings
              </span>
              {cors.enabled && <span className="text-xs text-green-400">Enabled</span>}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-4 space-y-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Switch
                    id="corsEnabled"
                    checked={cors.enabled}
                    onCheckedChange={(v) => setCors((c) => ({ ...c, enabled: v }))}
                  />
                  <Label htmlFor="corsEnabled" className="cursor-pointer">Enable CORS</Label>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Allowed Origins (press Enter to add)</Label>
                  <TagInput value={cors.allowedOrigins} onChange={(v) => setCors((c) => ({ ...c, allowedOrigins: v }))}
                    placeholder="https://example.com or *" disabled={!cors.enabled} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Allowed Headers</Label>
                  <TagInput value={cors.allowedHeaders} onChange={(v) => setCors((c) => ({ ...c, allowedHeaders: v }))}
                    placeholder="Content-Type, Authorization" disabled={!cors.enabled} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Expose Headers</Label>
                  <TagInput value={cors.exposeHeaders} onChange={(v) => setCors((c) => ({ ...c, exposeHeaders: v }))}
                    placeholder="X-Request-Id" disabled={!cors.enabled} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Max Age (seconds)</Label>
                    <Input
                      type="number"
                      value={cors.maxAge}
                      onChange={(e) => setCors((c) => ({ ...c, maxAge: parseInt(e.target.value) || 86400 }))}
                      disabled={!cors.enabled}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <Switch
                      id="allowCredentials"
                      checked={cors.allowCredentials}
                      onCheckedChange={(v) => setCors((c) => ({ ...c, allowCredentials: v }))}
                      disabled={!cors.enabled}
                    />
                    <Label htmlFor="allowCredentials" className="cursor-pointer text-sm">Allow Credentials</Label>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Auth Methods */}
        <div className="space-y-2">
          <Label>Authentication</Label>
          {authMethods.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              No authentication methods configured. Add methods in the <span className="text-primary">Authentication</span> tab.
            </div>
          ) : (
            <div className="space-y-2">
              {selectedAuthMethodIds.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground text-center">
                  No auth <span className="text-foreground font-medium">(public)</span> — add a method below to require authentication
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
                  {selectedAuthMethodIds.length > 1 && (
                    <p className="text-xs text-muted-foreground pb-1">Drag to set execution order</p>
                  )}
                  <DndContext
                    sensors={authDndSensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragEnd={(event: DragEndEvent) => {
                      const { active, over } = event
                      if (over && active.id !== over.id) {
                        setSelectedAuthMethodIds((prev) => {
                          const oldIdx = prev.indexOf(active.id as string)
                          const newIdx = prev.indexOf(over.id as string)
                          return arrayMove(prev, oldIdx, newIdx)
                        })
                      }
                    }}
                  >
                    <SortableContext items={selectedAuthMethodIds} strategy={verticalListSortingStrategy}>
                      {selectedAuthMethodIds.map((id) => {
                        const m = authMethods.find((x) => x.id === id)
                        if (!m) return null
                        return (
                          <SortableAuthMethodItem
                            key={m.id}
                            method={m}
                            showHandle={selectedAuthMethodIds.length > 1}
                            onRemove={() => setSelectedAuthMethodIds((prev) => prev.filter((x) => x !== id))}
                          />
                        )
                      })}
                    </SortableContext>
                  </DndContext>
                </div>
              )}

              {authMethods.some((m) => !selectedAuthMethodIds.includes(m.id)) && (
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground pb-0.5">Add method</p>
                  {authMethods
                    .filter((m) => !selectedAuthMethodIds.includes(m.id))
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedAuthMethodIds((prev) => [...prev, m.id])}
                        className="w-full flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 text-left"
                      >
                        <Plus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1 text-sm text-foreground">{m.name}</span>
                        <span className={cn('text-xs px-1.5 py-0.5 rounded font-mono', authTypeBadgeClass(m.type))}>
                          {authTypeLabel(m)}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
          {selectedAuthMethodIds.length > 1 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">Logic:</span>
              <div className="flex rounded-md overflow-hidden border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setAuthLogic('or')}
                  className={cn('px-3 py-1 transition-colors', authLogic === 'or' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
                >Any match</button>
                <button
                  type="button"
                  onClick={() => setAuthLogic('and')}
                  className={cn('px-3 py-1 transition-colors border-l border-border', authLogic === 'and' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
                >All match</button>
              </div>
              <span className="text-xs text-muted-foreground">
                {authLogic === 'or' ? 'Access granted if any method passes' : 'All methods must pass'}
              </span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Realtime Namespace Row ───────────────────────────────────────────────────

function RealtimeNamespaceRow({
  namespace,
  onEdit,
  onDelete,
  gatewayDomain,
  projectSlug,
  customDomain,
}: {
  namespace: RealtimeNamespace
  onEdit: (ns: RealtimeNamespace) => void
  onDelete: (id: string) => void
  gatewayDomain?: string
  projectSlug?: string
  customDomain?: string | null
}) {
  const [copied, setCopied] = useState(false)

  const getNamespaceUrl = () => {
    if (customDomain) return `${customDomain}${namespace.namespacePath}`
    if (gatewayDomain && projectSlug) return `${gatewayDomain}/${projectSlug}${namespace.namespacePath}`
    return namespace.namespacePath
  }

  const copyToClipboard = () => {
    const url = getNamespaceUrl()
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('Namespace URL copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 text-sm text-primary font-mono hover:underline cursor-pointer"
            title="Click to copy full URL"
          >
            {namespace.namespacePath}
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 opacity-60 transition-opacity group-hover:opacity-100" />
            )}
          </button>
          {!namespace.isActive && <Badge variant="secondary" className="text-xs">disabled</Badge>}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {namespace.eventHandlers.length === 0 ? (
            <span className="text-muted-foreground text-xs">—</span>
          ) : (
            namespace.eventHandlers.map((eh, i) => (
              <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                {eh.eventName}
              </span>
            ))
          )}
        </div>
      </TableCell>
      <TableCell>
        {!namespace.authMethodNames || namespace.authMethodNames.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {namespace.authMethodNames.map((name) => (
              <span key={name} className="text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-700 px-1.5 py-0.5 rounded">
                {name}
              </span>
            ))}
            {namespace.authMethodNames.length > 1 && (
              <span className="text-xs text-muted-foreground ml-1">
                ({namespace.authLogic === 'and' ? 'All match' : 'Any match'})
              </span>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={() => onEdit(namespace)}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-red-400"
            onClick={() => onDelete(namespace.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── Namespace Editor Modal ───────────────────────────────────────────────────

function NamespaceEditorModal({
  isOpen,
  namespace,
  functions,
  authMethods,
  onSave,
  onClose,
  projectSlug,
  customDomain,
  gatewayDomain,
}: {
  isOpen: boolean
  namespace: Partial<RealtimeNamespace> | null
  functions: FunctionOption[]
  authMethods: AuthMethod[]
  onSave: (data: any) => Promise<void>
  onClose: () => void
  projectSlug?: string
  customDomain?: string | null
  gatewayDomain?: string
}) {
  const NO_FUNCTION_VALUE = '__none__'
  const [namespacePath, setNamespacePath] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [authLogic, setAuthLogic] = useState<'or' | 'and'>('or')
  const [eventHandlers, setEventHandlers] = useState<EventHandlerEntry[]>([])
  const [selectedAuthMethodIds, setSelectedAuthMethodIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const authDndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    if (isOpen && namespace) {
      setNamespacePath(namespace.namespacePath || '')
      setIsActive(namespace.isActive !== undefined ? namespace.isActive : true)
      setAuthLogic(namespace.authLogic || 'or')
      setEventHandlers(namespace.eventHandlers ? [...namespace.eventHandlers] : [])
      setSelectedAuthMethodIds(namespace.authMethodIds ? [...namespace.authMethodIds] : [])
    }
  }, [isOpen, namespace])

  const addEventHandler = () => {
    setEventHandlers((prev) => [...prev, { eventName: '', functionId: null }])
  }

  const removeEventHandler = (index: number) => {
    setEventHandlers((prev) => prev.filter((_, i) => i !== index))
  }

  const updateEventHandler = (index: number, field: keyof EventHandlerEntry, value: string | null) => {
    setEventHandlers((prev) => prev.map((eh, i) => i === index ? { ...eh, [field]: value } : eh))
  }

  const handleSave = async () => {
    if (!namespacePath.trim()) { toast.error('Namespace path is required'); return }
    if (!namespacePath.startsWith('/')) { toast.error('Namespace path must start with /'); return }
    setSaving(true)
    try {
      await onSave({
        namespacePath: namespacePath.trim(),
        isActive,
        authLogic,
        eventHandlers: eventHandlers.filter((eh) => eh.eventName.trim()),
        authMethodIds: selectedAuthMethodIds,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const selectedAuthMethods = selectedAuthMethodIds
    .map((id) => authMethods.find((m) => m.id === id))
    .filter((m): m is AuthMethod => !!m)

  return (
    <Modal
      isOpen={isOpen}
      title={namespace?.id ? 'Edit Namespace' : 'Add Namespace'}
      onConfirm={handleSave}
      onCancel={onClose}
      confirmText="Save Namespace"
      cancelText="Cancel"
      loading={saving}
      size="lg"
    >
      <div className="overflow-y-auto max-h-[65vh] space-y-5 -mx-6 px-6 py-1">
        {/* Namespace Path */}
        <div className="space-y-1.5">
          <Label>Namespace Path <span className="text-red-400">*</span></Label>
          <Input
            value={namespacePath}
            onChange={(e) => setNamespacePath(e.target.value)}
            placeholder="e.g. /chat"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            {customDomain ? (
              <>
                Clients connect to <code className="bg-muted px-1 rounded">{customDomain}{namespacePath || '/chat'}</code> on the gateway domain.
              </>
            ) : gatewayDomain && projectSlug ? (
              <>
                Clients connect to <code className="bg-muted px-1 rounded">{gatewayDomain}/{projectSlug}{namespacePath || '/chat'}</code> on the gateway domain.
              </>
            ) : (
              <>
                Clients connect to <code className="bg-muted px-1 rounded">/{'<'}project-slug{'>'}{namespacePath || '/chat'}</code> on the gateway domain.
              </>
            )}
          </p>
        </div>

        {/* Active Toggle */}
        <div className="flex items-center gap-2">
          <Switch id="nsIsActive" checked={isActive} onCheckedChange={setIsActive} />
          <Label htmlFor="nsIsActive" className="cursor-pointer">Namespace is active</Label>
        </div>

        {/* Event Handlers */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Event Handlers</Label>
            <Button type="button" variant="outline" size="sm" onClick={addEventHandler}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Handler
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use <code className="bg-muted px-1 rounded">$connect</code>, <code className="bg-muted px-1 rounded">$disconnect</code>, or a custom event name.
          </p>
          <div className="space-y-2">
            {eventHandlers.map((eh, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={eh.eventName}
                  onChange={(e) => updateEventHandler(i, 'eventName', e.target.value)}
                  placeholder="Event name (e.g. message)"
                  className="font-mono flex-1"
                />
                <Select
                  value={eh.functionId || NO_FUNCTION_VALUE}
                  onValueChange={(v) => updateEventHandler(i, 'functionId', v === NO_FUNCTION_VALUE ? null : v)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="— Select function —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FUNCTION_VALUE}>— Select function —</SelectItem>
                    {functions.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-red-400 shrink-0"
                  onClick={() => removeEventHandler(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {eventHandlers.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No event handlers configured.</p>
            )}
          </div>
        </div>

        {/* Auth Methods */}
        <div className="space-y-2">
          <Label>Authentication Methods</Label>
          <Select onValueChange={(id) => { if (!selectedAuthMethodIds.includes(id)) setSelectedAuthMethodIds((prev) => [...prev, id]) }}>
            <SelectTrigger>
              <SelectValue placeholder="— Add auth method —" />
            </SelectTrigger>
            <SelectContent>
              {authMethods
                .filter((m) => !selectedAuthMethodIds.includes(m.id))
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          {selectedAuthMethods.length > 0 && (
            <div className="space-y-1.5 mt-2">
              <DndContext
                sensors={authDndSensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={(event: DragEndEvent) => {
                  const { active, over } = event
                  if (over && active.id !== over.id) {
                    const oldIdx = selectedAuthMethodIds.indexOf(String(active.id))
                    const newIdx = selectedAuthMethodIds.indexOf(String(over.id))
                    setSelectedAuthMethodIds(arrayMove(selectedAuthMethodIds, oldIdx, newIdx))
                  }
                }}
              >
                <SortableContext items={selectedAuthMethodIds} strategy={verticalListSortingStrategy}>
                  {selectedAuthMethods.map((m) => (
                    <SortableAuthMethodItem
                      key={m.id}
                      method={m}
                      showHandle={selectedAuthMethods.length > 1}
                      onRemove={() => setSelectedAuthMethodIds((prev) => prev.filter((id) => id !== m.id))}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
          {selectedAuthMethods.length > 1 && (
            <div className="mt-2 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Auth Logic</Label>
              <Select value={authLogic} onValueChange={(v: 'or' | 'and') => setAuthLogic(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="or">Any match (OR)</SelectItem>
                  <SelectItem value="and">All match (AND)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Auth Method Modal ────────────────────────────────────────────────────────

function AuthMethodModal({
  isOpen,
  method,
  functions,
  onSave,
  onClose,
}: {
  isOpen: boolean
  method: Partial<AuthMethod> | null
  functions: FunctionOption[]
  onSave: (data: { name: string; type: string; config: any }) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'basic_auth' | 'bearer_jwt' | 'api_key' | 'middleware'>('bearer_jwt')
  const [jwtMode, setJwtMode] = useState('fixed_secret')
  const [jwtSecret, setJwtSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [tenantId, setTenantId] = useState('')
  const [jwksUrl, setJwksUrl] = useState('')
  const [oidcUrl, setOidcUrl] = useState('')
  const [audience, setAudience] = useState('')
  const [issuer, setIssuer] = useState('')
  const [apiKeys, setApiKeys] = useState<string[]>([])
  const [credentials, setCredentials] = useState<{ username: string; password: string }[]>([])
  const [realm, setRealm] = useState('')
  const [middlewareFunctionId, setMiddlewareFunctionId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen && method) {
      setName(method.name || '')
      setType(method.type || 'bearer_jwt')
      setJwtMode(method.config?.jwtMode || 'fixed_secret')
      setJwtSecret(method.config?.jwtSecret || '')
      setTenantId(method.config?.tenantId || '')
      setJwksUrl(method.config?.jwksUrl || '')
      setOidcUrl(method.config?.oidcUrl || '')
      setAudience(method.config?.audience || '')
      setIssuer(method.config?.issuer || '')
      setApiKeys(method.config?.apiKeys ? [...method.config.apiKeys] : [])
      setCredentials(method.config?.credentials ? method.config.credentials.map((c) => ({ ...c })) : [])
      setRealm(method.config?.realm || '')
      setMiddlewareFunctionId(method.config?.functionId || '')
      setShowSecret(false)
    }
  }, [isOpen, method])

  const buildConfig = () => {
    if (type === 'basic_auth') return { credentials, ...(realm.trim() ? { realm: realm.trim() } : {}) }
    if (type === 'bearer_jwt') {
      const cfg: Record<string, string> = { jwtMode }
      if (jwtMode === 'fixed_secret') cfg.jwtSecret = jwtSecret
      else if (jwtMode === 'microsoft') cfg.tenantId = tenantId
      else if (jwtMode === 'jwks_endpoint') cfg.jwksUrl = jwksUrl
      else if (jwtMode === 'oidc_discovery') cfg.oidcUrl = oidcUrl
      if (audience.trim()) cfg.audience = audience.trim()
      if (issuer.trim()) cfg.issuer = issuer.trim()
      return cfg
    }
    if (type === 'api_key') return { apiKeys }
    if (type === 'middleware') return { functionId: middlewareFunctionId }
    return {}
  }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    if (type === 'bearer_jwt') {
      if (jwtMode === 'fixed_secret' && !jwtSecret.trim()) { toast.error('JWT secret is required'); return }
      if (jwtMode === 'microsoft' && !tenantId.trim()) { toast.error('Tenant ID is required'); return }
      if (jwtMode === 'jwks_endpoint' && !jwksUrl.trim()) { toast.error('JWKS URL is required'); return }
      if (jwtMode === 'oidc_discovery' && !oidcUrl.trim()) { toast.error('OIDC Discovery URL is required'); return }
    }
    if (type === 'basic_auth' && credentials.length === 0) { toast.error('At least one credential is required'); return }
    if (type === 'basic_auth' && credentials.some((c) => !c.username.trim() || !c.password.trim())) {
      toast.error('All credentials must have a username and password'); return
    }
    if (type === 'middleware' && !middlewareFunctionId) { toast.error('A function must be selected'); return }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), type, config: buildConfig() })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title={method?.id ? 'Edit Auth Method' : 'Add Auth Method'}
      onConfirm={handleSave}
      onCancel={onClose}
      confirmText="Save"
      cancelText="Cancel"
      loading={saving}
      size="md"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name <span className="text-red-400">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Admin JWT, Public API Key" />
        </div>

        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as any)} disabled={!!method?.id}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bearer_jwt">Bearer JWT</SelectItem>
              <SelectItem value="api_key">API Key</SelectItem>
              <SelectItem value="basic_auth">Basic Auth</SelectItem>
              <SelectItem value="middleware">Middleware</SelectItem>
            </SelectContent>
          </Select>
          {method?.id && <p className="text-xs text-muted-foreground">Type cannot be changed after creation.</p>}
        </div>

        {/* Bearer JWT config */}
        {type === 'bearer_jwt' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>JWT Mode</Label>
              <Select value={jwtMode} onValueChange={setJwtMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(JWT_MODE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {jwtMode === 'microsoft' && (
              <div className="space-y-1.5">
                <Label>Tenant ID <span className="text-red-400">*</span></Label>
                <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="font-mono" />
                <p className="text-xs text-muted-foreground">Found in Azure Portal → App registrations → Directory (tenant) ID.</p>
              </div>
            )}

            {jwtMode === 'google' && (
              <p className="text-xs text-muted-foreground rounded-md bg-muted border border-border px-3 py-2">
                Validates tokens signed by Google&apos;s public keys. No additional configuration required.
              </p>
            )}

            {jwtMode === 'github' && (
              <p className="text-xs text-muted-foreground rounded-md bg-muted border border-border px-3 py-2">
                Validates GitHub Actions OIDC tokens issued by{' '}
                <code className="bg-background px-1 rounded">token.actions.githubusercontent.com</code>.
                No additional configuration required.
              </p>
            )}

            {jwtMode === 'jwks_endpoint' && (
              <div className="space-y-1.5">
                <Label>JWKS URL <span className="text-red-400">*</span></Label>
                <Input type="url" value={jwksUrl} onChange={(e) => setJwksUrl(e.target.value)} placeholder="https://example.com/.well-known/jwks.json" className="font-mono" />
              </div>
            )}

            {jwtMode === 'oidc_discovery' && (
              <div className="space-y-1.5">
                <Label>OIDC Discovery URL <span className="text-red-400">*</span></Label>
                <Input type="url" value={oidcUrl} onChange={(e) => setOidcUrl(e.target.value)} placeholder="https://example.com/.well-known/openid-configuration" className="font-mono" />
              </div>
            )}

            {jwtMode === 'fixed_secret' && (
              <div className="space-y-1.5">
                <Label>JWT Secret <span className="text-red-400">*</span></Label>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={jwtSecret}
                    onChange={(e) => setJwtSecret(e.target.value)}
                    placeholder="Enter HMAC signing secret"
                    className="pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3 pt-1 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">
                Claim Validation <span className="font-normal normal-case">(optional)</span>
              </p>
              <div className="space-y-1.5">
                <Label>Audience (aud)</Label>
                <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="https://api.myapp.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Issuer (iss)</Label>
                <Input value={issuer} onChange={(e) => setIssuer(e.target.value)}
                  placeholder={jwtMode === 'microsoft' ? 'https://login.microsoftonline.com/{tenantId}/v2.0' : jwtMode === 'google' ? 'https://accounts.google.com' : 'https://issuer.example.com'} />
              </div>
            </div>
          </div>
        )}

        {/* API Key config */}
        {type === 'api_key' && (
          <div className="space-y-1.5">
            <Label>API Keys <span className="text-muted-foreground font-normal">(press Enter to add)</span></Label>
            <TagInput value={apiKeys} onChange={setApiKeys} placeholder="Paste or type key" />
          </div>
        )}

        {/* Basic Auth config */}
        {type === 'basic_auth' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Credentials</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setCredentials((c) => [...c, { username: '', password: '' }])}>
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            {credentials.length === 0 && <p className="text-xs text-muted-foreground">No credentials added yet.</p>}
            <div className="space-y-2">
              {credentials.map((cred, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={cred.username}
                    onChange={(e) => setCredentials((c) => c.map((cr, idx) => idx === i ? { ...cr, username: e.target.value } : cr))}
                    placeholder="Username"
                  />
                  <Input
                    type="password"
                    value={cred.password}
                    onChange={(e) => setCredentials((c) => c.map((cr, idx) => idx === i ? { ...cr, password: e.target.value } : cr))}
                    placeholder="Password"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setCredentials((c) => c.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-red-400 flex-shrink-0">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Realm <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={realm} onChange={(e) => setRealm(e.target.value)} placeholder="e.g. Admin Area" />
            </div>
          </div>
        )}

        {/* Middleware config */}
        {type === 'middleware' && (
          <div className="space-y-1.5">
            <Label>Function <span className="text-red-400">*</span></Label>
            {functions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No functions deployed in this project.</p>
            ) : (
              <Select value={middlewareFunctionId} onValueChange={setMiddlewareFunctionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a function…" />
                </SelectTrigger>
                <SelectContent>
                  {functions.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApiGatewayPage() {
  const { activeProject } = useProject()
  const [projectIsActive, setProjectIsActive] = useState<boolean | null>(null)

  const [activeTab, setActiveTab] = useState<'routes' | 'authentication' | 'realtime'>('routes')
  const [realtimeNamespaces, setRealtimeNamespaces] = useState<RealtimeNamespace[]>([])
  const [namespaceModalOpen, setNamespaceModalOpen] = useState(false)
  const [editingNamespace, setEditingNamespace] = useState<Partial<RealtimeNamespace> | null>(null)
  const [deleteNamespaceId, setDeleteNamespaceId] = useState<string | null>(null)
  const [config, setConfig] = useState<GatewayConfig>({ enabled: false, customDomain: null })
  const [routes, setRoutes] = useState<GatewayRoute[]>([])
  const [functions, setFunctions] = useState<FunctionOption[]>([])
  const [authMethods, setAuthMethods] = useState<AuthMethod[]>([])
  const [gatewayDomain, setGatewayDomain] = useState<string>('')
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [customDomainInput, setCustomDomainInput] = useState('')
  const [customDomainProtocol, setCustomDomainProtocol] = useState<'http' | 'https'>('https')
  const [modalOpen, setModalOpen] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<Partial<GatewayRoute> | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [orderDirty, setOrderDirty] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [authMethodModalOpen, setAuthMethodModalOpen] = useState(false)
  const [editingAuthMethod, setEditingAuthMethod] = useState<Partial<AuthMethod> | null>(null)
  const [deleteAuthMethodId, setDeleteAuthMethodId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (activeProject?.id && UUID_RE.test(activeProject.id)) {
      setActiveTab('routes')
      setOrderDirty(false)
      loadAll()
      setProjectIsActive(null)
      authenticatedFetch(`/api/admin/projects/${activeProject.id}`)
        .then(r => r.json())
        .then(d => { if (d.success) setProjectIsActive(d.data.is_active) })
        .catch(() => {})
    } else {
      setProjectIsActive(null)
    }
  }, [activeProject?.id])

  const loadAll = async () => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!activeProject?.id || !UUID_RE.test(activeProject.id)) return
    setLoadingConfig(true)
    try {
      const [cfgRes, routesRes, funcsRes, gsRes, authRes, nsRes] = await Promise.all([
        authenticatedFetch(`/api/gateway/config?projectId=${activeProject.id}`),
        authenticatedFetch(`/api/gateway/routes?projectId=${activeProject.id}`),
        authenticatedFetch(`/api/functions?projectId=${activeProject.id}`),
        authenticatedFetch('/api/admin/global-settings'),
        authenticatedFetch(`/api/gateway/auth-methods?projectId=${activeProject.id}`),
        authenticatedFetch(`/api/gateway/realtime-namespaces?projectId=${activeProject.id}`),
      ])
      if (cfgRes.ok) {
        const d = await cfgRes.json()
        setConfig(d.data)
        const { protocol, host } = parseUrlField(d.data.customDomain || '')
        setCustomDomainProtocol(protocol)
        setCustomDomainInput(host)
      }
      if (routesRes.ok) { const d = await routesRes.json(); setRoutes(d.data || []); setOrderDirty(false) }
      if (funcsRes.ok) { const d = await funcsRes.json(); setFunctions((d.data || []).map((f: any) => ({ id: f.id, name: f.name }))) }
      if (gsRes.ok) { const d = await gsRes.json(); setGatewayDomain(d.data?.api_gateway_domain?.value || '') }
      if (authRes.ok) { const d = await authRes.json(); setAuthMethods(d.data || []) }
      if (nsRes.ok) { const d = await nsRes.json(); setRealtimeNamespaces(d.data || []) }
    } catch {
      toast.error('Failed to load gateway settings')
    } finally {
      setLoadingConfig(false)
    }
  }

  const handleSaveConfig = async () => {
    if (!activeProject?.id) return
    setSavingConfig(true)
    try {
      const res = await authenticatedFetch(`/api/gateway/config?projectId=${activeProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: config.enabled,
          customDomain: customDomainInput ? `${customDomainProtocol}://${customDomainInput}` : null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setConfig(data.data)
        toast.success('Gateway configuration saved')
        setConfigModalOpen(false)
      } else {
        toast.error(data.message || 'Failed to save configuration')
      }
    } catch {
      toast.error('Failed to save configuration')
    } finally {
      setSavingConfig(false)
    }
  }

  const handleSaveRoute = async (data: any) => {
    if (!activeProject?.id) return
    if (editingRoute?.id) {
      const res = await authenticatedFetch(`/api/gateway/routes/${editingRoute.id}?projectId=${activeProject.id}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const body = await res.json()
      if (!res.ok) { toast.error(body.message || 'Failed to update route'); throw new Error(body.message) }
      toast.success('Route updated')
    } else {
      const res = await authenticatedFetch(`/api/gateway/routes?projectId=${activeProject.id}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const body = await res.json()
      if (!res.ok) { toast.error(body.message || 'Failed to create route'); throw new Error(body.message) }
      toast.success('Route created')
    }
    await loadAll()
  }

  const handleDeleteRoute = async (id: string) => {
    if (!activeProject?.id) return
    const res = await authenticatedFetch(`/api/gateway/routes/${id}?projectId=${activeProject.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Route deleted')
      setRoutes((prev) => prev.filter((r) => r.id !== id))
    } else {
      toast.error('Failed to delete route')
    }
    setDeleteConfirmId(null)
  }

  const handleSaveOrder = async () => {
    if (!activeProject?.id) return
    setSavingOrder(true)
    try {
      const res = await authenticatedFetch(`/api/gateway/routes/reorder?projectId=${activeProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: routes.map((r) => ({ id: r.id, sortOrder: r.sortOrder })) }),
      })
      if (res.ok) { toast.success('Route order saved'); setOrderDirty(false) }
      else toast.error('Failed to save route order')
    } catch { toast.error('Failed to save route order') }
    finally { setSavingOrder(false) }
  }

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = routes.findIndex((r) => r.id === active.id)
    const newIndex = routes.findIndex((r) => r.id === over.id)
    const reordered = arrayMove(routes, oldIndex, newIndex)
    setRoutes(reordered.map((r, i) => ({ ...r, sortOrder: i })))
    setOrderDirty(true)
  }, [routes])

  const handleSaveAuthMethod = async (data: { name: string; type: string; config: any }) => {
    if (!activeProject?.id) return
    if (editingAuthMethod?.id) {
      const res = await authenticatedFetch(`/api/gateway/auth-methods/${editingAuthMethod.id}?projectId=${activeProject.id}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const body = await res.json()
      if (!res.ok) { toast.error(body.message || 'Failed to update auth method'); throw new Error(body.message) }
      toast.success('Auth method updated')
    } else {
      const res = await authenticatedFetch(`/api/gateway/auth-methods?projectId=${activeProject.id}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const body = await res.json()
      if (!res.ok) { toast.error(body.message || 'Failed to create auth method'); throw new Error(body.message) }
      toast.success('Auth method created')
    }
    await loadAll()
  }

  const handleDeleteAuthMethod = async (id: string) => {
    if (!activeProject?.id) return
    const res = await authenticatedFetch(`/api/gateway/auth-methods/${id}?projectId=${activeProject.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Auth method deleted'); setAuthMethods((prev) => prev.filter((m) => m.id !== id)) }
    else toast.error('Failed to delete auth method')
    setDeleteAuthMethodId(null)
  }

  const handleSaveNamespace = async (data: {
    namespacePath: string
    isActive: boolean
    authLogic: 'or' | 'and'
    eventHandlers: EventHandlerEntry[]
    authMethodIds: string[]
  }) => {
    if (!activeProject?.id) return
    if (editingNamespace?.id) {
      const res = await authenticatedFetch(
        `/api/gateway/realtime-namespaces/${editingNamespace.id}?projectId=${activeProject.id}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      )
      const body = await res.json()
      if (!res.ok) { toast.error(body.message || 'Failed to update namespace'); throw new Error(body.message) }
      toast.success('Namespace updated')
    } else {
      const res = await authenticatedFetch(
        `/api/gateway/realtime-namespaces?projectId=${activeProject.id}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      )
      const body = await res.json()
      if (!res.ok) { toast.error(body.message || 'Failed to create namespace'); throw new Error(body.message) }
      toast.success('Namespace created')
    }
    await loadAll()
  }

  const handleDeleteNamespace = async (id: string) => {
    if (!activeProject?.id) return
    const res = await authenticatedFetch(
      `/api/gateway/realtime-namespaces/${id}?projectId=${activeProject.id}`,
      { method: 'DELETE' }
    )
    if (res.ok) { toast.success('Namespace deleted'); setRealtimeNamespaces((prev) => prev.filter((ns) => ns.id !== id)) }
    else toast.error('Failed to delete namespace')
    setDeleteNamespaceId(null)
  }

  const projectSlug = activeProject?.slug || activeProject?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const gatewayFull = gatewayDomain ? (gatewayDomain.startsWith('http') ? gatewayDomain : `https://${gatewayDomain}`) : ''
  const customFull = customDomainInput
    ? `${customDomainProtocol}://${customDomainInput}`
    : config.customDomain?.startsWith('http') ? config.customDomain : null
  const defaultUrl = gatewayFull && projectSlug && activeProject?.id !== 'system' ? `${gatewayFull}/${projectSlug}/<route>` : null
  const customUrl = customFull ? `${customFull}/<route>` : null

  return (
    <ProtectedRoute>
      <Layout title="API Gateway">
        <div className="space-y-6">
          {projectIsActive === false && (
            <div className="flex items-center gap-3 rounded-lg border border-yellow-600/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>The project <strong>{activeProject?.name}</strong> is currently inactive. Gateway routes will not accept traffic until the project is reactivated.</span>
            </div>
          )}
          <div className="flex items-start justify-between gap-4">
            <PageHeader
              title="API Gateway"
              subtitle="Configure per-project HTTP routing to invoke functions via custom or default domains"
              icon={<Globe className="w-8 h-8 text-primary" />}
            />
            {activeProject && activeProject.id !== 'system' && !loadingConfig && (
              <Button variant="outline" onClick={() => setConfigModalOpen(true)} className="shrink-0 mt-1">
                <Settings className="w-4 h-4 mr-2" />
                Configure
              </Button>
            )}
          </div>

          {loadingConfig ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader className="w-5 h-5 text-primary animate-spin" />
                <span className="animate-pulse">Loading...</span>
              </div>
            </div>
          ) : !activeProject ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <Globe className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">Please Select a Project</h2>
                <p className="text-muted-foreground">Select a project to manage its API Gateway settings.</p>
              </div>
            </div>
          ) : activeProject.id === 'system' ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <Globe className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">Not Available for System Project</h2>
                <p className="text-muted-foreground">API Gateway settings are configured per project. Select a project to manage its gateway.</p>
              </div>
            </div>
          ) : (
            <>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList>
                  <TabsTrigger value="routes">Routes</TabsTrigger>
                  <TabsTrigger value="realtime">Realtime</TabsTrigger>
                  <TabsTrigger value="authentication">Authentication</TabsTrigger>
                </TabsList>

                {/* Routes Tab */}
                <TabsContent value="routes" className="space-y-4 mt-4">
                  {!config.enabled && (
                    <Card>
                      <CardContent className="py-4 flex items-center gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">API Gateway is disabled</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Enable it via Configure to start routing requests to your functions.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setConfigModalOpen(true)}>
                          <Settings className="w-4 h-4 mr-2" />
                          Configure
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {config.enabled && (
                    <Card>
                      <CardContent className="pt-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                            <Globe className="w-5 h-5 text-primary" />
                            Routes
                            <span className="text-sm font-normal text-muted-foreground">({routes.length})</span>
                          </h2>
                          <div className="flex items-center gap-2">
                            {orderDirty ? (
                              <>
                                <Button variant="outline" size="sm" onClick={() => loadAll()} disabled={savingOrder}>
                                  <X className="w-4 h-4 mr-1" /> Discard
                                </Button>
                                <Button size="sm" onClick={handleSaveOrder} disabled={savingOrder}>
                                  {savingOrder ? <Loader className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                                  Save Order
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" onClick={() => { setEditingRoute({}); setModalOpen(true) }}>
                                <Plus className="w-4 h-4 mr-1" /> Add Route
                              </Button>
                            )}
                          </div>
                        </div>

                        {routes.length === 0 ? (
                          <div className="text-center py-12 text-muted-foreground">
                            <Globe className="w-10 h-10 mx-auto mb-3 opacity-40" />
                            <p className="text-sm">No routes configured yet.</p>
                            <p className="text-xs mt-1">Add a route to start routing external requests to your functions.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-border">
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              modifiers={[restrictToVerticalAxis]}
                              onDragEnd={handleDragEnd}
                            >
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-8" />
                                    <TableHead>Route Path</TableHead>
                                    <TableHead>Upstream Function</TableHead>
                                    <TableHead>Methods</TableHead>
                                    <TableHead>Auth</TableHead>
                                    <TableHead>CORS</TableHead>
                                    <TableHead>Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  <SortableContext items={routes.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                                    {routes.map((route) => (
                                      <SortableRouteRow
                                        key={route.id}
                                        route={route}
                                        onEdit={(r) => { setEditingRoute(r); setModalOpen(true) }}
                                        onDelete={(id) => setDeleteConfirmId(id)}
                                        gatewayDomain={gatewayFull}
                                        projectSlug={projectSlug}
                                        customDomain={customFull}
                                      />
                                    ))}
                                  </SortableContext>
                                </TableBody>
                              </Table>
                            </DndContext>
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                          Drag rows to reorder, then click <strong className="text-foreground">Save Order</strong> to apply. Routes are matched from top to bottom — first match wins.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Realtime Tab */}
                <TabsContent value="realtime" className="mt-4">
                  <Card>
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                          <Zap className="w-5 h-5 text-primary" />
                          Realtime Namespaces
                          <span className="text-sm font-normal text-muted-foreground">({realtimeNamespaces.length})</span>
                        </h2>
                        <Button size="sm" onClick={() => { setEditingNamespace({}); setNamespaceModalOpen(true) }}>
                          <Plus className="w-4 h-4 mr-1" /> Add Namespace
                        </Button>
                      </div>

                      {realtimeNamespaces.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Zap className="w-10 h-10 mx-auto mb-3 opacity-40" />
                          <p className="text-sm">No realtime namespaces configured yet.</p>
                          <p className="text-xs mt-1">Add a namespace to enable Socket.IO connections for this project.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Namespace Path</TableHead>
                                <TableHead>Event Handlers</TableHead>
                                <TableHead>Auth</TableHead>
                                <TableHead>Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {realtimeNamespaces.map((ns) => (
                                <RealtimeNamespaceRow
                                  key={ns.id}
                                  namespace={ns}
                                  onEdit={(ns) => { setEditingNamespace(ns); setNamespaceModalOpen(true) }}
                                  onDelete={setDeleteNamespaceId}
                                  gatewayDomain={gatewayFull}
                                  projectSlug={projectSlug}
                                  customDomain={customFull}
                                />
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Authentication Tab */}
                <TabsContent value="authentication" className="mt-4">
                  <Card>
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                          <KeyRound className="w-5 h-5 text-primary" />
                          Authentication Methods
                          <span className="text-sm font-normal text-muted-foreground">({authMethods.length})</span>
                        </h2>
                        <Button size="sm" onClick={() => { setEditingAuthMethod({}); setAuthMethodModalOpen(true) }}>
                          <Plus className="w-4 h-4 mr-1" /> Add Method
                        </Button>
                      </div>

                      {authMethods.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <KeyRound className="w-10 h-10 mx-auto mb-3 opacity-40" />
                          <p className="text-sm">No authentication methods configured.</p>
                          <p className="text-xs mt-1">Add a method and assign it to routes to secure your gateway endpoints.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {authMethods.map((m) => (
                            <div key={m.id} className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={cn('shrink-0 text-xs px-2 py-1 rounded font-mono', authTypeBadgeClass(m.type))}>
                                  {m.type === 'basic_auth' ? 'Basic Auth' : m.type === 'bearer_jwt' ? 'Bearer JWT' : m.type === 'middleware' ? 'Middleware' : 'API Key'}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {m.type === 'basic_auth' && `${m.config.credentials?.length ?? 0} credential(s)`}
                                    {m.type === 'bearer_jwt' && (m.config.jwtMode ? JWT_MODE_LABELS[m.config.jwtMode] ?? 'Bearer JWT' : 'Fixed secret')}
                                    {m.type === 'api_key' && `${m.config.apiKeys?.length ?? 0} key(s)`}
                                    {m.type === 'middleware' && (functions.find((f) => f.id === m.config.functionId)?.name || 'Function configured')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => { setEditingAuthMethod(m); setAuthMethodModalOpen(true) }}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400"
                                  onClick={() => setDeleteAuthMethodId(m.id)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground">
                        Auth methods are reusable. Assign them to routes in the{' '}
                        <button onClick={() => setActiveTab('routes')} className="text-primary hover:underline">Routes</button> tab.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        {/* Gateway Configuration Modal */}
        <Modal
          isOpen={configModalOpen}
          title="Gateway Configuration"
          onConfirm={handleSaveConfig}
          onCancel={() => setConfigModalOpen(false)}
          confirmText="Save Configuration"
          cancelText="Cancel"
          loading={savingConfig}
          size="md"
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Enable API Gateway</p>
                <p className="text-xs text-muted-foreground mt-0.5">When enabled, external requests are routed to your functions.</p>
              </div>
              <Switch checked={config.enabled} onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Custom Domain <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div className="flex rounded-md overflow-hidden border border-input focus-within:border-primary">
                <Select value={customDomainProtocol} onValueChange={(v) => setCustomDomainProtocol(v as any)}>
                  <SelectTrigger className="w-28 rounded-none border-0 border-r border-input bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="https">https://</SelectItem>
                    <SelectItem value="http">http://</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="text"
                  value={customDomainInput}
                  onChange={(e) => setCustomDomainInput(e.target.value)}
                  placeholder="api.mycompany.com"
                  className="flex-1 bg-transparent text-foreground text-sm px-3 py-2 focus:outline-none"
                />
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg p-4 space-y-2 border border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">URL Preview</p>
              {customUrl ? (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Custom domain</p>
                    <code className="text-xs text-green-300 font-mono">{customUrl}</code>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">No custom domain configured</p>
                </div>
              )}
              {defaultUrl ? (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Default gateway domain</p>
                    <code className="text-xs text-blue-300 font-mono">{defaultUrl}</code>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Configure a default gateway domain in{' '}
                    <a href="/admin/global-settings" className="text-primary hover:underline">Global Settings</a>{' '}
                    to enable the default URL pattern.
                  </p>
                </div>
              )}
            </div>
          </div>
        </Modal>

        <RouteEditorModal
          isOpen={modalOpen}
          route={editingRoute}
          functions={functions}
          authMethods={authMethods}
          gatewayDomain={gatewayFull}
          projectSlug={projectSlug}
          customDomain={customFull}
          onSave={handleSaveRoute}
          onClose={() => { setModalOpen(false); setEditingRoute(null) }}
        />

        <Modal
          isOpen={!!deleteConfirmId}
          title="Delete Route"
          description="Are you sure you want to delete this route? This action cannot be undone."
          onConfirm={() => { if (deleteConfirmId) handleDeleteRoute(deleteConfirmId) }}
          onCancel={() => setDeleteConfirmId(null)}
          confirmText="Delete"
          cancelText="Cancel"
          confirmVariant="danger"
        />

        <AuthMethodModal
          isOpen={authMethodModalOpen}
          method={editingAuthMethod}
          functions={functions}
          onSave={handleSaveAuthMethod}
          onClose={() => { setAuthMethodModalOpen(false); setEditingAuthMethod(null) }}
        />

        <Modal
          isOpen={!!deleteAuthMethodId}
          title="Delete Auth Method"
          description="Are you sure you want to delete this authentication method? Routes using it will become public."
          onConfirm={() => { if (deleteAuthMethodId) handleDeleteAuthMethod(deleteAuthMethodId) }}
          onCancel={() => setDeleteAuthMethodId(null)}
          confirmText="Delete"
          cancelText="Cancel"
          confirmVariant="danger"
        />

        <NamespaceEditorModal
          isOpen={namespaceModalOpen}
          namespace={editingNamespace}
          functions={functions}
          authMethods={authMethods}
          onSave={handleSaveNamespace}
          onClose={() => { setNamespaceModalOpen(false); setEditingNamespace(null) }}
          projectSlug={projectSlug}
          customDomain={customFull}
          gatewayDomain={gatewayFull}
        />

        <Modal
          isOpen={!!deleteNamespaceId}
          title="Delete Namespace"
          description="Are you sure you want to delete this namespace? All event handlers will also be removed."
          onConfirm={() => { if (deleteNamespaceId) handleDeleteNamespace(deleteNamespaceId) }}
          onCancel={() => setDeleteNamespaceId(null)}
          confirmText="Delete"
          cancelText="Cancel"
          confirmVariant="danger"
        />
      </Layout>
    </ProtectedRoute>
  )
}
