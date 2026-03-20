import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import Modal from '@/components/Modal'
import { useProject } from '@/contexts/ProjectContext'
import {
  Package, Edit, Save, X, Copy, Check, Key, RefreshCw, Activity,
  Calendar, Clock, AlertCircle, Filter, ChevronLeft, ChevronRight,
  Upload, Code2, Trash2, History, Timer, Settings, Plus, Minus, Loader,
  FileText, CheckCircle, Play, Pause, HardDrive, Hash, User, Download, Terminal, ExternalLink
} from 'lucide-react'
import { getFunctionUrl, authenticatedFetch } from '@/lib/frontend-utils'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
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
  project_is_active: boolean
}

interface FunctionVersion {
  id: string
  version: string
  file_size: number
  package_hash: string
  is_active: boolean
  created_at: string
  created_by?: string
  created_by_name?: string
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

  // ── Core function data ──────────────────────────────────────────────────────
  const [functionData, setFunctionData] = useState<FunctionItem | null>(null)
  const [functionUrl, setFunctionUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [gatewayRoutes, setGatewayRoutes] = useState<{ id: string; routePath: string; isActive: boolean }[]>([])
  const [gatewayDomain, setGatewayDomain] = useState<string>('')
  const [gatewayCustomDomain, setGatewayCustomDomain] = useState<string>('')
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  // ── Header editing ──────────────────────────────────────────────────────────
  const [editHeaderModalOpen, setEditHeaderModalOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [headerSaving, setHeaderSaving] = useState(false)

  // ── Versions (Deployment tab) ───────────────────────────────────────────────
  const [versions, setVersions] = useState<FunctionVersion[]>([])
  const [switchingVersion, setSwitchingVersion] = useState<string | null>(null)
  const [deletingVersion, setDeletingVersion] = useState<string | null>(null)
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null)
  const [deployModalOpen, setDeployModalOpen] = useState(false)
  const [deployFile, setDeployFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null)
  const deployFileInputRef = useRef<HTMLInputElement>(null)
  const [cleaningUpVersions, setCleaningUpVersions] = useState(false)

  // ── Environment variables ───────────────────────────────────────────────────
  const [environmentVariables, setEnvironmentVariables] = useState<EnvironmentVariable[]>([])
  const [envVarsLoading, setEnvVarsLoading] = useState(false)
  const [envVarsSaving, setEnvVarsSaving] = useState(false)
  const [editingEnvVars, setEditingEnvVars] = useState(false)
  const [tempEnvVars, setTempEnvVars] = useState<EnvironmentVariable[]>([])

  // ── Schedule ────────────────────────────────────────────────────────────────
  const [scheduleSettings, setScheduleSettings] = useState({ schedule_enabled: false, schedule_cron: '', next_execution: null as any, last_scheduled_execution: null as any })
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleCronDraft, setScheduleCronDraft] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [schedulePreviewNextExecution, setSchedulePreviewNextExecution] = useState<string | null>(null)
  const [schedulePreviewError, setSchedulePreviewError] = useState<string | null>(null)

