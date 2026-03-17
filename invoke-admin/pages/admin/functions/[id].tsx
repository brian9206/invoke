import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import { useProject } from '@/contexts/ProjectContext'
import {
  Package, Edit, Save, X, Copy, Check, Key, RefreshCw, Activity,
  Calendar, Clock, AlertCircle, Filter, ChevronLeft, ChevronRight,
  Upload, Code2, ChevronDown, MoreVertical, Trash2, History, Timer,
  Settings, Plus, Minus, Loader
} from 'lucide-react'
import { getFunctionUrl, authenticatedFetch } from '@/lib/frontend-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'

interface FunctionItem {
  id: string
  name: string
  description: string
  active_version: number | null
  file_size: number
  is_active: boolean
  created_at: string
  last_executed: string | null
  execution_count: number
  requires_api_key: boolean
  active_version_id?: string
  api_key?: string
  project_id: string
  project_name: string
}

interface ExecutionLog {
  id: number
  status_code: number
  execution_time_ms: number
  request_size: number
  response_size: number
  error_message?: string
  client_ip: string
  user_agent: string
  executed_at: string
}

interface LogsPaginationInfo {
  currentPage: number
  totalPages: number
  totalCount: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

interface EnvironmentVariable {
  id?: number
  variable_name: string
  variable_value: string
  description?: string
  created_at?: string
  updated_at?: string
}

export default function FunctionDetails() {
  const router = useRouter()
  const { id } = router.query
  const { lockProject, unlockProject } = useProject()
  const hasLockedProject = useRef(false)
  const [dialogState, setDialogState] = useState<{ type: 'alert' | 'confirm' | null; title: string; message: string; onConfirm?: () => void }>({ type: null, title: '', message: '' })

  const [functionData, setFunctionData] = useState<FunctionItem | null>(null)
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([])
  const [functionUrl, setFunctionUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({
    name: '', description: '', requires_api_key: false, retention_enabled: false,
    retention_type: 'time', retention_value: 7, schedule_enabled: false, schedule_cron: ''
  })
  const [saving, setSaving] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [regeneratingKey, setRegeneratingKey] = useState(false)

  const [retentionSettings, setRetentionSettings] = useState({ retention_type: null as any, retention_value: null as any, retention_enabled: false })
  const [retentionLoading, setRetentionLoading] = useState(false)
  const [retentionSaving, setRetentionSaving] = useState(false)

  const [scheduleSettings, setScheduleSettings] = useState({ schedule_enabled: false, schedule_cron: '', next_execution: null as any, last_scheduled_execution: null as any })
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)

  const [logsPagination, setLogsPagination] = useState<LogsPaginationInfo>({ currentPage: 1, totalPages: 1, totalCount: 0, limit: 10, hasNextPage: false, hasPrevPage: false })
  const [logsCurrentPage, setLogsCurrentPage] = useState(1)
  const [logsPageSize, setLogsPageSize] = useState(10)
  const [logsFilter, setLogsFilter] = useState<'all' | 'success' | 'error'>('all')

  const [gatewayRoutes, setGatewayRoutes] = useState<{ id: string; routePath: string; isActive: boolean }[]>([])
  const [gatewayDomain, setGatewayDomain] = useState<string>('')
  const [gatewayCustomDomain, setGatewayCustomDomain] = useState<string>('')

  const [environmentVariables, setEnvironmentVariables] = useState<EnvironmentVariable[]>([])
  const [envVarsLoading, setEnvVarsLoading] = useState(false)
  const [envVarsSaving, setEnvVarsSaving] = useState(false)
  const [editingEnvVars, setEditingEnvVars] = useState(false)
  const [tempEnvVars, setTempEnvVars] = useState<EnvironmentVariable[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  useEffect(() => {
    if (functionData?.project_id && functionData?.project_name && !hasLockedProject.current) {
      hasLockedProject.current = true
      lockProject({ id: functionData.project_id, name: functionData.project_name, description: '', role: 'locked' })
    }
    return () => { if (hasLockedProject.current) { hasLockedProject.current = false; unlockProject() } }
  }, [functionData?.project_id, functionData?.project_name])

  useEffect(() => { if (functionData?.id) getFunctionUrl(functionData.id).then(setFunctionUrl) }, [functionData?.id])

  useEffect(() => {
    if (!functionData?.project_id || !functionData?.id) return
    const fetchGatewayRoutes = async () => {
      try {
        const [settingsRes, routesRes, configRes] = await Promise.all([
          authenticatedFetch('/api/admin/global-settings'),
          authenticatedFetch(`/api/gateway/routes?projectId=${functionData.project_id}`),
          authenticatedFetch(`/api/gateway/config?projectId=${functionData.project_id}`),
        ])
        const [settingsData, routesData, configData] = await Promise.all([settingsRes.json(), routesRes.json(), configRes.json()])
        if (settingsData.success) setGatewayDomain(settingsData.data?.api_gateway_domain?.value || '')
        if (configData.success) setGatewayCustomDomain(configData.data?.customDomain || '')
        if (routesData.success) {
          const matching = (routesData.data as any[]).filter((r: any) => r.functionId === functionData.id)
          setGatewayRoutes(matching.map((r: any) => ({ id: r.id, routePath: r.routePath, isActive: r.isActive })))
        }
      } catch (_) {}
    }
    fetchGatewayRoutes()
  }, [functionData?.project_id, functionData?.id])

  useEffect(() => {
    if (id) { fetchFunctionData(); fetchExecutionLogs(); fetchRetentionSettings(); fetchScheduleSettings(); fetchEnvironmentVariables() }
  }, [id])

  useEffect(() => { if (id) fetchExecutionLogs() }, [logsCurrentPage, logsPageSize, logsFilter])

  const fetchFunctionData = async () => {
    try {
      const response = await authenticatedFetch(`/api/functions/${id}`)
      const result = await response.json()
      if (result.success) {
        setFunctionData(result.data)
        const [retentionData, scheduleData] = await Promise.all([
          authenticatedFetch(`/api/functions/${id}/retention`).then(r => r.json()),
          authenticatedFetch(`/api/functions/${id}/schedule`).then(r => r.json()),
        ])
        setEditData({
          name: result.data.name, description: result.data.description || '',
          requires_api_key: result.data.requires_api_key,
          retention_enabled: retentionData.success ? retentionData.data.retention_enabled : false,
          retention_type: retentionData.success ? (retentionData.data.retention_type || 'time') : 'time',
          retention_value: retentionData.success ? (retentionData.data.retention_value || 7) : 7,
          schedule_enabled: scheduleData.success ? scheduleData.data.schedule_enabled : false,
          schedule_cron: scheduleData.success ? (scheduleData.data.schedule_cron || '') : ''
        })
        if (retentionData.success) setRetentionSettings(retentionData.data)
        if (scheduleData.success) setScheduleSettings(scheduleData.data)
      }
    } catch (error) { console.error('Error fetching function:', error) }
    finally { setLoading(false) }
  }

  const fetchExecutionLogs = async (page = logsCurrentPage, limit = logsPageSize, statusFilter = logsFilter) => {
    setLogsLoading(true)
    try {
      const response = await authenticatedFetch(`/api/functions/${id}/logs?page=${page}&limit=${limit}&status=${statusFilter}`)
      const result = await response.json()
      if (result.success && result.data) {
        setExecutionLogs(result.data.logs || [])
        setLogsPagination(result.data.pagination || { currentPage: 1, totalPages: 1, totalCount: 0, limit: 10, hasNextPage: false, hasPrevPage: false })
      } else { setExecutionLogs([]) }
    } catch { setExecutionLogs([]) }
    finally { setLogsLoading(false) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const [functionResponse, retentionResponse, scheduleResponse] = await Promise.all([
        authenticatedFetch(`/api/functions/${id}`, { method: 'PATCH', body: JSON.stringify({ name: editData.name, description: editData.description, requires_api_key: editData.requires_api_key }) }),
        authenticatedFetch(`/api/functions/${id}/retention`, { method: 'PUT', body: JSON.stringify({ retention_enabled: editData.retention_enabled, retention_type: editData.retention_type, retention_value: editData.retention_value }) }),
        authenticatedFetch(`/api/functions/${id}/schedule`, { method: 'PUT', body: JSON.stringify({ schedule_enabled: editData.schedule_enabled, schedule_cron: editData.schedule_cron }) }),
      ])
      if (functionResponse.ok && retentionResponse.ok && scheduleResponse.ok) { await fetchFunctionData(); setEditing(false) }
      else {
        if (!functionResponse.ok) { const d = await functionResponse.json(); setDialogState({ type: 'alert', title: 'Error', message: 'Failed to save function: ' + (d.error || d.message || 'Unknown') }) }
        if (!retentionResponse.ok) { const d = await retentionResponse.json(); setDialogState({ type: 'alert', title: 'Error', message: 'Failed to save retention: ' + (d.error || d.message || 'Unknown') }) }
        if (!scheduleResponse.ok) { const d = await scheduleResponse.json(); setDialogState({ type: 'alert', title: 'Error', message: 'Failed to save schedule: ' + (d.error || d.message || 'Unknown') }) }
      }
    } catch { console.error('Error saving function') }
    finally { setSaving(false) }
  }

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedUrl(text); setTimeout(() => setCopiedUrl(null), 2000) }
    catch (error) { console.error('Failed to copy:', error) }
  }

