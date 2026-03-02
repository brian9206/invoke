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
} from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { useProject } from '@/contexts/ProjectContext'
import toast from 'react-hot-toast'
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
    // basic_auth
    credentials?: { username: string; password: string }[]
    realm?: string
    // bearer_jwt
    jwtMode?: 'fixed_secret' | 'microsoft' | 'google' | 'github' | 'jwks_endpoint' | 'oidc_discovery'
    jwtSecret?: string
    tenantId?: string
    jwksUrl?: string
    oidcUrl?: string
    audience?: string
    issuer?: string
    // api_key
    apiKeys?: string[]
    // middleware
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

const defaultRoute = (): Omit<GatewayRoute, 'id' | 'functionName' | 'createdAt' | 'updatedAt'> => ({
  routePath: '',
  functionId: null,
  allowedMethods: ['GET', 'POST'],
  sortOrder: 0,
  isActive: true,
  corsSettings: defaultCors(),
  authMethodIds: [],
  authMethodNames: [],
  authLogic: 'or',
})

// ─── Sortable Row Component ──────────────────────────────────────────────────

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: route.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-gray-700 hover:bg-gray-750">
      {/* Drag handle */}
      <td className="px-3 py-3 w-8">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 touch-none"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {customDomain ? (
            <a
              href={`${customDomain}${route.routePath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-400 font-mono hover:underline"
            >
              {route.routePath}
            </a>
          ) : gatewayDomain && projectSlug ? (
            <a
              href={`${gatewayDomain}/${projectSlug}${route.routePath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-400 font-mono hover:underline"
            >
              {route.routePath}
            </a>
          ) : (
            <code className="text-sm text-primary-400 font-mono">{route.routePath}</code>
          )}
          {!route.isActive && (
            <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">disabled</span>
          )}
        </div>
      </td>

      <td className="px-4 py-3 text-sm text-gray-300">
        {route.functionName ? (
          <span className="font-mono text-xs bg-gray-700 px-2 py-0.5 rounded">{route.functionName}</span>
        ) : (
          <span className="text-gray-500 italic text-xs">not configured</span>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {route.allowedMethods.map((m) => (
            <span key={m} className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700 px-1.5 py-0.5 rounded font-mono">
              {m}
            </span>
          ))}
        </div>
      </td>

      <td className="px-4 py-3 text-sm text-gray-400">
        {(!route.authMethodNames || route.authMethodNames.length === 0) ? (
          <span className="text-gray-500">—</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {route.authMethodNames.map((name) => (
              <span key={name} className="text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-700 px-1.5 py-0.5 rounded">
                {name}
              </span>
            ))}
            {route.authMethodNames.length > 1 && (
              <span className="text-xs text-gray-500 ml-1">
                ({route.authLogic === 'and' ? 'All match' : 'Any match'})
              </span>
            )}
          </div>
        )}
      </td>

      <td className="px-4 py-3 text-sm text-gray-400">
        {route.corsSettings.enabled
          ? <span className="text-green-400">Enabled</span>
          : <span className="text-gray-500">—</span>}
      </td>

      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(route)}
            className="text-gray-400 hover:text-primary-400 transition-colors"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(route.id)}
            className="text-gray-400 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
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
    <div className={`flex flex-wrap gap-1 p-2 bg-gray-800 border-2 border-gray-600 rounded-md ${disabled ? 'opacity-50' : ''}`}>
      {value.map((tag) => (
        <span key={tag} className="flex items-center gap-1 text-xs bg-gray-700 text-gray-200 px-2 py-0.5 rounded">
          {tag}
          {!disabled && (
            <button onClick={() => onChange(value.filter((t) => t !== tag))} className="text-gray-400 hover:text-red-400">
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          onBlur={add}
          placeholder={value.length === 0 ? placeholder : 'Add...'}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-gray-200 outline-none placeholder-gray-500"
        />
      )}
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
      setFunctionId(route.functionId || '')
      setAllowedMethods(route.allowedMethods || ['GET', 'POST'])
      setIsActive(route.isActive !== undefined ? route.isActive : true)
      setCors(route.corsSettings ? { ...route.corsSettings } : defaultCors())
      setSelectedAuthMethodIds(route.authMethodIds ? [...route.authMethodIds] : [])
      setAuthLogic(route.authLogic || 'or')
      setCorsOpen(route.corsSettings?.enabled || false)
    }
  }, [isOpen, route])

  const toggleMethod = (method: string) => {
    setAllowedMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    )
  }

  const handleSave = async () => {
    if (!routePath.trim()) {
      toast.error('Route path is required')
      return
    }
    if (!routePath.startsWith('/')) {
      toast.error('Route path must start with /')
      return
    }
    if (allowedMethods.length === 0) {
      toast.error('At least one HTTP method must be allowed')
      return
    }

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
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Route Path <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={routePath}
              onChange={(e) => setRoutePath(e.target.value)}
              placeholder="e.g. /users/:userId/books/:bookId"
              className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
            />
            <p className="mt-1 text-xs text-gray-500">
              Use <code className="bg-gray-700 px-1 rounded">:paramName</code> for dynamic segments.
              Parameters are forwarded as query string to the upstream function (e.g.{' '}
              <code className="bg-gray-700 px-1 rounded">?paramName=value</code>).
            </p>
            {(gatewayDomain || customDomain) && routePath && (
              <div className="mt-2 space-y-1">
                {gatewayDomain && projectSlug && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-500 shrink-0">Default:</span>
                    <a
                      href={`${gatewayDomain}/${projectSlug}${routePath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-primary-400 hover:text-primary-300 hover:underline truncate"
                    >
                      {`${gatewayDomain}/${projectSlug}${routePath}`}
                    </a>
                  </div>
                )}
                {customDomain && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-500 shrink-0">Custom:</span>
                    <a
                      href={`${customDomain}${routePath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-primary-400 hover:text-primary-300 hover:underline truncate"
                    >
                      {`${customDomain}${routePath}`}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Upstream Function */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Upstream Function</label>
            <select
              value={functionId}
              onChange={(e) => setFunctionId(e.target.value)}
              className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">— Select function —</option>
              {functions.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Allowed Methods */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Allowed HTTP Methods</label>
            <div className="flex flex-wrap gap-2">
              {HTTP_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => toggleMethod(method)}
                  className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
                    allowedMethods.includes(method)
                      ? 'bg-blue-900/70 border-blue-600 text-blue-200'
                      : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {/* Active Toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-300">Route is active</span>
            </label>
          </div>

          {/* CORS Settings */}
          <div className="border border-gray-700 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setCorsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-750 hover:bg-gray-700 text-sm font-medium text-gray-200"
            >
              <span className="flex items-center gap-2">
                {corsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                CORS Settings
              </span>
              {cors.enabled && <span className="text-xs text-green-400">Enabled</span>}
            </button>

            {corsOpen && (
              <div className="px-4 py-4 space-y-4 border-t border-gray-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cors.enabled}
                    onChange={(e) => setCors((c) => ({ ...c, enabled: e.target.checked }))}
                    className="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-300">Enable CORS</span>
                </label>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Allowed Origins <span className="text-gray-500">(press Enter to add)</span>
                  </label>
                  <TagInput
                    value={cors.allowedOrigins}
                    onChange={(v) => setCors((c) => ({ ...c, allowedOrigins: v }))}
                    placeholder="https://example.com or *"
                    disabled={!cors.enabled}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Allowed Headers</label>
                  <TagInput
                    value={cors.allowedHeaders}
                    onChange={(v) => setCors((c) => ({ ...c, allowedHeaders: v }))}
                    placeholder="Content-Type, Authorization"
                    disabled={!cors.enabled}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Expose Headers</label>
                  <TagInput
                    value={cors.exposeHeaders}
                    onChange={(v) => setCors((c) => ({ ...c, exposeHeaders: v }))}
                    placeholder="X-Request-Id"
                    disabled={!cors.enabled}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Max Age (seconds)</label>
                    <input
                      type="number"
                      value={cors.maxAge}
                      onChange={(e) => setCors((c) => ({ ...c, maxAge: parseInt(e.target.value) || 86400 }))}
                      disabled={!cors.enabled}
                      className="block w-full bg-gray-900 border-2 border-gray-600 rounded text-gray-100 text-sm px-3 py-1.5 disabled:opacity-50"
                    />
                  </div>

                  <div className="flex items-center mt-5">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={cors.allowCredentials}
                        onChange={(e) => setCors((c) => ({ ...c, allowCredentials: e.target.checked }))}
                        disabled={!cors.enabled}
                        className="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500 disabled:opacity-50"
                      />
                      <span className="text-sm text-gray-300">Allow Credentials</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Auth Methods */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Authentication</label>
            {authMethods.length === 0 ? (
              <div className="rounded-md border border-gray-700 bg-gray-800/50 px-4 py-3 text-xs text-gray-500">
                No authentication methods configured. Add methods in the{' '}
                <span className="text-primary-400">Authentication</span> tab.
              </div>
            ) : (
              <div className="space-y-2">
                {/* Selected methods – DnD sortable execution order */}
                {selectedAuthMethodIds.length === 0 ? (
                  <div className="rounded-md border border-dashed border-gray-600 bg-gray-800/30 px-4 py-3 text-xs text-gray-500 text-center">
                    No auth <span className="text-gray-400 font-medium">(public)</span> — add a method below to require authentication
                  </div>
                ) : (
                  <div className="rounded-md border border-gray-700 bg-gray-800/50 p-3 space-y-1.5">
                    {selectedAuthMethodIds.length > 1 && (
                      <p className="text-xs text-gray-500 pb-1">Drag to set execution order</p>
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

                {/* Available (unselected) methods */}
                {authMethods.some((m) => !selectedAuthMethodIds.includes(m.id)) && (
                  <div className="rounded-md border border-gray-700 bg-gray-800/30 p-3 space-y-1">
                    <p className="text-xs text-gray-500 pb-0.5">Add method</p>
                    {authMethods
                      .filter((m) => !selectedAuthMethodIds.includes(m.id))
                      .map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedAuthMethodIds((prev) => [...prev, m.id])}
                          className="w-full flex items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-700/50 text-left"
                        >
                          <Plus className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          <span className="flex-1 text-sm text-gray-300">{m.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${
                            m.type === 'basic_auth' ? 'bg-blue-900/40 text-blue-300 border-blue-700' :
                            m.type === 'bearer_jwt' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700' :
                            m.type === 'middleware' ? 'bg-purple-900/40 text-purple-300 border-purple-700' :
                            'bg-green-900/40 text-green-300 border-green-700'
                          }`}>
                            {m.type === 'basic_auth' ? 'Basic' : m.type === 'bearer_jwt' ? (jwtModeShortLabel(m.config?.jwtMode) ? `JWT · ${jwtModeShortLabel(m.config?.jwtMode)}` : 'JWT') : m.type === 'middleware' ? 'Middleware' : 'API Key'}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            {selectedAuthMethodIds.length > 1 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-400">Logic:</span>
                <div className="flex rounded-md overflow-hidden border border-gray-600 text-xs">
                  <button
                    type="button"
                    onClick={() => setAuthLogic('or')}
                    className={`px-3 py-1 transition-colors ${
                      authLogic === 'or'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Any match
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthLogic('and')}
                    className={`px-3 py-1 transition-colors border-l border-gray-600 ${
                      authLogic === 'and'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    All match
                  </button>
                </div>
                <span className="text-xs text-gray-500">
                  {authLogic === 'or' ? 'Access granted if any method passes' : 'All methods must pass'}
                </span>
              </div>
            )}
          </div>
      </div>
    </Modal>
  )
}

// ─── JWT mode helpers ────────────────────────────────────────────────────────

const JWT_MODE_LABELS: Record<string, string> = {
  microsoft:      'Microsoft (Entra ID / Azure AD)',
  google:         'Google',
  github:         'GitHub',
  jwks_endpoint:  'Custom (JWKS Endpoint)',
  oidc_discovery: 'Custom (OIDC Discovery)',
  fixed_secret:   'Custom (Fixed Secret)',
}

function jwtModeShortLabel(mode?: string): string | null {
  switch (mode) {
    case 'microsoft':      return 'MS'
    case 'google':         return 'Google'
    case 'github':         return 'GitHub'
    case 'jwks_endpoint':  return 'JWKS'
    case 'oidc_discovery': return 'OIDC'
    default:               return null // fixed_secret or missing → just 'JWT'
  }
}

// ─── Sortable Auth Method Item (inside RouteEditorModal) ─────────────────────

function SortableAuthMethodItem({
  method,
  showHandle,
  onRemove,
}: {
  method: AuthMethod
  showHandle: boolean
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: method.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const typeColors =
    method.type === 'basic_auth' ? 'bg-blue-900/40 text-blue-300 border-blue-700' :
    method.type === 'bearer_jwt' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700' :
    method.type === 'middleware' ? 'bg-purple-900/40 text-purple-300 border-purple-700' :
    'bg-green-900/40 text-green-300 border-green-700'
  const jwtSub = method.type === 'bearer_jwt' ? jwtModeShortLabel(method.config?.jwtMode) : null
  const typeLabel =
    method.type === 'basic_auth' ? 'Basic' :
    method.type === 'bearer_jwt' ? (jwtSub ? `JWT · ${jwtSub}` : 'JWT') :
    method.type === 'middleware' ? 'Middleware' : 'API Key'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded px-2 py-1.5 bg-gray-700/60 border border-gray-600"
    >
      {showHandle ? (
        <button
          type="button"
          className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      ) : (
        <span className="w-3.5 h-3.5 flex-shrink-0" />
      )}
      <span className="flex-1 text-sm text-gray-200">{method.name}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${typeColors}`}>{typeLabel}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-gray-500 hover:text-red-400 flex-shrink-0 ml-1"
        title="Remove"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Auth Method Modal ────────────────────────────────────────────────────────

const AUTH_TYPE_LABELS: Record<string, string> = {
  basic_auth: 'Basic Auth',
  bearer_jwt: 'Bearer JWT',
  api_key: 'API Key',
  middleware: 'Middleware',
}

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
  // bearer_jwt
  const [jwtMode, setJwtMode] = useState('fixed_secret')
  const [jwtSecret, setJwtSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [tenantId, setTenantId] = useState('')
  const [jwksUrl, setJwksUrl] = useState('')
  const [oidcUrl, setOidcUrl] = useState('')
  const [audience, setAudience] = useState('')
  const [issuer, setIssuer] = useState('')
  // api_key
  const [apiKeys, setApiKeys] = useState<string[]>([])
  // basic_auth
  const [credentials, setCredentials] = useState<{ username: string; password: string }[]>([])
  const [realm, setRealm] = useState('')
  // middleware
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

  const addCredential = () => setCredentials((c) => [...c, { username: '', password: '' }])
  const removeCredential = (i: number) => setCredentials((c) => c.filter((_, idx) => idx !== i))
  const updateCredential = (i: number, field: 'username' | 'password', val: string) =>
    setCredentials((c) => c.map((cred, idx) => idx === i ? { ...cred, [field]: val } : cred))

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
      if (jwtMode === 'microsoft' && !tenantId.trim()) { toast.error('Tenant ID is required for Microsoft mode'); return }
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
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Name <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Admin JWT, Public API Key"
            className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            disabled={!!method?.id}
            className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-60"
          >
            <option value="bearer_jwt">Bearer JWT</option>
            <option value="api_key">API Key</option>
            <option value="basic_auth">Basic Auth</option>
            <option value="middleware">Middleware</option>
          </select>
          {method?.id && <p className="mt-1 text-xs text-gray-500">Type cannot be changed after creation.</p>}
        </div>

        {/* Bearer JWT config */}
        {type === 'bearer_jwt' && (
          <div className="space-y-4">
            {/* JWT Mode selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">JWT Mode</label>
              <select
                value={jwtMode}
                onChange={(e) => setJwtMode(e.target.value)}
                className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {Object.entries(JWT_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Microsoft: Tenant ID */}
            {jwtMode === 'microsoft' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tenant ID <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 font-mono focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Found in Azure Portal → App registrations → Directory (tenant) ID.
                </p>
              </div>
            )}

            {/* Google: no additional fields */}
            {jwtMode === 'google' && (
              <p className="text-xs text-gray-500 rounded-md bg-gray-900 border border-gray-700 px-3 py-2">
                Validates tokens signed by Google's public keys (e.g. Google Sign-In, Google Workspace).
                No additional configuration required.
              </p>
            )}

            {/* GitHub: no additional fields */}
            {jwtMode === 'github' && (
              <p className="text-xs text-gray-500 rounded-md bg-gray-900 border border-gray-700 px-3 py-2">
                Validates GitHub Actions OIDC tokens issued by{' '}
                <code className="bg-gray-700 px-1 rounded">token.actions.githubusercontent.com</code>.
                No additional configuration required.
              </p>
            )}

            {/* Custom JWKS Endpoint */}
            {jwtMode === 'jwks_endpoint' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">JWKS URL <span className="text-red-400">*</span></label>
                <input
                  type="url"
                  value={jwksUrl}
                  onChange={(e) => setJwksUrl(e.target.value)}
                  placeholder="https://example.com/.well-known/jwks.json"
                  className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 font-mono focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  URL to a JSON Web Key Set (JWKS) document containing public keys.
                </p>
              </div>
            )}

            {/* Custom OIDC Discovery */}
            {jwtMode === 'oidc_discovery' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">OIDC Discovery URL <span className="text-red-400">*</span></label>
                <input
                  type="url"
                  value={oidcUrl}
                  onChange={(e) => setOidcUrl(e.target.value)}
                  placeholder="https://example.com/.well-known/openid-configuration"
                  className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 font-mono focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  URL to an OpenID Connect discovery document. The JWKS URI is extracted automatically.
                </p>
              </div>
            )}

            {/* Fixed secret (HMAC) */}
            {jwtMode === 'fixed_secret' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">JWT Secret <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={jwtSecret}
                    onChange={(e) => setJwtSecret(e.target.value)}
                    placeholder="Enter HMAC signing secret"
                    className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 pr-10 font-mono focus:ring-primary-500 focus:border-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Tokens signed with this HMAC secret are accepted. Expired tokens are always rejected.
                </p>
              </div>
            )}

            {/* Optional claim validation — all modes */}
            <div className="space-y-3 pt-1 border-t border-gray-700">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide pt-1">Claim Validation <span className="font-normal normal-case">(optional)</span></p>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Audience (aud)</label>
                <input
                  type="text"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="https://api.myapp.com"
                  className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  If set, rejects tokens where <code className="bg-gray-700 px-1 rounded">aud</code> does not match.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Issuer (iss)</label>
                <input
                  type="text"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  placeholder={
                    jwtMode === 'microsoft' ? 'https://login.microsoftonline.com/{tenantId}/v2.0' :
                    jwtMode === 'google'    ? 'https://accounts.google.com' :
                    jwtMode === 'github'    ? 'https://token.actions.githubusercontent.com' :
                    'https://issuer.example.com'
                  }
                  className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  If set, rejects tokens where <code className="bg-gray-700 px-1 rounded">iss</code> does not match.
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Tokens sent as <code className="bg-gray-700 px-1 rounded">Authorization: Bearer &lt;token&gt;</code> are validated.
              Expired tokens are always rejected.
            </p>
          </div>
        )}

        {/* API Key config */}
        {type === 'api_key' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              API Keys <span className="text-gray-500">(press Enter to add)</span>
            </label>
            <TagInput value={apiKeys} onChange={setApiKeys} placeholder="Paste or type key" />
            <p className="mt-1 text-xs text-gray-500">
              Keys are accepted via <code className="bg-gray-700 px-1 rounded">x-api-key</code> header or{' '}
              <code className="bg-gray-700 px-1 rounded">Authorization: Bearer &lt;key&gt;</code>.
            </p>
          </div>
        )}

        {/* Basic Auth config */}
        {type === 'basic_auth' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">Credentials</label>
              <button type="button" onClick={addCredential} className="btn-secondary text-xs px-2 py-1 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {credentials.length === 0 && (
              <p className="text-xs text-gray-500 mb-2">No credentials added yet.</p>
            )}
            <div className="space-y-2">
              {credentials.map((cred, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={cred.username}
                    onChange={(e) => updateCredential(i, 'username', e.target.value)}
                    placeholder="Username"
                    className="flex-1 bg-gray-900 border-2 border-gray-600 rounded text-gray-100 text-sm px-3 py-1.5 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <input
                    type="password"
                    value={cred.password}
                    onChange={(e) => updateCredential(i, 'password', e.target.value)}
                    placeholder="Password"
                    className="flex-1 bg-gray-900 border-2 border-gray-600 rounded text-gray-100 text-sm px-3 py-1.5 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <button type="button" onClick={() => removeCredential(i)} className="text-gray-500 hover:text-red-400 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Sent as <code className="bg-gray-700 px-1 rounded">Authorization: Basic &lt;base64(user:pass)&gt;</code>.
            </p>
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-300 mb-1">Realm <span className="text-gray-500 font-normal">(optional)</span></label>
              <input
                type="text"
                value={realm}
                onChange={(e) => setRealm(e.target.value)}
                placeholder="e.g. Admin Area"
                className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                If set, unauthenticated responses include <code className="bg-gray-700 px-1 rounded">WWW-Authenticate: Basic realm="…"</code>.
              </p>
            </div>
          </div>
        )}
        {/* Middleware config */}
        {type === 'middleware' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Function <span className="text-red-400">*</span>
            </label>
            {functions.length === 0 ? (
              <p className="text-xs text-gray-500">No functions deployed in this project.</p>
            ) : (
              <select
                value={middlewareFunctionId}
                onChange={(e) => setMiddlewareFunctionId(e.target.value)}
                className="block w-full bg-gray-900 border-2 border-gray-600 rounded-md text-gray-100 text-sm px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select a function…</option>
                {functions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-gray-500">
              The function receives <code className="bg-gray-700 px-1 rounded">{'{ path, query, headers }'}</code> and must return{' '}
              <code className="bg-gray-700 px-1 rounded">{'{"allow": true}'}</code> to grant access.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApiGatewayPage() {
  const { activeProject } = useProject()

  const [activeTab, setActiveTab] = useState<'routes' | 'authentication'>('routes')

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Load data when project changes
  useEffect(() => {
    if (activeProject?.id) {
      setActiveTab('routes')
      setOrderDirty(false)
      loadAll()
    }
  }, [activeProject?.id])

  const loadAll = async () => {
    if (!activeProject?.id) return
    setLoadingConfig(true)
    try {
      const [cfgRes, routesRes, funcsRes, gsRes, authRes] = await Promise.all([
        authenticatedFetch(`/api/gateway/config?projectId=${activeProject.id}`),
        authenticatedFetch(`/api/gateway/routes?projectId=${activeProject.id}`),
        authenticatedFetch(`/api/functions?projectId=${activeProject.id}`),
        authenticatedFetch('/api/admin/global-settings'),
        authenticatedFetch(`/api/gateway/auth-methods?projectId=${activeProject.id}`),
      ])

      if (cfgRes.ok) {
        const d = await cfgRes.json()
        setConfig(d.data)
        const { protocol, host } = parseUrlField(d.data.customDomain || '')
        setCustomDomainProtocol(protocol)
        setCustomDomainInput(host)
      }
      if (routesRes.ok) {
        const d = await routesRes.json()
        setRoutes(d.data || [])
        setOrderDirty(false)
      }
      if (funcsRes.ok) {
        const d = await funcsRes.json()
        setFunctions((d.data || []).map((f: any) => ({ id: f.id, name: f.name })))
      }
      if (gsRes.ok) {
        const d = await gsRes.json()
        setGatewayDomain(d.data?.api_gateway_domain?.value || '')
      }
      if (authRes.ok) {
        const d = await authRes.json()
        setAuthMethods(d.data || [])
      }
    } catch (err) {
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
        body: JSON.stringify({ enabled: config.enabled, customDomain: customDomainInput ? `${customDomainProtocol}://${customDomainInput}` : null }),

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

  const handleAddRoute = () => {
    setEditingRoute({})
    setModalOpen(true)
  }

  const handleEditRoute = (route: GatewayRoute) => {
    setEditingRoute(route)
    setModalOpen(true)
  }

  const handleSaveRoute = async (data: any) => {
    if (!activeProject?.id) return

    if (editingRoute?.id) {
      // Update existing route
      const res = await authenticatedFetch(
        `/api/gateway/routes/${editingRoute.id}?projectId=${activeProject.id}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      )
      const body = await res.json()
      if (!res.ok) { toast.error(body.message || 'Failed to update route'); throw new Error(body.message) }
      toast.success('Route updated')
    } else {
      // Create new route
      const res = await authenticatedFetch(
        `/api/gateway/routes?projectId=${activeProject.id}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      )
      const body = await res.json()
      if (!res.ok) { toast.error(body.message || 'Failed to create route'); throw new Error(body.message) }
      toast.success('Route created')
    }

    await loadAll()
  }

  const handleDeleteRoute = async (id: string) => {
    if (!activeProject?.id) return
    const res = await authenticatedFetch(
      `/api/gateway/routes/${id}?projectId=${activeProject.id}`,
      { method: 'DELETE' }
    )
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
      const res = await authenticatedFetch(
        `/api/gateway/routes/reorder?projectId=${activeProject.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: routes.map((r) => ({ id: r.id, sortOrder: r.sortOrder })) }),
        }
      )
      if (res.ok) {
        toast.success('Route order saved')
        setOrderDirty(false)
      } else {
        toast.error('Failed to save route order')
      }
    } catch {
      toast.error('Failed to save route order')
    } finally {
      setSavingOrder(false)
    }
  }

  const handleDiscardOrder = async () => {
    await loadAll()
  }

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = routes.findIndex((r) => r.id === active.id)
      const newIndex = routes.findIndex((r) => r.id === over.id)
      const reordered = arrayMove(routes, oldIndex, newIndex)

      // Assign new sort orders
      const withOrder = reordered.map((r, i) => ({ ...r, sortOrder: i }))
      setRoutes(withOrder)
      setOrderDirty(true)
    },
    [routes]
  )

  const projectSlug = activeProject?.slug || activeProject?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  const handleSaveAuthMethod = async (data: { name: string; type: string; config: any }) => {
    if (!activeProject?.id) return
    if (editingAuthMethod?.id) {
      const res = await authenticatedFetch(
        `/api/gateway/auth-methods/${editingAuthMethod.id}?projectId=${activeProject.id}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      )
      const body = await res.json()
      if (!res.ok) { toast.error(body.message || 'Failed to update auth method'); throw new Error(body.message) }
      toast.success('Auth method updated')
    } else {
      const res = await authenticatedFetch(
        `/api/gateway/auth-methods?projectId=${activeProject.id}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      )
      const body = await res.json()
      if (!res.ok) { toast.error(body.message || 'Failed to create auth method'); throw new Error(body.message) }
      toast.success('Auth method created')
    }
    await loadAll()
  }

  const handleDeleteAuthMethod = async (id: string) => {
    if (!activeProject?.id) return
    const res = await authenticatedFetch(
      `/api/gateway/auth-methods/${id}?projectId=${activeProject.id}`,
      { method: 'DELETE' }
    )
    if (res.ok) {
      toast.success('Auth method deleted')
      setAuthMethods((prev) => prev.filter((m) => m.id !== id))
    } else {
      toast.error('Failed to delete auth method')
    }
    setDeleteAuthMethodId(null)
  }

  // Normalise stored values: ensure they carry a protocol
  const gatewayFull = gatewayDomain
    ? (gatewayDomain.startsWith('http') ? gatewayDomain : `https://${gatewayDomain}`)
    : ''
  const customFull = customDomainInput
    ? `${customDomainProtocol}://${customDomainInput}`
    : config.customDomain && config.customDomain.startsWith('http')
      ? config.customDomain
      : null

  const defaultUrl = gatewayFull && projectSlug && activeProject?.id !== 'system'
    ? `${gatewayFull}/${projectSlug}/<route>`
    : null

  const customUrl = customFull ? `${customFull}/<route>` : null

  return (
    <ProtectedRoute>
      <Layout title="API Gateway">
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <PageHeader
              title="API Gateway"
              subtitle="Configure per-project HTTP routing to invoke functions via custom or default domains"
              icon={<Globe className="w-8 h-8 text-primary-500" />}
            />
            {activeProject && activeProject.id !== 'system' && !loadingConfig && (
              <button
                onClick={() => setConfigModalOpen(true)}
                className="btn-secondary flex items-center gap-2 shrink-0 mt-1"
              >
                <Settings className="w-4 h-4" />
                Configure
              </button>
            )}
          </div>

          {loadingConfig ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center gap-2 text-gray-400">
                <Loader className="w-5 h-5 text-primary-500 animate-spin" />
                <span className="animate-pulse">Loading...</span>
              </div>
            </div>
          ) : !activeProject ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <Globe className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-300 mb-2">Please Select a Project</h2>
                <p className="text-gray-400">Select a project to manage its API Gateway settings.</p>
              </div>
            </div>
          ) : activeProject.id === 'system' ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <Globe className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-300 mb-2">Not Available for System Project</h2>
                <p className="text-gray-400">API Gateway settings are configured per project. Select a project to manage its gateway.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Tab bar */}
              <div className="border-b border-gray-700">
                <nav className="flex gap-1 -mb-px">
                  {([
                    { id: 'routes', label: 'Routes', icon: <Globe className="w-4 h-4" /> },
                    { id: 'authentication', label: 'Authentication', icon: <KeyRound className="w-4 h-4" /> },
                  ] as const).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? 'border-primary-500 text-primary-400'
                          : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                      {tab.id === 'authentication' && authMethods.length > 0 && (
                        <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full">
                          {authMethods.length}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
              </div>

              {/* ── Routes tab ── */}
              {activeTab === 'routes' && (
                <>
                  {/* Disabled notice */}
                  {!config.enabled && (
                    <div className="card flex items-center gap-4 py-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-200">API Gateway is disabled</p>
                        <p className="text-xs text-gray-500 mt-0.5">Enable it via Configure to start routing requests to your functions.</p>
                      </div>
                      <button
                        onClick={() => setConfigModalOpen(true)}
                        className="btn-secondary flex items-center gap-2 text-sm shrink-0"
                      >
                        <Settings className="w-4 h-4" />
                        Configure
                      </button>
                    </div>
                  )}

                  {/* Routes Table */}
                  {config.enabled && (
                    <div className="card space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                          <Globe className="w-5 h-5 text-primary-500" />
                          Routes
                          <span className="text-sm font-normal text-gray-400">({routes.length})</span>
                        </h2>
                        <div className="flex items-center gap-2">
                          {orderDirty ? (
                            <>
                              <button onClick={handleDiscardOrder} disabled={savingOrder} className="btn-secondary flex items-center gap-2 text-sm">
                                <X className="w-4 h-4" />
                                Discard
                              </button>
                              <button onClick={handleSaveOrder} disabled={savingOrder} className="btn-primary flex items-center gap-2 text-sm">
                                {savingOrder ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Order
                              </button>
                            </>
                          ) : (
                            <button onClick={handleAddRoute} className="btn-primary flex items-center gap-2 text-sm">
                              <Plus className="w-4 h-4" />
                              Add Route
                            </button>
                          )}
                        </div>
                      </div>

                      {routes.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                          <Globe className="w-10 h-10 mx-auto mb-3 opacity-40" />
                          <p className="text-sm">No routes configured yet.</p>
                          <p className="text-xs mt-1">Add a route to start routing external requests to your functions.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-700">
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            modifiers={[restrictToVerticalAxis]}
                            onDragEnd={handleDragEnd}
                          >
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-750 border-b border-gray-700 text-xs text-gray-400 uppercase tracking-wider">
                                  <th className="w-8 px-3 py-3" />
                                  <th className="px-4 py-3 text-left">Route Path</th>
                                  <th className="px-4 py-3 text-left">Upstream Function</th>
                                  <th className="px-4 py-3 text-left">Methods</th>
                                  <th className="px-4 py-3 text-left">Auth</th>
                                  <th className="px-4 py-3 text-left">CORS</th>
                                  <th className="px-4 py-3 text-left">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                <SortableContext
                                  items={routes.map((r) => r.id)}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {routes.map((route) => (
                                    <SortableRouteRow
                                      key={route.id}
                                      route={route}
                                      onEdit={handleEditRoute}
                                      onDelete={(id) => setDeleteConfirmId(id)}
                                      gatewayDomain={gatewayFull}
                                      projectSlug={projectSlug}
                                      customDomain={customFull}
                                    />
                                  ))}
                                </SortableContext>
                              </tbody>
                            </table>
                          </DndContext>
                        </div>
                      )}

                      <p className="text-xs text-gray-500">
                        Drag rows to reorder, then click <strong className="text-gray-400">Save Order</strong> to apply. Routes are matched from top to bottom — first match wins.
                        Use specific routes (e.g. <code className="bg-gray-700 px-1 rounded">/users/me</code>) above
                        parameterized ones (e.g. <code className="bg-gray-700 px-1 rounded">/users/:id</code>).
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* ── Authentication tab ── */}
              {activeTab === 'authentication' && (
                <div className="card space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                      <KeyRound className="w-5 h-5 text-primary-500" />
                      Authentication Methods
                      <span className="text-sm font-normal text-gray-400">({authMethods.length})</span>
                    </h2>
                    <button
                      onClick={() => { setEditingAuthMethod({}); setAuthMethodModalOpen(true) }}
                      className="btn-primary flex items-center gap-2 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add Method
                    </button>
                  </div>

                  {authMethods.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <KeyRound className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">No authentication methods configured.</p>
                      <p className="text-xs mt-1">Add a method and assign it to routes to secure your gateway endpoints.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {authMethods.map((m) => (
                        <div key={m.id} className="flex items-start justify-between gap-4 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`shrink-0 text-xs px-2 py-1 rounded border font-mono ${
                              m.type === 'basic_auth' ? 'bg-blue-900/40 text-blue-300 border-blue-700' :
                              m.type === 'bearer_jwt' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700' :
                              m.type === 'middleware' ? 'bg-purple-900/40 text-purple-300 border-purple-700' :
                              'bg-green-900/40 text-green-300 border-green-700'
                            }`}>
                              {m.type === 'basic_auth' ? 'Basic Auth' :
                               m.type === 'bearer_jwt' ? 'Bearer JWT' :
                               m.type === 'middleware' ? 'Middleware' : 'API Key'}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-100 truncate">{m.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {m.type === 'basic_auth' && `${m.config.credentials?.length ?? 0} credential${(m.config.credentials?.length ?? 0) !== 1 ? 's' : ''}`}
                                {m.type === 'bearer_jwt' && (m.config.jwtMode ? JWT_MODE_LABELS[m.config.jwtMode] ?? 'Bearer JWT' : 'Fixed secret')}
                                {m.type === 'api_key' && `${m.config.apiKeys?.length ?? 0} key${(m.config.apiKeys?.length ?? 0) !== 1 ? 's' : ''}`}
                                {m.type === 'middleware' && (functions.find((f) => f.id === m.config.functionId)?.name || 'Function configured')}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => { setEditingAuthMethod(m); setAuthMethodModalOpen(true) }}
                              className="text-gray-400 hover:text-primary-400 transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteAuthMethodId(m.id)}
                              className="text-gray-400 hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-gray-500">
                    Auth methods are reusable. Assign them to routes in the <button onClick={() => setActiveTab('routes')} className="text-primary-400 hover:underline">Routes</button> tab.
                    A route with multiple methods allows access if <em>any</em> method validates successfully.
                  </p>
                </div>
              )}
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
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-200">Enable API Gateway</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  When enabled, external requests are routed to your functions via the gateway.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.enabled}
                onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
                className={`relative inline-flex h-6 min-w-11 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  config.enabled ? 'bg-primary-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Custom Domain */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Custom Domain <span className="text-gray-500">(optional)</span>
              </label>
              <div className="flex rounded-md overflow-hidden border-2 border-gray-600 focus-within:border-primary-500 bg-gray-800">
                <select
                  value={customDomainProtocol}
                  onChange={(e) => setCustomDomainProtocol(e.target.value as 'http' | 'https')}
                  className="bg-gray-700 text-gray-300 text-sm px-2 py-2 border-r border-gray-600 focus:outline-none shrink-0"
                >
                  <option value="https">https://</option>
                  <option value="http">http://</option>
                </select>
                <input
                  type="text"
                  value={customDomainInput}
                  onChange={(e) => setCustomDomainInput(e.target.value)}
                  placeholder="api.mycompany.com"
                  className="flex-1 bg-transparent text-gray-100 text-sm px-3 py-2 focus:outline-none"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Point this domain to the gateway service. Must be unique across all projects.
                {gatewayDomain && (() => {
                  const cnameTarget = gatewayDomain.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
                  return (
                    <>
                      {' '}Add a <span className="text-gray-300 font-medium">CNAME</span> record pointing to{' '}
                      <code className="bg-gray-700 text-primary-300 px-1 py-0.5 rounded">{cnameTarget}</code>.
                    </>
                  )
                })()}
              </p>
            </div>

            {/* URL Preview */}
            <div className="bg-gray-900 rounded-lg p-4 space-y-2 border border-gray-700">
              <p className="text-xs font-medium text-gray-400 mb-2">URL Preview</p>
              {customUrl ? (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Custom domain</p>
                    <code className="text-xs text-green-300 font-mono">{customUrl}</code>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-500">No custom domain configured</p>
                </div>
              )}
              {defaultUrl ? (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Default gateway domain</p>
                    <code className="text-xs text-blue-300 font-mono">{defaultUrl}</code>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-500">
                    Configure a default gateway domain in{' '}
                    <a href="/admin/global-settings" className="text-primary-400 hover:underline">
                      Global Settings
                    </a>{' '}
                    to enable the default URL pattern.
                  </p>
                </div>
              )}
            </div>
          </div>
        </Modal>

        {/* Route Editor Modal */}
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

        {/* Delete Confirmation */}
        <Modal
          isOpen={!!deleteConfirmId}
          title="Delete Route"
          description="Are you sure you want to delete this route? This action cannot be undone."
          onConfirm={() => deleteConfirmId && handleDeleteRoute(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
          confirmText="Delete"
          cancelText="Cancel"
          confirmVariant="danger"
        />

        {/* Auth Method Modal */}
        <AuthMethodModal
          isOpen={authMethodModalOpen}
          method={editingAuthMethod}
          functions={functions}
          onSave={handleSaveAuthMethod}
          onClose={() => { setAuthMethodModalOpen(false); setEditingAuthMethod(null) }}
        />

        {/* Delete Auth Method Confirmation */}
        <Modal
          isOpen={!!deleteAuthMethodId}
          title="Delete Auth Method"
          description="Are you sure you want to delete this authentication method? Routes using it will become public."
          onConfirm={() => deleteAuthMethodId && handleDeleteAuthMethod(deleteAuthMethodId)}
          onCancel={() => setDeleteAuthMethodId(null)}
          confirmText="Delete"
          cancelText="Cancel"
          confirmVariant="danger"
        />
      </Layout>
    </ProtectedRoute>
  )
}