  // ── Monitoring / Execution logs ─────────────────────────────────────────────
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPagination, setLogsPagination] = useState<LogsPaginationInfo>({ currentPage: 1, totalPages: 1, totalCount: 0, limit: 10, hasNextPage: false, hasPrevPage: false })
  const [logsCurrentPage, setLogsCurrentPage] = useState(1)
  const [logsPageSize, setLogsPageSize] = useState(10)
  const [logsFilter, setLogsFilter] = useState<'all' | 'success' | 'error'>('all')

  // ── Retention (Configure modal on Monitoring tab) ───────────────────────────
  const [retentionModalOpen, setRetentionModalOpen] = useState(false)
  const [retentionSettings, setRetentionSettings] = useState({ retention_type: null as any, retention_value: null as any, retention_enabled: false })
  const [retentionDraft, setRetentionDraft] = useState({ retention_enabled: false, retention_type: 'time', retention_value: 7 })
  const [retentionSaving, setRetentionSaving] = useState(false)

  // ── Advanced / API Key ──────────────────────────────────────────────────────
  const [regeneratingKey, setRegeneratingKey] = useState(false)

  // ── Project locking ─────────────────────────────────────────────────────────
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
    const fetchGatewayData = async () => {
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
    fetchGatewayData()
  }, [functionData?.project_id, functionData?.id])

  useEffect(() => {
    if (id) {
      fetchFunctionData()
      fetchVersions()
      fetchRetentionSettings()
      fetchScheduleSettings()
      fetchExecutionLogs()
      fetchEnvironmentVariables()
    }
  }, [id])

  useEffect(() => {
    if (!id || !scheduleSettings.schedule_enabled) {
      setSchedulePreviewError(null)
      setSchedulePreviewNextExecution(null)
      return
    }

    if (!scheduleCronDraft.trim()) {
      setSchedulePreviewError('Cron expression is required')
      setSchedulePreviewNextExecution(null)
      return
    }

    const timeout = setTimeout(async () => {
      try {
        const r = await authenticatedFetch(`/api/functions/${id}/schedule-preview`, {
          method: 'POST',
          body: JSON.stringify({ schedule_cron: scheduleCronDraft }),
        })
        const d = await r.json()
        if (d.success) {
          setSchedulePreviewNextExecution(d.data?.next_execution || null)
          setSchedulePreviewError(null)
        } else {
          setSchedulePreviewNextExecution(null)
          setSchedulePreviewError(d.error || d.message || 'Invalid cron expression')
        }
      } catch {
        setSchedulePreviewNextExecution(null)
        setSchedulePreviewError('Unable to preview next execution')
      }
    }, 250)

    return () => clearTimeout(timeout)
  }, [id, scheduleCronDraft, scheduleSettings.schedule_enabled])

  useEffect(() => { if (id) fetchExecutionLogs() }, [logsCurrentPage, logsPageSize, logsFilter])

  // ── Data fetching ────────────────────────────────────────────────────────────
  const fetchFunctionData = async () => {
    try {
      const r = await authenticatedFetch(`/api/functions/${id}`)
      const d = await r.json()
      if (d.success) setFunctionData(d.data)
    } catch (e) { console.error('Error fetching function:', e) }
    finally { setLoading(false) }
  }

  const fetchVersions = async () => {
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/versions`)
      const d = await r.json()
      if (d.success) setVersions(d.data)
    } catch { console.error('Error fetching versions') }
  }

  const fetchRetentionSettings = async () => {
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/retention`)
      const d = await r.json()
      if (d.success) setRetentionSettings(d.data)
    } catch { console.error('Error fetching retention settings') }
  }

  const fetchScheduleSettings = async () => {
    setScheduleLoading(true)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/schedule`)
      const d = await r.json()
      if (d.success) {
        setScheduleSettings(d.data)
        setScheduleCronDraft(d.data.schedule_cron || '')
        setSchedulePreviewNextExecution(d.data.next_execution || null)
        setSchedulePreviewError(null)
      }
    } catch { console.error('Error fetching schedule') }
    finally { setScheduleLoading(false) }
  }

  const fetchExecutionLogs = async (page = logsCurrentPage, limit = logsPageSize, statusFilter = logsFilter) => {
    setLogsLoading(true)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/logs?page=${page}&limit=${limit}&status=${statusFilter}`)
      const d = await r.json()
      if (d.success && d.data) {
        setExecutionLogs(d.data.logs || [])
        setLogsPagination(d.data.pagination || { currentPage: 1, totalPages: 1, totalCount: 0, limit: 10, hasNextPage: false, hasPrevPage: false })
      } else setExecutionLogs([])
    } catch { setExecutionLogs([]) }
    finally { setLogsLoading(false) }
  }

  const fetchEnvironmentVariables = async () => {
    setEnvVarsLoading(true)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/environment-variables`)
      const d = await r.json()
      if (d.success) { setEnvironmentVariables(d.data); setTempEnvVars(d.data) }
    } catch { console.error('Error fetching env vars') }
    finally { setEnvVarsLoading(false) }
  }

  // ── Header save ──────────────────────────────────────────────────────────────
  const saveHeader = async () => {
    setHeaderSaving(true)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}`, { method: 'PATCH', body: JSON.stringify({ name: editName, description: editDescription }) })
      if (r.ok) { await fetchFunctionData(); setEditHeaderModalOpen(false) }
      else { const d = await r.json(); setDialogState({ type: 'alert', title: 'Error', message: 'Failed to save: ' + (d.error || d.message || 'Unknown') }) }
    } catch { setDialogState({ type: 'alert', title: 'Error', message: 'Error saving function' }) }
    finally { setHeaderSaving(false) }
  }

  // ── Activate / Deactivate ────────────────────────────────────────────────────
  const toggleActiveStatus = async () => {
    try {
      const r = await authenticatedFetch(`/api/functions/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !functionData?.is_active }) })
      if (r.ok) await fetchFunctionData()
    } catch { console.error('Error updating status') }
  }

  // ── Delete function ──────────────────────────────────────────────────────────
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

  // ── Copy to clipboard ────────────────────────────────────────────────────────
  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedUrl(text); setTimeout(() => setCopiedUrl(null), 2000) }
    catch (e) { console.error('Failed to copy:', e) }
  }

  // ── Version actions ──────────────────────────────────────────────────────────
  const handleSwitchVersion = async (versionId: string, version: string) => {
    setDialogState({
      type: 'confirm', title: 'Switch Version', message: `Are you sure you want to switch to version ${version}?`,
      onConfirm: async () => {
        setSwitchingVersion(versionId)
        try {
          const r = await authenticatedFetch(`/api/functions/${id}/switch-version`, { method: 'POST', body: JSON.stringify({ versionId }) })
          const result = await r.json()
          if (result.success) { fetchVersions(); fetchFunctionData(); setDialogState({ type: null, title: '', message: '' }) }
          else setDialogState({ type: 'alert', title: 'Error', message: result.message || 'Version switch failed' })
        } catch { setDialogState({ type: 'alert', title: 'Error', message: 'Network error occurred' }) }
        finally { setSwitchingVersion(null) }
      }
    })
  }

  const handleDeleteVersion = async (versionId: string, versionNumber: number) => {
    setDialogState({
      type: 'confirm', title: 'Delete Version', message: `Are you sure you want to delete version ${versionNumber}? This action cannot be undone.`,
      onConfirm: async () => {
        setDeletingVersion(versionId)
        try {
          const r = await authenticatedFetch(`/api/functions/${id}/versions?version=${versionNumber}`, { method: 'DELETE' })
          const result = await r.json()
          if (result.success) { fetchVersions(); setDialogState({ type: null, title: '', message: '' }) }
          else setDialogState({ type: 'alert', title: 'Error', message: result.message || 'Failed to delete version' })
        } catch { setDialogState({ type: 'alert', title: 'Error', message: 'Network error occurred' }) }
        finally { setDeletingVersion(null) }
      }
    })
  }

  const handleCleanupVersions = () => {
    const sorted = [...versions].sort((a, b) => parseInt(a.version) - parseInt(b.version))
    const activeVersion = versions.find(v => v.is_active)
    const latestNonActive = [...sorted].reverse().find(v => !v.is_active)
    const toDelete = versions.filter(v => {
      if (activeVersion && v.id === activeVersion.id) return false
      if (latestNonActive && v.id === latestNonActive.id) return false
      return true
    })
    if (toDelete.length === 0) {
      setDialogState({ type: 'alert', title: 'Clean Up Old Versions', message: 'Everything is clean. Nothing needs to be deleted.' })
      return
    }
    setDialogState({
      type: 'confirm',
      title: 'Clean Up Old Versions',
      message: `This will permanently delete ${toDelete.length} old version${toDelete.length > 1 ? 's' : ''}. The last version and the active version will not be deleted. This action cannot be undone.`,
      onConfirm: async () => {
        setCleaningUpVersions(true)
        setDialogState({ type: null, title: '', message: '' })
        try {
          await Promise.all(
            toDelete.map(v =>
              authenticatedFetch(`/api/functions/${id}/versions?version=${v.version}`, { method: 'DELETE' })
            )
          )
          fetchVersions()
        } catch {
          setDialogState({ type: 'alert', title: 'Error', message: 'Failed to clean up some versions' })
        } finally {
          setCleaningUpVersions(false)
        }
      }
    })
  }

  const handleDownloadVersion = async (versionId: string, version: string) => {
    setDownloadingVersion(versionId)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/versions/${versionId}/download`)
      if (r.ok) {
        const blob = await r.blob(); const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `${functionData?.name || 'function'}-v${version}.zip`
        document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url)
      }
    } catch { console.error('Error downloading version') }
    finally { setDownloadingVersion(null) }
  }

  // ── Deploy (upload new version) ──────────────────────────────────────────────
  const handleDeployFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) { setDeployFile(f); setUploadResult(null) }
  }
  const handleDeployDragOver = (e: React.DragEvent) => e.preventDefault()
  const handleDeployDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith('.zip') || f.name.endsWith('.tar.gz') || f.name.endsWith('.tgz'))) { setDeployFile(f); setUploadResult(null) }
  }
  const handleUploadNewVersion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deployFile) { setUploadResult({ success: false, message: 'Please select a file to upload' }); return }
    setUploading(true); setUploadResult(null)
    const formData = new FormData(); formData.append('file', deployFile)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/versions`, { method: 'POST', body: formData })
      const result = await r.json()
      if (result.success) {
        setUploadResult({ success: true, message: 'New version uploaded successfully!' })
        setDeployFile(null)
        if (deployFileInputRef.current) deployFileInputRef.current.value = ''
        fetchVersions(); fetchFunctionData()
      } else setUploadResult({ success: false, message: result.message || 'Upload failed' })
    } catch { setUploadResult({ success: false, message: 'Network error occurred' }) }
    finally { setUploading(false) }
  }

  // ── Environment variables ────────────────────────────────────────────────────
  const addEnvironmentVariable = () => setTempEnvVars(prev => [...prev, { variable_name: '', variable_value: '', description: '' }])
  const removeEnvironmentVariable = (index: number) => setTempEnvVars(prev => prev.filter((_, i) => i !== index))
  const updateEnvironmentVariable = (index: number, field: keyof EnvironmentVariable, value: string) =>
    setTempEnvVars(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v))
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

  // ── Schedule ──────────────────────────────────────────────────────────────────
  const toggleScheduleEnabled = async (checked: boolean) => {
    if (checked) {
      if (!scheduleCronDraft.trim()) {
        setScheduleSettings(prev => ({ ...prev, schedule_enabled: true }))
        return
      }

      setScheduleSaving(true)
      try {
        const r = await authenticatedFetch(`/api/functions/${id}/schedule`, {
          method: 'PUT',
          body: JSON.stringify({ schedule_enabled: true, schedule_cron: scheduleCronDraft }),
        })
        const d = await r.json()
        if (d.success) {
          setScheduleSettings(d.data)
          setScheduleCronDraft(d.data.schedule_cron || '')
          setSchedulePreviewNextExecution(d.data.next_execution || null)
          setSchedulePreviewError(null)
        } else {
          setScheduleSettings(prev => ({ ...prev, schedule_enabled: true }))
          setDialogState({ type: 'alert', title: 'Error', message: 'Failed to update schedule: ' + (d.error || d.message || 'Unknown') })
        }
      } catch {
        setScheduleSettings(prev => ({ ...prev, schedule_enabled: true }))
        setDialogState({ type: 'alert', title: 'Error', message: 'Error updating schedule' })
      } finally {
        setScheduleSaving(false)
      }
      return
    }

    setScheduleSaving(true)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/schedule`, {
        method: 'PUT',
        body: JSON.stringify({ schedule_enabled: checked, schedule_cron: scheduleCronDraft }),
      })
      const d = await r.json()
      if (d.success) {
        setScheduleSettings(d.data)
        setScheduleCronDraft(d.data.schedule_cron || '')
        setSchedulePreviewNextExecution(d.data.next_execution || null)
        setSchedulePreviewError(null)
      } else {
        setDialogState({ type: 'alert', title: 'Error', message: 'Failed to update schedule: ' + (d.error || d.message || 'Unknown') })
      }
    } catch {
      setDialogState({ type: 'alert', title: 'Error', message: 'Error updating schedule' })
    } finally {
      setScheduleSaving(false)
    }
  }

  const saveScheduleCron = async () => {
    setScheduleSaving(true)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/schedule`, {
        method: 'PUT',
        body: JSON.stringify({ schedule_enabled: scheduleSettings.schedule_enabled, schedule_cron: scheduleCronDraft }),
      })
      const d = await r.json()
      if (d.success) {
        setScheduleSettings(d.data)
        setScheduleCronDraft(d.data.schedule_cron || '')
        setSchedulePreviewNextExecution(d.data.next_execution || null)
        setSchedulePreviewError(null)
      }
      else setDialogState({ type: 'alert', title: 'Error', message: 'Failed to save schedule: ' + (d.error || d.message || 'Unknown') })
    } catch { setDialogState({ type: 'alert', title: 'Error', message: 'Error saving schedule' }) }
    finally { setScheduleSaving(false) }
  }

  // ── Retention ─────────────────────────────────────────────────────────────────
  const openRetentionModal = () => {
    setRetentionDraft({
      retention_enabled: retentionSettings.retention_enabled,
      retention_type: retentionSettings.retention_type || 'time',
      retention_value: retentionSettings.retention_value || 7,
    })
    setRetentionModalOpen(true)
  }
  const saveRetentionSettings = async () => {
    setRetentionSaving(true)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/retention`, { method: 'PUT', body: JSON.stringify(retentionDraft) })
      const d = await r.json()
      if (d.success) { setRetentionSettings(retentionDraft as any); setRetentionModalOpen(false) }
      else setDialogState({ type: 'alert', title: 'Error', message: 'Failed to save retention: ' + (d.error || d.message || 'Unknown') })
    } catch { setDialogState({ type: 'alert', title: 'Error', message: 'Error saving retention settings' }) }
    finally { setRetentionSaving(false) }
  }

  // ── API Key ────────────────────────────────────────────────────────────────────
  const toggleApiKeyRequirement = async (checked: boolean) => {
    try {
      const r = await authenticatedFetch(`/api/functions/${id}`, { method: 'PATCH', body: JSON.stringify({ requires_api_key: checked }) })
      if (r.ok) await fetchFunctionData()
    } catch { console.error('Error updating API key requirement') }
  }
  const regenerateApiKey = async () => {
    setRegeneratingKey(true)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/regenerate-key`, { method: 'POST' })
      if (r.ok) await fetchFunctionData()
    } catch { console.error('Error regenerating API key') }
    finally { setRegeneratingKey(false) }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────
  const formatDate = (ds: string) => new Date(ds).toLocaleString()
  const formatBytes = (bytes: number | string | null | undefined) => {
    const value = typeof bytes === 'string' ? Number(bytes) : bytes
    if (value == null || !Number.isFinite(value) || value < 0) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (value === 0) return '0 Bytes'
    const index = Math.floor(Math.log(value) / Math.log(1024))
    const i = Math.min(index, sizes.length - 1)
    return Math.round(value / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }
  const getStatusBadgeVariant = (code: number) => code >= 200 && code < 300 ? 'success' : code >= 400 ? 'destructive' : 'warning'
  const getGatewayUrls = (): string[] => {
    if (!gatewayRoutes.length || !functionData) return []
    const projectSlug = functionData.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const gatewayFull = gatewayDomain ? (gatewayDomain.startsWith('http') ? gatewayDomain.replace(/\/+$/, '') : `https://${gatewayDomain.replace(/\/+$/, '')}`) : ''
    const customFull = gatewayCustomDomain ? (gatewayCustomDomain.startsWith('http') ? gatewayCustomDomain.replace(/\/+$/, '') : `https://${gatewayCustomDomain.replace(/\/+$/, '')}`) : ''
    const urls: string[] = []
    gatewayRoutes.forEach(route => {
      if (gatewayFull) urls.push(`${gatewayFull}/${projectSlug}${route.routePath}`)
      if (customFull) urls.push(`${customFull}${route.routePath}`)
    })
    return urls
  }

  if (loading) return (
    <ProtectedRoute><Layout><div className="flex items-center justify-center h-64"><Loader className="w-8 h-8 text-primary animate-spin" /></div></Layout></ProtectedRoute>
  )
  if (!functionData) return (
    <ProtectedRoute><Layout><div className="flex items-center justify-center h-64 text-destructive">Function not found</div></Layout></ProtectedRoute>
  )

  const gatewayUrls = getGatewayUrls()

  return (
    <ProtectedRoute>
      <TooltipProvider>
      <Layout title={functionData.name}>
        <Modal
          isOpen={dialogState.type !== null}
          title={dialogState.title}
          description={dialogState.message}
          onCancel={() => setDialogState({ type: null, title: '', message: '' })}
          onConfirm={dialogState.type === 'alert' ? undefined : async () => { if (dialogState.onConfirm) await dialogState.onConfirm(); else setDialogState({ type: null, title: '', message: '' }) }}
          cancelText={dialogState.type === 'alert' ? 'OK' : 'Cancel'}
          confirmText={dialogState.type === 'alert' ? undefined : 'Continue'}
          confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
        />
        <div >

          {/* ── Inactive project alert ──────────────────────────────────── */}
          {functionData.project_is_active === false && (
            <div className="flex items-center gap-3 rounded-lg border border-yellow-600/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>The project <strong>{functionData.project_name}</strong> is currently inactive. This function cannot be executed until the project is reactivated.</span>
            </div>
          )}

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <PageHeader
                title={functionData.name}
                subtitle={functionData.description || 'No description provided'}
                icon={<Package className="w-8 h-8 text-primary" />}
              />
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => { setEditName(functionData.name); setEditDescription(functionData.description || ''); setEditHeaderModalOpen(true) }}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={deleteFunction}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete function</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* ── Tabs ───────────────────────────────────────────────────────── */}
          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="deployment">Deployment</TabsTrigger>
              <TabsTrigger value="environment">Environment</TabsTrigger>
              <TabsTrigger value="schedule">Scheduling</TabsTrigger>
              <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            {/* ── General Tab ────────────────────────────────────────────── */}
            <TabsContent value="general" className="space-y-6 mt-0">

              {/* Actions */}
              <Card>
                <CardContent className="overflow-x-auto">
                  <div className="mt-6">
                    <div className="flex gap-2 whitespace-nowrap [&>*]:shrink-0">
                      {functionData.is_active ? (
                        <>
                          <Button variant="destructive" onClick={toggleActiveStatus}>
                            <X className="w-4 h-4 mr-1" />Deactivate
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              const targetUrl = functionUrl || gatewayUrls[0]
                              if (targetUrl) window.open(targetUrl, '_blank', 'noopener,noreferrer')
                            }}
                            disabled={!functionUrl && gatewayUrls.length === 0}
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />Execute Function
                          </Button>
                        </>
                      ) : (
                        <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={toggleActiveStatus}>
                          <Play className="w-4 h-4 mr-1" />Activate
                        </Button>
                      )}
                      <Button className="hidden sm:inline-flex" variant="default" onClick={() => { if (functionData.active_version_id) router.push(`/admin/functions/${id}/versions/${functionData.active_version_id}/edit`) }} disabled={!functionData.active_version_id}>
                        <Code2 className="w-4 h-4 mr-1" />Open Code Editor
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Function URL */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Copy className="w-5 h-5" />Function URL
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex min-w-0">
                    <Input type="text" value={functionUrl} readOnly className="min-w-0 flex-1 rounded-r-none font-mono text-xs" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="default" size="icon" onClick={() => copyToClipboard(functionUrl)} className="rounded-l-none shrink-0">
                          {copiedUrl === functionUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{copiedUrl === functionUrl ? 'Copied!' : 'Copy URL'}</TooltipContent>
                    </Tooltip>
                  </div>
                  {gatewayUrls.map(url => (
                    <div key={url} className="flex min-w-0">
                      <Input type="text" value={url} readOnly className="min-w-0 flex-1 rounded-r-none font-mono text-xs" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="default" size="icon" onClick={() => copyToClipboard(url)} className="rounded-l-none shrink-0">
                            {copiedUrl === url ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{copiedUrl === url ? 'Copied!' : 'Copy URL'}</TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Use this URL to execute your function via HTTP requests</p>
                </CardContent>
              </Card>

              {/* Metadata */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Package className="w-5 h-5" />Function Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</dt>
                      <dd><Badge variant={functionData.is_active ? 'success' : 'secondary'}>{functionData.is_active ? 'Active' : 'Inactive'}</Badge></dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Version</dt>
                      <dd className="font-mono">{functionData.active_version != null ? `v${functionData.active_version}` : '—'}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Package Size</dt>
                      <dd>{formatBytes(functionData.file_size)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Execution Count</dt>
                      <dd>{functionData.execution_count}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</dt>
                      <dd>{formatDate(functionData.created_at)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Executed</dt>
                      <dd>{functionData.last_executed ? formatDate(functionData.last_executed) : 'Never'}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Function ID</dt>
                      <dd className="break-all font-mono text-xs">{functionData.id}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project</dt>
                      <dd>{functionData.project_name}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

            </TabsContent>

            {/* ── Deployment Tab ─────────────────────────────────────────── */}
            <TabsContent value="deployment" className="space-y-6 mt-0">

              {/* Actions */}
              <Card>
                <CardContent className="overflow-x-auto">
                  <div className="mt-6">
                    <div className="flex gap-2 whitespace-nowrap [&>*]:shrink-0">
                      <Button size="sm" onClick={() => { setUploadResult(null); setDeployFile(null); setDeployModalOpen(true) }}>
                        <Upload className="w-4 h-4 mr-1" />Deploy New Version
                      </Button>
                      <Button size="sm" variant="destructive" onClick={handleCleanupVersions} disabled={cleaningUpVersions}>
                        {cleaningUpVersions ? <><Loader className="w-4 h-4 mr-1 animate-spin" />Cleaning up…</> : <><Trash2 className="w-4 h-4 mr-1" />Clean Up Old Versions</>}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Versions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-5 h-5" />Versions
                    <Badge variant="secondary" className="ml-1">{versions.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {versions.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                      <History className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No versions found</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Version</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Hash</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Created By</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...versions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((version) => (
                            <TableRow key={version.id}>
                              <TableCell className="font-medium text-foreground">v{version.version}</TableCell>
                              <TableCell>
                                {version.is_active
                                  ? <Badge variant="success" className="flex items-center gap-1 w-fit"><Play className="w-3 h-3" />Active</Badge>
                                  : <Badge variant="secondary" className="flex items-center gap-1 w-fit"><Pause className="w-3 h-3" />Inactive</Badge>
                                }
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground"><span className="flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" />{formatBytes(version.file_size)}</span></TableCell>
                              <TableCell className="text-sm text-muted-foreground font-mono"><span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{version.package_hash.substring(0, 8)}…</span></TableCell>
                              <TableCell className="text-sm text-muted-foreground"><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(version.created_at)}</span></TableCell>
                              <TableCell className="text-sm text-muted-foreground"><span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{version.created_by_name || 'Unknown'}</span></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/functions/${id}/versions/${version.id}/edit`)} className="text-blue-400 hover:text-blue-300 h-8 w-8">
                                        <Code2 className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>View / Edit code</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => handleDownloadVersion(version.id, version.version)} disabled={downloadingVersion === version.id} className="text-primary hover:text-primary/80 h-8 w-8">
                                        {downloadingVersion === version.id ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Download</TooltipContent>
                                  </Tooltip>
                                  {!version.is_active && (
                                    <>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" onClick={() => handleSwitchVersion(version.id, version.version)} disabled={switchingVersion === version.id} className="text-green-400 hover:text-green-300 h-8 w-8">
                                            {switchingVersion === version.id ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Activate version</TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" onClick={() => handleDeleteVersion(version.id, parseInt(version.version))} disabled={deletingVersion === version.id} className="text-destructive hover:text-destructive/80 h-8 w-8">
                                            {deletingVersion === version.id ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Delete version</TooltipContent>
                                      </Tooltip>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Environment Tab ────────────────────────────────────────── */}
            <TabsContent value="environment" className="mt-0">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold flex items-center gap-2 text-foreground"><Settings className="w-5 h-5" />Environment Variables</h3>
                    {!editingEnvVars && (
                      <Button variant="outline" size="sm" onClick={() => { setEditingEnvVars(true); setTempEnvVars([...environmentVariables]) }}>
                        <Edit className="w-4 h-4 mr-1" />Edit
                      </Button>
                    )}
                  </div>
                  {envVarsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-3/4" />
                    </div>
                  ) : editingEnvVars ? (
                    <div className="space-y-4">
                      {tempEnvVars.length === 0 ? (
                        <div className="text-center py-8 border-2 border-dashed border-border rounded-lg text-muted-foreground">
                          <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No environment variables defined</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {tempEnvVars.map((envVar, index) => (
                            <div key={index} className="flex flex-col gap-2 rounded-lg border border-border bg-muted p-3 sm:flex-row sm:items-center">
                              <Input placeholder="VARIABLE_NAME" value={envVar.variable_name} onChange={(e) => updateEnvironmentVariable(index, 'variable_name', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} className="font-mono text-sm sm:w-40" />
                              <span className="text-muted-foreground">=</span>
                              <Input placeholder="Value" value={envVar.variable_value} onChange={(e) => updateEnvironmentVariable(index, 'variable_value', e.target.value)} className="min-w-0 flex-1 text-sm" />
                              <Input placeholder="Description (optional)" value={envVar.description || ''} onChange={(e) => updateEnvironmentVariable(index, 'description', e.target.value)} className="min-w-0 flex-1 text-sm" />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => removeEnvironmentVariable(index)} className="text-destructive hover:text-destructive shrink-0">
                                    <Minus className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove variable</TooltipContent>
                              </Tooltip>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={addEnvironmentVariable}><Plus className="w-4 h-4 mr-1" />Add Variable</Button>
                        <Button size="sm" onClick={saveEnvironmentVariables} disabled={envVarsSaving}>
                          {envVarsSaving ? <><Loader className="w-4 h-4 mr-1 animate-spin" />Saving…</> : <><Save className="w-4 h-4 mr-1" />Save Variables</>}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setEditingEnvVars(false); setTempEnvVars([...environmentVariables]) }}><X className="w-4 h-4 mr-1" />Cancel</Button>
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
            </TabsContent>

            {/* ── Schedule Tab ───────────────────────────────────────────── */}
            <TabsContent value="schedule" className="mt-0">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  {scheduleLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <div className="py-2">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">Enable Scheduling</p>
                          <p className="text-sm text-muted-foreground mt-0.5">Run this function automatically based on a cron schedule</p>
                        </div>
                        <Switch
                          checked={scheduleSettings.schedule_enabled}
                          onCheckedChange={toggleScheduleEnabled}
                          disabled={scheduleSaving}
                        />
                      </div>

                      {scheduleSettings.schedule_enabled ? (
                        <div className="mt-4 space-y-3 pl-0">
                          <div className="space-y-1.5">
                            <Label>Cron Expression</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="text"
                                value={scheduleCronDraft}
                                onChange={(e) => setScheduleCronDraft(e.target.value)}
                                placeholder="*/5 * * * *"
                                className="font-mono"
                              />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    onClick={saveScheduleCron}
                                    disabled={scheduleSaving || scheduleCronDraft === (scheduleSettings.schedule_cron || '') || !scheduleCronDraft.trim() || !!schedulePreviewError}
                                  >
                                    <Save className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Save cron expression</TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-xs text-muted-foreground">Format: minute hour day month weekday<br />Examples: "*/5 * * * *" (every 5 min), "0 * * * *" (hourly)</p>
                          </div>

                          <p className="text-sm text-muted-foreground">
                            <strong>Next execution:</strong>{' '}
                            {schedulePreviewError
                              ? <span className="text-destructive">{schedulePreviewError}</span>
                              : schedulePreviewNextExecution
                                ? formatDate(schedulePreviewNextExecution)
                                : '—'}
                          </p>
                          {scheduleSettings.last_scheduled_execution && (
                            <p className="text-sm text-muted-foreground"><strong>Last scheduled execution:</strong> {formatDate(scheduleSettings.last_scheduled_execution)}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-4">Enable scheduling to run this function automatically at specified intervals</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Monitoring Tab ─────────────────────────────────────────── */}
            <TabsContent value="monitoring" className="mt-0">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <h2 className="text-base font-semibold flex items-center gap-2 text-foreground">
                      <Activity className="w-5 h-5" />Execution Logs
                      <Badge variant="secondary">{logsFilter === 'all' ? `${logsPagination.totalCount} total` : `${logsPagination.totalCount} ${logsFilter}`}</Badge>
                    </h2>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={openRetentionModal}>
                        <Settings className="w-4 h-4 mr-1" />Configure
                      </Button>
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
            </TabsContent>

            {/* ── Advanced Tab ───────────────────────────────────────────── */}
            <TabsContent value="advanced" className="mt-0">
              <Card>
                <CardContent className="pt-6">
                  {/* API Key Authentication */}
                  <div className="py-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">Restrict Execution</p>
                        <p className="text-sm text-muted-foreground mt-0.5">Require an API key to execute this function. <br/><br/>For API gateway upstream, the API authentication will be bypassed. <br/>Recommended to configure the authentication in the API gateway settings instead.<br/><br/>Turn this on if you want to ensure the function is executed from the API gateway.</p>
                      </div>
                      <Switch
                        checked={functionData.requires_api_key}
                        onCheckedChange={toggleApiKeyRequirement}
                      />
                    </div>
                    {functionData.requires_api_key && (
                      <div className="mt-4 space-y-2 pl-0">
                        <Label className="text-xs text-muted-foreground"><Key className="w-3.5 h-3.5 inline mr-1" />API Key</Label>
                        <div className="flex min-w-0">
                          <Input type="text" value={functionData.api_key || 'No API key set'} readOnly className="min-w-0 flex-1 rounded-r-none font-mono text-xs" />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" onClick={() => copyToClipboard(functionData.api_key || '')} className="rounded-none border-l-0">
                                {copiedUrl === functionData.api_key ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{copiedUrl === functionData.api_key ? 'Copied!' : 'Copy API key'}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" onClick={regenerateApiKey} disabled={regeneratingKey} className="rounded-l-none border-l-0 bg-yellow-600/10 hover:bg-yellow-600/20">
                                <RefreshCw className={cn('w-4 h-4', regeneratingKey && 'animate-spin')} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Regenerate API key</TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-xs text-muted-foreground">Include as: Authorization: Bearer &lt;key&gt; or ?api_key=&lt;key&gt;</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Deploy New Version Dialog ─────────────────────────────────── */}
        <Modal
          isOpen={deployModalOpen}
          title="Deploy New Version"
          onCancel={() => {
            setDeployModalOpen(false)
            setUploadResult(null)
            setDeployFile(null)
          }}
          hideFooter
          className="max-w-2xl"
        >
            <Tabs defaultValue="upload" className="mt-2">
              <TabsList className="w-full">
                <TabsTrigger value="upload" className="flex-1"><Upload className="w-4 h-4 mr-1" />Upload ZIP Package</TabsTrigger>
                <TabsTrigger value="cli" className="flex-1"><Terminal className="w-4 h-4 mr-1" />Deploy from CLI</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="space-y-4 mt-4">
                <div
                  className={cn('border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer', deployFile ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}
                  onDragOver={handleDeployDragOver}
                  onDrop={handleDeployDrop}
                  onClick={() => !deployFile && deployFileInputRef.current?.click()}
                >
                  {deployFile ? (
                    <div className="space-y-3">
                      <FileText className="w-12 h-12 mx-auto text-primary" />
                      <div><p className="font-medium text-foreground">{deployFile.name}</p><p className="text-muted-foreground text-sm">{formatBytes(deployFile.size)}</p></div>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeployFile(null) }} className="text-muted-foreground">Remove file</Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                      <div><p className="text-foreground">Drag and drop your function package here</p><p className="text-muted-foreground text-sm">or click to browse (.zip, .tar.gz, .tgz)</p></div>
                      <input ref={deployFileInputRef} type="file" accept=".zip,.tar.gz,.tgz" onChange={handleDeployFileSelect} className="hidden" />
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); deployFileInputRef.current?.click() }}>Choose File</Button>
                    </div>
                  )}
                </div>
                {uploadResult && (
                  <div className={cn('flex items-center gap-2 p-3 rounded-lg border', uploadResult.success ? 'border-green-700 bg-green-900/10' : 'border-red-700 bg-red-900/10')}>
                    {uploadResult.success ? <CheckCircle className="w-5 h-5 text-green-400 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
                    <span className={cn('text-sm', uploadResult.success ? 'text-green-300' : 'text-red-300')}>{uploadResult.message}</span>
                  </div>
                )}
                <form onSubmit={handleUploadNewVersion} className="space-y-2">
                  <Button type="submit" disabled={!deployFile || uploading}>
                    {uploading ? <><Loader className="w-4 h-4 mr-1 animate-spin" />Uploading…</> : <><Upload className="w-4 h-4 mr-1" />Upload New Version</>}
                  </Button>
                  <p className="text-sm text-muted-foreground">New version will be uploaded but not activated automatically</p>
                </form>
              </TabsContent>

              <TabsContent value="cli" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">Deploy your function directly from the command line using the Invoke CLI.</p>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">1. Install the CLI</p>
                    <pre className="bg-muted rounded-md p-3 text-sm font-mono text-foreground overflow-x-auto">npm install -g @invoke/cli</pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">2. Deploy your function</p>
                    <pre className="bg-muted rounded-md p-3 text-sm font-mono text-foreground overflow-x-auto">{`invoke function:deploy \\\n  --function-id ${id} \\\n  --file ./function.zip`}</pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Or deploy from a directory</p>
                    <pre className="bg-muted rounded-md p-3 text-sm font-mono text-foreground overflow-x-auto">{`invoke function:deploy \\\n  --function-id ${id} \\\n  --dir ./my-function`}</pre>
                  </div>
                </div>
                <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                  <p className="text-blue-300 text-sm">Run <code className="text-blue-200 bg-blue-900/50 px-1 rounded">invoke --help</code> to see all available options.</p>
                </div>
              </TabsContent>
            </Tabs>
        </Modal>

        {/* ── Edit Function Modal ───────────────────────────────────────── */}
        <Modal
          isOpen={editHeaderModalOpen}
          title="Edit Function"
          onCancel={() => setEditHeaderModalOpen(false)}
          hideFooter
          className="max-w-lg"
        >
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="function-name">Name</Label>
                <Input
                  id="function-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Function name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="function-description">Description</Label>
                <Textarea
                  id="function-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Enter function description…"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={saveHeader} disabled={headerSaving}>
                  {headerSaving ? <><Loader className="w-4 h-4 mr-1 animate-spin" />Saving…</> : <><Save className="w-4 h-4 mr-1" />Save</>}
                </Button>
                <Button variant="outline" onClick={() => setEditHeaderModalOpen(false)}>
                  <X className="w-4 h-4 mr-1" />Cancel
                </Button>
              </div>
            </div>
        </Modal>

        {/* ── Retention Configure Modal ─────────────────────────────────── */}
        <Modal
          isOpen={retentionModalOpen}
          title={<span className="flex items-center gap-2"><Clock className="w-5 h-5" />Execution Log Retention</span>}
          onCancel={() => setRetentionModalOpen(false)}
          hideFooter
          className="max-w-md"
        >
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                <Switch
                  checked={retentionDraft.retention_enabled}
                  onCheckedChange={(v) => setRetentionDraft(prev => ({ ...prev, retention_enabled: v }))}
                />
                <Label>Use custom retention settings for this function</Label>
              </div>
              {retentionDraft.retention_enabled && (
                <div className="space-y-4 pl-6 border-l border-border">
                  <div className="space-y-1.5">
                    <Label>Retention Type</Label>
                    <Select value={retentionDraft.retention_type} onValueChange={(v) => setRetentionDraft(prev => ({ ...prev, retention_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time">Time-based (days)</SelectItem>
                        <SelectItem value="count">Count-based (number of logs)</SelectItem>
                        <SelectItem value="none">No cleanup</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {retentionDraft.retention_type !== 'none' && (
                    <div className="space-y-1.5">
                      <Label>Retention Value</Label>
                      <Input
                        type="number"
                        value={retentionDraft.retention_value}
                        onChange={(e) => setRetentionDraft(prev => ({ ...prev, retention_value: parseInt(e.target.value) || 1 }))}
                        min="1"
                      />
                      <p className="text-xs text-muted-foreground">
                        {retentionDraft.retention_type === 'time' ? 'Number of days to keep logs' : 'Maximum number of logs to keep'}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {!retentionDraft.retention_enabled && (
                <p className="text-sm text-muted-foreground pl-6">This function will use global retention settings</p>
              )}
              <div className="flex gap-2 pt-2">
                <Button onClick={saveRetentionSettings} disabled={retentionSaving}>
                  {retentionSaving ? <><Loader className="w-4 h-4 mr-1 animate-spin" />Saving…</> : <><Save className="w-4 h-4 mr-1" />Save</>}
                </Button>
                <Button variant="outline" onClick={() => setRetentionModalOpen(false)}><X className="w-4 h-4 mr-1" />Cancel</Button>
              </div>
            </div>
        </Modal>
      </Layout>
      </TooltipProvider>
    </ProtectedRoute>
  )
}