  const regenerateApiKey = async () => {
    setRegeneratingKey(true)
    try { const response = await authenticatedFetch(`/api/functions/${id}/regenerate-key`, { method: 'POST' }); if (response.ok) await fetchFunctionData() }
    catch { console.error('Error regenerating API key') }
    finally { setRegeneratingKey(false) }
  }

  const toggleActiveStatus = async () => {
    try { const r = await authenticatedFetch(`/api/functions/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !functionData?.is_active }) }); if (r.ok) await fetchFunctionData() }
    catch { console.error('Error updating status') }
  }

  const deleteFunction = () => {
    setDialogState({
      type: 'confirm', title: 'Delete Function', message: 'Are you sure you want to delete this function? This action cannot be undone.',
      onConfirm: async () => {
        try {
          const r = await authenticatedFetch(`/api/functions/${id}`, { method: 'DELETE' })
          if (r.ok) { router.push('/admin/functions'); setDialogState({ type: null, title: '', message: '' }) }
        } catch { console.error('Error deleting function') }
      }
    })
  }

  const fetchRetentionSettings = async () => {
    setRetentionLoading(true)
    try { const r = await authenticatedFetch(`/api/functions/${id}/retention`); const d = await r.json(); if (d.success) setRetentionSettings(d.data) }
    catch { console.error('Error fetching retention settings') }
    finally { setRetentionLoading(false) }
  }

  const fetchScheduleSettings = async () => {
    setScheduleLoading(true)
    try { const r = await authenticatedFetch(`/api/functions/${id}/schedule`); const d = await r.json(); if (d.success) setScheduleSettings(d.data) }
    catch { console.error('Error fetching schedule settings') }
    finally { setScheduleLoading(false) }
  }

  const fetchEnvironmentVariables = async () => {
    setEnvVarsLoading(true)
    try { const r = await authenticatedFetch(`/api/functions/${id}/environment-variables`); const d = await r.json(); if (d.success) { setEnvironmentVariables(d.data); setTempEnvVars(d.data) } }
    catch { console.error('Error fetching env vars') }
    finally { setEnvVarsLoading(false) }
  }

  const saveEnvironmentVariables = async () => {
    setEnvVarsSaving(true)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/environment-variables`, { method: 'PUT', body: JSON.stringify({ variables: tempEnvVars }) })
      const d = await r.json()
      if (d.success) { await fetchEnvironmentVariables(); setEditingEnvVars(false) }
      else setDialogState({ type: 'alert', title: 'Error', message: 'Failed to save environment variables: ' + (d.error || d.message || 'Unknown') })
    } catch { setDialogState({ type: 'alert', title: 'Error', message: 'Error saving environment variables' }) }
    finally { setEnvVarsSaving(false) }
  }

  const addEnvironmentVariable = () => setTempEnvVars(prev => [...prev, { variable_name: '', variable_value: '', description: '' }])
  const removeEnvironmentVariable = (index: number) => setTempEnvVars(prev => prev.filter((_, i) => i !== index))
  const updateEnvironmentVariable = (index: number, field: keyof EnvironmentVariable, value: string) =>
    setTempEnvVars(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v))

  const formatDate = (ds: string) => new Date(ds).toLocaleString()
  const formatBytes = (bytes: number) => {
    if (bytes == null || isNaN(bytes)) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }
  const getStatusBadgeVariant = (code: number) => code >= 200 && code < 300 ? 'success' : code >= 400 ? 'destructive' : 'warning'

  if (loading) return (
    <ProtectedRoute><Layout><div className="flex items-center justify-center h-64"><Loader className="w-8 h-8 text-primary animate-spin" /></div></Layout></ProtectedRoute>
  )
  if (!functionData) return (
    <ProtectedRoute><Layout><div className="flex items-center justify-center h-64 text-destructive">Function not found</div></Layout></ProtectedRoute>
  )

  return (
    <ProtectedRoute>
      <Layout title={functionData?.name || 'Function'}>
        <Modal
          isOpen={dialogState.type !== null}
          title={dialogState.title}
          description={dialogState.message}
          onCancel={() => setDialogState({ type: null, title: '', message: '' })}
          onConfirm={async () => { if (dialogState.onConfirm) await dialogState.onConfirm(); else setDialogState({ type: null, title: '', message: '' }) }}
          cancelText={dialogState.type === 'alert' ? 'OK' : 'Cancel'}
          confirmText={dialogState.type === 'alert' ? undefined : 'Delete'}
          confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
        />
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <PageHeader
                title={editing ? (
                  <Input value={editData.name} onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))} className="w-64" />
                ) : functionData.name}
                subtitle={`Function ID: ${functionData.id}`}
                icon={<Package className="w-8 h-8 text-primary" />}
              />
            </div>
            <div className="flex items-center gap-2 ml-4">
              {editing ? (
                <>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <><Loader className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <><Save className="w-4 h-4 mr-2" />Save</>}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setEditing(false)
                    setEditData({ name: functionData.name, description: functionData.description || '', requires_api_key: functionData.requires_api_key, retention_enabled: retentionSettings.retention_enabled, retention_type: retentionSettings.retention_type || 'time', retention_value: retentionSettings.retention_value || 7, schedule_enabled: scheduleSettings.schedule_enabled, schedule_cron: scheduleSettings.schedule_cron || '' })
                  }}>
                    <X className="w-4 h-4 mr-2" />Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Edit className="w-4 h-4 mr-2" />Edit
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button><MoreVertical className="w-4 h-4 mr-1" /><ChevronDown className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { if (functionData.active_version_id) router.push(`/admin/functions/${id}/versions/${functionData.active_version_id}/edit`) }} disabled={!functionData.active_version_id}>
                        <Code2 className="w-4 h-4 mr-2" />View Source
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push(`/admin/functions/${id}/versioning`)}>
                        <History className="w-4 h-4 mr-2" />Versioning
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={toggleActiveStatus} className={functionData.is_active ? 'text-destructive' : 'text-green-400'}>
                        {functionData.is_active ? <><X className="w-4 h-4 mr-2" />Deactivate</> : <><Check className="w-4 h-4 mr-2" />Activate</>}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={deleteFunction} className="text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" />Delete Function
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>

          {/* Function Info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardContent className="pt-6 space-y-4">
                <h2 className="text-base font-semibold text-foreground">Function Information</h2>
                <div>
                  <Label className="text-muted-foreground mb-1 block">Description</Label>
                  {editing ? (
                    <Textarea value={editData.description} onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Enter function description..." />
                  ) : (
                    <p className="text-muted-foreground text-sm">{functionData.description || 'No description provided'}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-muted-foreground">Version</p><p className="text-foreground">{functionData.active_version != null ? `v${functionData.active_version}` : 'N/A'}</p></div>
                  <div><p className="text-muted-foreground">File Size</p><p className="text-foreground">{formatBytes(functionData.file_size)}</p></div>
                  <div><p className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Created</p><p className="text-foreground">{formatDate(functionData.created_at)}</p></div>
                  <div><p className="text-muted-foreground flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Last Executed</p><p className="text-foreground">{functionData.last_executed ? formatDate(functionData.last_executed) : 'Never'}</p></div>
                  <div><p className="text-muted-foreground flex items-center gap-1"><Activity className="w-3.5 h-3.5" />Execution Count</p><p className="text-foreground">{functionData.execution_count} times</p></div>
                  <div><p className="text-muted-foreground">Status</p><Badge variant={functionData.is_active ? 'success' : 'destructive'}>{functionData.is_active ? 'Active' : 'Inactive'}</Badge></div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {/* Function URL */}
              <Card>
                <CardContent className="pt-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Function URL</h3>
                  <div className="flex">
                    <Input type="text" value={functionUrl} readOnly className="rounded-r-none font-mono text-xs" />
                    <Button variant="default" size="icon" onClick={() => copyToClipboard(functionUrl)} className="rounded-l-none shrink-0">
                      {copiedUrl === functionUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  {gatewayRoutes.length > 0 && (() => {
                    const projectSlug = functionData!.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                    const gatewayFull = gatewayDomain ? (gatewayDomain.startsWith('http') ? gatewayDomain.replace(/\/+$/, '') : `https://${gatewayDomain.replace(/\/+$/, '')}`) : ''
                    const customFull = gatewayCustomDomain ? (gatewayCustomDomain.startsWith('http') ? gatewayCustomDomain.replace(/\/+$/, '') : `https://${gatewayCustomDomain.replace(/\/+$/, '')}`) : ''
                    const urls: string[] = []
                    gatewayRoutes.forEach(route => {
                      if (gatewayFull) urls.push(`${gatewayFull}/${projectSlug}${route.routePath}`)
                      if (customFull) urls.push(`${customFull}${route.routePath}`)
                    })
                    return urls.map(url => (
                      <div key={url} className="flex">
                        <Input type="text" value={url} readOnly className="rounded-r-none font-mono text-xs" />
                        <Button variant="default" size="icon" onClick={() => copyToClipboard(url)} className="rounded-l-none shrink-0">
                          {copiedUrl === url ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    ))
                  })()}
                  <p className="text-xs text-muted-foreground">Use this URL to execute your function via HTTP requests</p>
                </CardContent>
              </Card>

              {/* API Key */}
              <Card>
                <CardContent className="pt-5 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground"><Key className="w-4 h-4" />API Key Authentication</h3>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="requiresApiKey"
                      checked={editing ? editData.requires_api_key : functionData.requires_api_key}
                      onCheckedChange={editing ? (v) => setEditData(prev => ({ ...prev, requires_api_key: v === true })) : undefined}
                      disabled={!editing}
                    />
                    <Label htmlFor="requiresApiKey" className="text-sm">Require API key for execution</Label>
                  </div>
                  {(editing ? editData.requires_api_key : functionData.requires_api_key) && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">API Key</Label>
                      <div className="flex">
                        <Input type="text" value={functionData.api_key || 'No API key set'} readOnly className="rounded-r-none font-mono text-xs" />
                        <Button variant="outline" size="icon" onClick={() => copyToClipboard(functionData.api_key || '')} className="rounded-none border-l-0">
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={editing ? regenerateApiKey : undefined} disabled={regeneratingKey || !editing} className="rounded-l-none border-l-0 bg-yellow-600/10 hover:bg-yellow-600/20">
                          <RefreshCw className={cn('w-4 h-4', regeneratingKey && 'animate-spin')} />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Include as: Authorization: Bearer &lt;key&gt; or ?api_key=&lt;key&gt;</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Retention Settings */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-base font-semibold flex items-center gap-2 text-foreground"><Clock className="w-5 h-5" />Execution Log Retention</h3>
              {retentionLoading ? <div className="text-muted-foreground text-sm">Loading retention settings…</div> : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="retentionEnabled"
                      checked={editing ? editData.retention_enabled : retentionSettings.retention_enabled}
                      onCheckedChange={editing ? (v) => setEditData(prev => ({ ...prev, retention_enabled: v === true })) : undefined}
                      disabled={!editing}
                    />
                    <Label htmlFor="retentionEnabled">Use custom retention settings for this function</Label>
                  </div>
                  {(editing ? editData.retention_enabled : retentionSettings.retention_enabled) && (
                    <div className="space-y-4 pl-6 border-l border-border">
                      <div className="space-y-1.5">
                        <Label>Retention Type</Label>
                        <Select value={editing ? editData.retention_type : (retentionSettings.retention_type || 'time')} onValueChange={editing ? (v) => setEditData(prev => ({ ...prev, retention_type: v })) : undefined} disabled={!editing || retentionSaving}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="time">Time-based (days)</SelectItem>
                            <SelectItem value="count">Count-based (number of logs)</SelectItem>
                            <SelectItem value="none">No cleanup</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Retention Value</Label>
                        <Input
                          type="number"
                          value={editing ? editData.retention_value : (retentionSettings.retention_value || 7)}
                          onChange={editing ? (e) => setEditData(prev => ({ ...prev, retention_value: parseInt(e.target.value) })) : undefined}
                          disabled={!editing || retentionSaving || (editing ? editData.retention_type === 'none' : retentionSettings.retention_type === 'none')}
                          min="1"
                        />
                        <p className="text-xs text-muted-foreground">
                          {(editing ? editData.retention_type === 'time' : retentionSettings.retention_type === 'time') && 'Number of days to keep logs'}
                          {(editing ? editData.retention_type === 'count' : retentionSettings.retention_type === 'count') && 'Maximum number of logs to keep'}
                        </p>
                      </div>
                    </div>
                  )}
                  {!retentionSettings.retention_enabled && <p className="text-sm text-muted-foreground pl-6">This function will use global retention settings</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Environment Variables */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold flex items-center gap-2 text-foreground"><Settings className="w-5 h-5" />Environment Variables</h3>
                {!editingEnvVars && (
                  <Button variant="outline" size="sm" onClick={() => { setEditingEnvVars(true); setTempEnvVars([...environmentVariables]) }}>
                    <Edit className="w-4 h-4 mr-2" />Edit
                  </Button>
                )}
              </div>
              {envVarsLoading ? (
                <div className="text-muted-foreground text-sm">Loading environment variables…</div>
              ) : editingEnvVars ? (
                <div className="space-y-4">
                  {tempEnvVars.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-border rounded-lg text-muted-foreground">
                      <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No environment variables defined</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tempEnvVars.map((envVar, index) => (
                        <div key={index} className="flex gap-2 items-center p-3 bg-muted rounded-lg border border-border">
                          <Input placeholder="VARIABLE_NAME" value={envVar.variable_name} onChange={(e) => updateEnvironmentVariable(index, 'variable_name', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} className="font-mono text-sm w-40" />
                          <span className="text-muted-foreground">=</span>
                          <Input placeholder="Value" value={envVar.variable_value} onChange={(e) => updateEnvironmentVariable(index, 'variable_value', e.target.value)} className="flex-1 text-sm" />
                          <Input placeholder="Description (optional)" value={envVar.description || ''} onChange={(e) => updateEnvironmentVariable(index, 'description', e.target.value)} className="flex-1 text-sm" />
                          <Button variant="ghost" size="icon" onClick={() => removeEnvironmentVariable(index)} className="text-destructive hover:text-destructive shrink-0">
                            <Minus className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={addEnvironmentVariable}><Plus className="w-4 h-4 mr-2" />Add Variable</Button>
                    <Button size="sm" onClick={saveEnvironmentVariables} disabled={envVarsSaving}>
                      {envVarsSaving ? <><Loader className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <><Save className="w-4 h-4 mr-2" />Save Variables</>}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setEditingEnvVars(false); setTempEnvVars([...environmentVariables]) }}><X className="w-4 h-4 mr-2" />Cancel</Button>
                  </div>
                  <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                    <p className="text-blue-300 text-sm"><strong>Note:</strong> Variables are available as <code className="text-blue-200 bg-blue-900/50 px-1 rounded">process.env.VARIABLE_NAME</code></p>
                  </div>
                </div>
              ) : environmentVariables.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-border rounded-lg text-muted-foreground">
                  <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No environment variables defined</p>
                  <p className="text-sm mt-1">Environment variables provide configuration to your functions</p>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="font-mono">Variable Name</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {environmentVariables.map((envVar, index) => (
                      <TableRow key={envVar.id || index}>
                        <TableCell className="text-blue-300 font-mono text-sm">{envVar.variable_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{envVar.description || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Schedule Settings */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-base font-semibold flex items-center gap-2 text-foreground"><Timer className="w-5 h-5" />Schedule</h3>
              {scheduleLoading ? <div className="text-muted-foreground text-sm">Loading schedule settings…</div> : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="scheduleEnabled"
                      checked={editing ? editData.schedule_enabled : scheduleSettings.schedule_enabled}
                      onCheckedChange={editing ? (v) => setEditData(prev => ({ ...prev, schedule_enabled: v === true })) : undefined}
                      disabled={!editing}
                    />
                    <Label htmlFor="scheduleEnabled">Enable Scheduling</Label>
                  </div>
                  {(editing ? editData.schedule_enabled : scheduleSettings.schedule_enabled) && (
                    <div className="space-y-4 pl-6 border-l border-border">
                      <div className="space-y-1.5">
                        <Label>Cron Expression</Label>
                        <Input
                          type="text"
                          value={editing ? editData.schedule_cron : (scheduleSettings.schedule_cron || '')}
                          onChange={editing ? (e) => setEditData(prev => ({ ...prev, schedule_cron: e.target.value })) : undefined}
                          disabled={!editing}
                          placeholder="*/5 * * * *"
                          className="font-mono"
                        />
                        <p className="text-xs text-muted-foreground">Format: minute hour day month weekday<br />Examples: "*/5 * * * *" (every 5 min), "0 * * * *" (hourly)</p>
                      </div>
                      {!editing && scheduleSettings.next_execution && <p className="text-sm text-muted-foreground"><strong>Next execution:</strong> {formatDate(scheduleSettings.next_execution)}</p>}
                      {!editing && scheduleSettings.last_scheduled_execution && <p className="text-sm text-muted-foreground"><strong>Last scheduled execution:</strong> {formatDate(scheduleSettings.last_scheduled_execution)}</p>}
                    </div>
                  )}
                  {!(editing ? editData.schedule_enabled : scheduleSettings.schedule_enabled) && <p className="text-sm text-muted-foreground pl-6">Enable scheduling to run this function automatically at specified intervals</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Execution Logs */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-base font-semibold flex items-center gap-2 text-foreground">
                  <Activity className="w-5 h-5" />Execution Logs
                  <Badge variant="secondary">{logsFilter === 'all' ? `${logsPagination.totalCount} total` : `${logsPagination.totalCount} ${logsFilter}`}</Badge>
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <Select value={logsFilter} onValueChange={(v) => { setLogsFilter(v as any); setLogsCurrentPage(1) }}>
                      <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="success">Success Only</SelectItem>
                        <SelectItem value="error">Errors Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Show:</span>
                    <Select value={String(logsPageSize)} onValueChange={(v) => { setLogsPageSize(parseInt(v)); setLogsCurrentPage(1) }}>
                      <SelectTrigger className="w-20 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fetchExecutionLogs(logsCurrentPage, logsPageSize, logsFilter)} disabled={logsLoading}>
                    <Activity className="w-4 h-4 mr-1" />Refresh
                  </Button>
                </div>
              </div>

              {logsLoading ? (
                <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                  <Loader className="w-8 h-8 animate-spin" />Loading execution logs…
                </div>
              ) : executionLogs.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{logsPagination.totalCount === 0 ? 'No execution logs yet' : `No ${logsFilter} executions found`}</p>
                  <p className="text-sm">{logsPagination.totalCount === 0 ? 'Logs will appear here after your function is executed' : 'Try adjusting your filter or refresh'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Req Size</TableHead>
                        <TableHead>Res Size</TableHead>
                        <TableHead>Client IP</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {executionLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(log.executed_at)}</TableCell>
                          <TableCell><Badge variant={getStatusBadgeVariant(log.status_code)}>{log.status_code}</Badge></TableCell>
                          <TableCell className="text-sm">{log.execution_time_ms}ms</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatBytes(log.request_size)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatBytes(log.response_size)}</TableCell>
                          <TableCell className="text-sm font-mono text-muted-foreground">{log.client_ip}</TableCell>
                          <TableCell className="text-sm">
                            {log.error_message ? (
                              <div className="flex items-center gap-1 text-destructive">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span className="text-xs truncate max-w-[150px]" title={log.error_message}>
                                  {(log.error_message.split('\n').find(s => s.trim()) ?? log.error_message).substring(0, 40)}
                                </span>
                              </div>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/functions/${id}/execution-logs/${log.id}`)} className="text-primary h-7">
                              <Activity className="w-3.5 h-3.5 mr-1" />View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {logsPagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Showing {((logsPagination.currentPage - 1) * logsPagination.limit) + 1} to {Math.min(logsPagination.currentPage * logsPagination.limit, logsPagination.totalCount)} of {logsPagination.totalCount}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setLogsCurrentPage(p => p - 1)} disabled={!logsPagination.hasPrevPage || logsLoading}><ChevronLeft className="w-4 h-4" /></Button>
                    {Array.from({ length: Math.min(5, logsPagination.totalPages) }, (_, i) => {
                      let pageNum: number
                      if (logsPagination.totalPages <= 5) pageNum = i + 1
                      else if (logsPagination.currentPage <= 3) pageNum = i + 1
                      else if (logsPagination.currentPage >= logsPagination.totalPages - 2) pageNum = logsPagination.totalPages - 4 + i
                      else pageNum = logsPagination.currentPage - 2 + i
                      return (
                        <Button key={pageNum} variant={pageNum === logsPagination.currentPage ? 'default' : 'ghost'} size="sm" onClick={() => setLogsCurrentPage(pageNum)} disabled={logsLoading} className="h-8 w-8 p-0">{pageNum}</Button>
                      )
                    })}
                    <Button variant="ghost" size="icon" onClick={() => setLogsCurrentPage(p => p + 1)} disabled={!logsPagination.hasNextPage || logsLoading}><ChevronRight className="w-4 h-4" /></Button>
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
