import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../../components/Layout'
import ProtectedRoute from '../../../components/ProtectedRoute'
import { 
  Package, 
  Edit, 
  Save, 
  X, 
  Copy, 
  Check, 
  Key, 
  RefreshCw, 
  Activity,
  Calendar,
  Clock,
  AlertCircle,
  Filter,
  ChevronLeft,
  ChevronRight,
  Upload,
  Code2,
  ChevronDown,
  MoreVertical,
  Trash2,
  History,
  Timer
} from 'lucide-react'
import { getFunctionUrl } from '../../../lib/frontend-utils'

interface Function {
  id: string
  name: string
  description: string
  version: string
  file_size: number
  is_active: boolean
  created_at: string
  last_executed: string | null
  execution_count: number
  requires_api_key: boolean
  active_version_id?: string
  api_key?: string
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

export default function FunctionDetails() {
  const router = useRouter()
  const { id } = router.query
  
  const [functionData, setFunctionData] = useState<Function | null>(null)
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([])
  const [functionUrl, setFunctionUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({ 
    name: '', 
    description: '',
    requires_api_key: false,
    retention_enabled: false,
    retention_type: 'time',
    retention_value: 7,
    schedule_enabled: false,
    schedule_cron: ''
  })
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [regeneratingKey, setRegeneratingKey] = useState(false)
  
  // Retention settings state
  const [retentionSettings, setRetentionSettings] = useState({
    retention_type: null,
    retention_value: null,
    retention_enabled: false
  })
  const [retentionLoading, setRetentionLoading] = useState(false)
  const [retentionSaving, setRetentionSaving] = useState(false)
  
  // Schedule settings state
  const [scheduleSettings, setScheduleSettings] = useState({
    schedule_enabled: false,
    schedule_cron: '',
    next_execution: null,
    last_scheduled_execution: null
  })
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  
  // Execution logs pagination state
  const [logsPagination, setLogsPagination] = useState<LogsPaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    limit: 10,
    hasNextPage: false,
    hasPrevPage: false
  })
  const [logsCurrentPage, setLogsCurrentPage] = useState(1)
  const [logsPageSize, setLogsPageSize] = useState(10)
  const [logsFilter, setLogsFilter] = useState<'all' | 'success' | 'error'>('all')
  
  // Get function URL dynamically
  useEffect(() => {
    if (functionData?.id) {
      getFunctionUrl(functionData.id).then(setFunctionUrl)
    }
  }, [functionData?.id])
  const [logsLoading, setLogsLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    if (id) {
      fetchFunctionData()
      fetchExecutionLogs()
      fetchRetentionSettings()
      fetchScheduleSettings()
    }
  }, [id])

  // Separate useEffect for logs pagination
  useEffect(() => {
    if (id) {
      fetchExecutionLogs()
    }
  }, [logsCurrentPage, logsPageSize, logsFilter])

  const fetchFunctionData = async () => {
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth-token='))
        ?.split('=')[1]

      const response = await fetch(`/api/functions/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await response.json()

      if (result.success) {
        setFunctionData(result.data)
        // Fetch retention settings and schedule settings for editData
        const retentionResponse = await fetch(`/api/functions/${id}/retention`)
        const retentionData = await retentionResponse.json()
        
        const scheduleResponse = await fetch(`/api/functions/${id}/schedule`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        const scheduleData = await scheduleResponse.json()
        
        setEditData({
          name: result.data.name,
          description: result.data.description || '',
          requires_api_key: result.data.requires_api_key,
          retention_enabled: retentionData.success ? retentionData.data.retention_enabled : false,
          retention_type: retentionData.success ? (retentionData.data.retention_type || 'time') : 'time',
          retention_value: retentionData.success ? (retentionData.data.retention_value || 7) : 7,
          schedule_enabled: scheduleData.success ? scheduleData.data.schedule_enabled : false,
          schedule_cron: scheduleData.success ? (scheduleData.data.schedule_cron || '') : ''
        })
        
        if (retentionData.success) {
          setRetentionSettings(retentionData.data)
        }
        if (scheduleData.success) {
          setScheduleSettings(scheduleData.data)
        }
      }
    } catch (error) {
      console.error('Error fetching function:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchExecutionLogs = async (page = logsCurrentPage, limit = logsPageSize, statusFilter = logsFilter) => {
    setLogsLoading(true)
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth-token='))
        ?.split('=')[1]

      const response = await fetch(`/api/functions/${id}/logs?page=${page}&limit=${limit}&status=${statusFilter}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await response.json()

      if (result.success && result.data) {
        setExecutionLogs(result.data.logs || [])
        setLogsPagination(result.data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
          limit: 10,
          hasNextPage: false,
          hasPrevPage: false
        })
      } else {
        setExecutionLogs([])
      }
    } catch (error) {
      console.error('Error fetching logs:', error)
      setExecutionLogs([])
    } finally {
      setLogsLoading(false)
    }
  }

  // Logs pagination handler functions
  const handleLogsPageChange = (newPage: number) => {
    setLogsCurrentPage(newPage)
  }

  const handleLogsPageSizeChange = (newPageSize: number) => {
    setLogsPageSize(newPageSize)
    setLogsCurrentPage(1) // Reset to first page when changing page size
  }

  const handleLogsFilterChange = (newFilter: 'all' | 'success' | 'error') => {
    setLogsFilter(newFilter)
    setLogsCurrentPage(1) // Reset to first page when changing filter
  }

  const handleLogsRefresh = () => {
    fetchExecutionLogs(logsCurrentPage, logsPageSize, logsFilter)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth-token='))
        ?.split('=')[1]

      // Save function details
      const functionResponse = await fetch(`/api/functions/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editData.name,
          description: editData.description,
          requires_api_key: editData.requires_api_key
        })
      })

      // Save retention settings
      const retentionResponse = await fetch(`/api/functions/${id}/retention`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          retention_enabled: editData.retention_enabled,
          retention_type: editData.retention_type,
          retention_value: editData.retention_value
        })
      })

      // Save schedule settings
      const scheduleResponse = await fetch(`/api/functions/${id}/schedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          schedule_enabled: editData.schedule_enabled,
          schedule_cron: editData.schedule_cron
        })
      })

      if (functionResponse.ok && retentionResponse.ok && scheduleResponse.ok) {
        await fetchFunctionData()
        setEditing(false)
      } else {
        // Handle specific errors
        if (!functionResponse.ok) {
          const functionError = await functionResponse.json()
          alert('Failed to save function details: ' + (functionError.error || functionError.message || 'Unknown error'))
        }
        if (!retentionResponse.ok) {
          const retentionError = await retentionResponse.json()
          alert('Failed to save retention settings: ' + (retentionError.error || retentionError.message || 'Unknown error'))
        }
        if (!scheduleResponse.ok) {
          const scheduleError = await scheduleResponse.json()
          alert('Failed to save schedule settings: ' + (scheduleError.error || scheduleError.message || 'Unknown error'))
        }
      }
    } catch (error) {
      console.error('Error saving function:', error)
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const regenerateApiKey = async () => {
    setRegeneratingKey(true)
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth-token='))
        ?.split('=')[1]

      const response = await fetch(`/api/functions/${id}/regenerate-key`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        await fetchFunctionData()
      }
    } catch (error) {
      console.error('Error regenerating API key:', error)
    } finally {
      setRegeneratingKey(false)
    }
  }

  const toggleApiKeyRequirement = async () => {
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth-token='))
        ?.split('=')[1]

      if (!token) {
        console.error('No auth token found')
        return
      }

      const response = await fetch(`/api/functions/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          requires_api_key: !functionData?.requires_api_key 
        })
      })

      if (response.ok) {
        await fetchFunctionData()
      } else {
        console.error('Failed to update API key requirement:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error updating API key requirement:', error)
    }
  }

  const toggleActiveStatus = async () => {
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth-token='))
        ?.split('=')[1]

      if (!token) {
        console.error('No auth token found')
        return
      }

      const response = await fetch(`/api/functions/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          is_active: !functionData?.is_active 
        })
      })

      if (response.ok) {
        await fetchFunctionData()
      } else {
        console.error('Failed to update function status:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error updating function status:', error)
    }
  }

  const deleteFunction = async () => {
    if (!confirm('Are you sure you want to delete this function? This action cannot be undone.')) return

    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth-token='))
        ?.split('=')[1]

      const response = await fetch(`/api/functions/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        // Navigate back to functions list after successful deletion
        router.push('/admin/functions')
      } else {
        console.error('Failed to delete function')
      }
    } catch (error) {
      console.error('Error deleting function:', error)
    }
  }

  const fetchRetentionSettings = async () => {
    setRetentionLoading(true)
    try {
      const response = await fetch(`/api/functions/${id}/retention`)
      const data = await response.json()
      
      if (data.success) {
        setRetentionSettings(data.data)
      }
    } catch (error) {
      console.error('Error fetching retention settings:', error)
    } finally {
      setRetentionLoading(false)
    }
  }

  const updateRetentionSettings = async (newSettings: any) => {
    setRetentionSaving(true)
    try {
      const response = await fetch(`/api/functions/${id}/retention`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newSettings)
      })

      const data = await response.json()
      
      if (data.success) {
        await fetchRetentionSettings()
      } else {
        console.error('Failed to update retention settings:', data.message)
      }
    } catch (error) {
      console.error('Error updating retention settings:', error)
    } finally {
      setRetentionSaving(false)
    }
  }

  const fetchScheduleSettings = async () => {
    setScheduleLoading(true)
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth-token='))
        ?.split('=')[1]

      const response = await fetch(`/api/functions/${id}/schedule`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()
      
      if (data.success) {
        setScheduleSettings(data.data)
      }
    } catch (error) {
      console.error('Error fetching schedule settings:', error)
    } finally {
      setScheduleLoading(false)
    }
  }

  const updateScheduleSettings = async (newSettings: any) => {
    setScheduleSaving(true)
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth-token='))
        ?.split('=')[1]

      const response = await fetch(`/api/functions/${id}/schedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newSettings)
      })

      const data = await response.json()
      
      if (data.success) {
        await fetchScheduleSettings()
      } else {
        const errorMessage = data.error || data.message || 'Unknown error'
        console.error('Failed to update schedule settings:', errorMessage)
        alert('Failed to update schedule settings: ' + errorMessage)
      }
    } catch (error) {
      console.error('Error updating schedule settings:', error)
      alert('Error updating schedule settings')
    } finally {
      setScheduleSaving(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const formatBytes = (bytes: number) => {
    if (bytes == null || isNaN(bytes)) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout>
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">Loading function details...</div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  if (!functionData) {
    return (
      <ProtectedRoute>
        <Layout>
          <div className="flex items-center justify-center h-64">
            <div className="text-red-400">Function not found</div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Layout title={`${functionData?.name || 'Function'}`}>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-100 flex items-center">
                <Package className="w-8 h-8 mr-3" />
                {editing ? (
                  <input
                    type="text"
                    value={editData.name}
                    onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-2xl"
                  />
                ) : (
                  functionData.name
                )}
              </h1>
              <p className="text-gray-400 mt-2">
                Function ID: {functionData.id}
              </p>
            </div>
            
            <div className="flex space-x-2">
              {editing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary flex items-center"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false)
                      setEditData({
                        name: functionData.name,
                        description: functionData.description || '',
                        requires_api_key: functionData.requires_api_key,
                        retention_enabled: retentionSettings.retention_enabled,
                        retention_type: retentionSettings.retention_type || 'time',
                        retention_value: retentionSettings.retention_value || 7
                      })
                    }}
                    className="btn-secondary flex items-center"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="btn-secondary flex items-center"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </button>

                  {/* Actions Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="btn-primary flex items-center h-[40px]"
                    >
                      <MoreVertical className="w-4 h-4 mr-2" />
                      <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${
                        dropdownOpen ? 'rotate-180' : ''
                      }`} />
                    </button>

                    {dropdownOpen && (
                      <>
                        {/* Backdrop */}
                        <div 
                          className="fixed inset-0 z-10"
                          onClick={() => setDropdownOpen(false)}
                        />
                        
                        {/* Dropdown Menu */}
                        <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-20">
                          <div className="py-1">
                            <button
                              onClick={() => {
                                // Navigate to code editor for the current active version
                                if (functionData.active_version_id) {
                                  router.push(`/admin/functions/${id}/versions/${functionData.active_version_id}/edit`)
                                }
                                setDropdownOpen(false)
                              }}
                              disabled={!functionData.active_version_id}
                              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center disabled:text-gray-500 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                              <Code2 className="w-4 h-4 mr-3" />
                              View Source
                            </button>
                            
                            <button
                              onClick={() => {
                                router.push(`/admin/functions/${id}/versioning`)
                                setDropdownOpen(false)
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center"
                            >
                              <History className="w-4 h-4 mr-3" />
                              Versioning
                            </button>
                            
                            <hr className="border-gray-700 my-1" />
                            
                            <button
                              onClick={() => {
                                toggleActiveStatus()
                                setDropdownOpen(false)
                              }}
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 flex items-center ${
                                functionData.is_active 
                                  ? 'text-red-400 hover:text-red-300' 
                                  : 'text-green-400 hover:text-green-300'
                              }`}
                            >
                              {functionData.is_active ? (
                                <>
                                  <X className="w-4 h-4 mr-3" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <Check className="w-4 h-4 mr-3" />
                                  Activate
                                </>
                              )}
                            </button>
                            
                            <hr className="border-gray-700 my-1" />
                            
                            <button
                              onClick={() => {
                                deleteFunction()
                                setDropdownOpen(false)
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-gray-700 flex items-center"
                            >
                              <Trash2 className="w-4 h-4 mr-3" />
                              Delete Function
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Function Info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Basic Information */}
            <div className="card lg:col-span-2">
              <h2 className="text-xl font-semibold text-gray-100 mb-4">Function Information</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description
                  </label>
                  {editing ? (
                    <textarea
                      value={editData.description}
                      onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-gray-100"
                      rows={3}
                      placeholder="Enter function description..."
                    />
                  ) : (
                    <p className="text-gray-400">
                      {functionData.description || 'No description provided'}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Version
                    </label>
                    <p className="text-gray-400">v{functionData.version}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      File Size
                    </label>
                    <p className="text-gray-400">{formatBytes(functionData.file_size)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Created
                    </label>
                    <p className="text-gray-400 flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      {formatDate(functionData.created_at)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Last Executed
                    </label>
                    <p className="text-gray-400 flex items-center">
                      <Clock className="w-4 h-4 mr-2" />
                      {functionData.last_executed ? formatDate(functionData.last_executed) : 'Never'}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Execution Count
                  </label>
                  <p className="text-gray-400 flex items-center">
                    <Activity className="w-4 h-4 mr-2" />
                    {functionData.execution_count} times
                  </p>
                </div>
              </div>
            </div>

            {/* Function URL & API Key */}
            <div className="space-y-6">
              {/* Function URL */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-100 mb-4">Function URL</h3>
                
                <div className="space-y-3">
                  <div className="flex">
                    <input
                      type="text"
                      value={functionUrl}
                      readOnly
                      className="flex-1 bg-gray-800 border border-gray-600 rounded-l px-3 py-2 text-sm text-gray-300 font-mono min-w-px"
                    />
                    <button
                      onClick={() => copyToClipboard(functionUrl)}
                      className="bg-primary-600 hover:bg-primary-700 px-3 py-2 rounded-r transition-colors"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-white" />
                      ) : (
                        <Copy className="w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>
                  
                  <p className="text-xs text-gray-500">
                    Use this URL to execute your function via HTTP requests
                  </p>
                </div>
              </div>

              {/* API Key Management */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center">
                  <Key className="w-5 h-5 mr-2" />
                  API Key Authentication
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="requiresApiKey"
                      checked={editing ? editData.requires_api_key : functionData.requires_api_key}
                      onChange={editing ? (e) => {
                        setEditData(prev => ({
                          ...prev,
                          requires_api_key: e.target.checked
                        }))
                      } : undefined}
                      disabled={!editing}
                      className="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500 focus:ring-2 disabled:bg-gray-800 disabled:cursor-not-allowed"
                    />
                    <label htmlFor="requiresApiKey" className="ml-2 text-sm text-gray-300">
                      Require API key for execution
                    </label>
                  </div>

                  {(editing ? editData.requires_api_key : functionData.requires_api_key) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        API Key
                      </label>
                      <div className="flex">
                        <input
                          type="text"
                          value={functionData.api_key || 'No API key set'}
                          readOnly
                          className="flex-1 bg-gray-800 border border-gray-600 rounded-l px-3 py-2 text-sm text-gray-300 font-mono min-w-px"
                        />
                        <button
                          onClick={() => copyToClipboard(functionData.api_key || '')}
                          className="bg-gray-700 hover:bg-gray-600 px-3 py-2 border-t border-b border-gray-600 transition-colors"
                        >
                          <Copy className="w-4 h-4 text-gray-300" />
                        </button>
                        <button
                          onClick={editing ? regenerateApiKey : undefined}
                          disabled={regeneratingKey || !editing}
                          className="bg-yellow-600 hover:bg-yellow-700 px-3 py-2 rounded-r transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className={`w-4 h-4 text-white ${regeneratingKey ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Include this key in requests as: Authorization: Bearer &lt;key&gt; or ?api_key=&lt;key&gt;
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Retention Settings */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              Execution Log Retention
            </h3>
            
            {retentionLoading ? (
              <div className="text-center py-4">
                <div className="text-gray-400">Loading retention settings...</div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="retentionEnabled"
                    checked={editing ? editData.retention_enabled : retentionSettings.retention_enabled}
                    onChange={editing ? (e) => {
                      setEditData(prev => ({
                        ...prev,
                        retention_enabled: e.target.checked
                      }))
                    } : undefined}
                    disabled={!editing}
                    className="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500 focus:ring-2 disabled:bg-gray-800 disabled:cursor-not-allowed"
                  />
                  <label htmlFor="retentionEnabled" className="ml-2 text-sm text-gray-300">
                    Use custom retention settings for this function
                  </label>
                </div>

                {(editing ? editData.retention_enabled : retentionSettings.retention_enabled) && (
                  <div className="space-y-4 pl-6 border-l border-gray-600">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Retention Type
                      </label>
                      <select
                        value={editing ? editData.retention_type : (retentionSettings.retention_type || 'time')}
                        onChange={editing ? (e) => {
                          setEditData(prev => ({
                            ...prev,
                            retention_type: e.target.value
                          }))
                        } : undefined}
                        disabled={!editing || retentionSaving}
                        className="block w-full bg-gray-800 border-2 border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-100 disabled:bg-gray-700 disabled:text-gray-400 disabled:border-gray-700 disabled:cursor-not-allowed px-3 py-2"
                      >
                        <option value="time">Time-based (days)</option>
                        <option value="count">Count-based (number of logs)</option>
                        <option value="none">No cleanup</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Retention Value
                      </label>
                      <input
                        type="number"
                        value={editing ? editData.retention_value : (retentionSettings.retention_value || 7)}
                        onChange={editing ? (e) => {
                          setEditData(prev => ({
                            ...prev,
                            retention_value: parseInt(e.target.value)
                          }))
                        } : undefined}
                        disabled={!editing || retentionSaving || (editing ? editData.retention_type === 'none' : retentionSettings.retention_type === 'none')}
                        min="1"
                        className="block w-full bg-gray-800 border-2 border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-100 disabled:bg-gray-700 disabled:text-gray-400 disabled:border-gray-700 disabled:cursor-not-allowed px-3 py-2"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        {(editing ? editData.retention_type === 'time' : retentionSettings.retention_type === 'time') && 'Number of days to keep logs'}
                        {(editing ? editData.retention_type === 'count' : retentionSettings.retention_type === 'count') && 'Maximum number of logs to keep'}
                      </p>
                    </div>
                  </div>
                )}
                
                {!retentionSettings.retention_enabled && (
                  <p className="text-sm text-gray-500 pl-6">
                    This function will use global retention settings
                  </p>
                )}
                
                {retentionSaving && (
                  <div className="text-sm text-blue-400">Saving retention settings...</div>
                )}
              </div>
            )}
          </div>

          {/* Schedule Settings */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center">
              <Timer className="w-5 h-5 mr-2" />
              Schedule
            </h3>
            
            {scheduleLoading ? (
              <div className="text-gray-400">Loading schedule settings...</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="scheduleEnabled"
                    checked={editing ? editData.schedule_enabled : scheduleSettings.schedule_enabled}
                    onChange={editing ? (e) => {
                      setEditData(prev => ({
                        ...prev,
                        schedule_enabled: e.target.checked
                      }))
                    } : undefined}
                    disabled={!editing}
                    className="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500 focus:ring-2 disabled:bg-gray-800 disabled:cursor-not-allowed"
                  />
                  <label htmlFor="scheduleEnabled" className="ml-3 text-sm font-medium text-gray-300">
                    Enable Scheduling
                  </label>
                </div>

                {(editing ? editData.schedule_enabled : scheduleSettings.schedule_enabled) && (
                  <div className="space-y-4 pl-6 border-l border-gray-600">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Cron Expression
                      </label>
                      <input
                        type="text"
                        value={editing ? editData.schedule_cron : (scheduleSettings.schedule_cron || '')}
                        onChange={editing ? (e) => {
                          setEditData(prev => ({
                            ...prev,
                            schedule_cron: e.target.value
                          }))
                        } : undefined}
                        disabled={!editing}
                        placeholder="*/5 * * * *"
                        className="block w-full bg-gray-800 border-2 border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-100 disabled:bg-gray-700 disabled:text-gray-400 disabled:border-gray-700 disabled:cursor-not-allowed px-3 py-2 font-mono"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Format: minute hour day month weekday (e.g., "*/5 * * * *" runs every 5 minutes)
                      </p>
                    </div>

                    {!editing && scheduleSettings.next_execution && (
                      <div className="text-sm text-gray-400">
                        <strong>Next execution:</strong> {formatDate(scheduleSettings.next_execution)}
                      </div>
                    )}

                    {!editing && scheduleSettings.last_scheduled_execution && (
                      <div className="text-sm text-gray-400">
                        <strong>Last scheduled execution:</strong> {formatDate(scheduleSettings.last_scheduled_execution)}
                      </div>
                    )}
                  </div>
                )}
                
                {!(editing ? editData.schedule_enabled : scheduleSettings.schedule_enabled) && (
                  <p className="text-sm text-gray-500 pl-6">
                    Enable scheduling to run this function automatically at specified intervals
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Execution Logs */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-100 flex items-center">
                <Activity className="w-5 h-5 mr-2" />
                Execution Logs
                <span className="ml-2 text-sm bg-gray-700 px-2 py-1 rounded">
                  {logsFilter === 'all' ? `${logsPagination.totalCount} total entries` : `${logsPagination.totalCount} ${logsFilter} entries`}
                </span>
              </h2>
              
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={logsFilter}
                    onChange={(e) => handleLogsFilterChange(e.target.value as any)}
                    className="block bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-100"
                  >
                    <option value="all">All Status</option>
                    <option value="success">Success Only</option>
                    <option value="error">Errors Only</option>
                  </select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-400">Show:</span>
                  <select
                    value={logsPageSize}
                    onChange={(e) => handleLogsPageSizeChange(parseInt(e.target.value))}
                    className="block bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-100"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                
                <button
                  onClick={handleLogsRefresh}
                  disabled={logsLoading}
                  className="btn-secondary flex items-center text-sm"
                >
                  <Activity className="w-4 h-4 mr-1" />
                  Refresh
                </button>
              </div>
            </div>

            {executionLogs.length === 0 && !logsLoading ? (
              <div className="text-center py-8">
                <Activity className="w-12 h-12 mx-auto text-gray-600 mb-4" />
                <p className="text-gray-400">
                  {logsPagination.totalCount === 0 
                    ? 'No execution logs yet' 
                    : `No ${logsFilter} executions found`
                  }
                </p>
                <p className="text-gray-500 text-sm">
                  {logsPagination.totalCount === 0
                    ? 'Logs will appear here after your function is executed'
                    : 'Try adjusting your filter or refresh the logs'
                  }
                </p>
              </div>
            ) : logsLoading ? (
              <div className="text-center py-8">
                <Activity className="w-12 h-12 mx-auto text-gray-600 mb-4 animate-spin" />
                <p className="text-gray-400">Loading execution logs...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-300">Timestamp</th>
                      <th className="text-left py-3 px-4 text-gray-300">Status</th>
                      <th className="text-left py-3 px-4 text-gray-300">Duration</th>
                      <th className="text-left py-3 px-4 text-gray-300">Request Size</th>
                      <th className="text-left py-3 px-4 text-gray-300">Response Size</th>
                      <th className="text-left py-3 px-4 text-gray-300">Client IP</th>
                      <th className="text-left py-3 px-4 text-gray-300">Error</th>
                      <th className="text-left py-3 px-4 text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executionLogs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="py-3 px-4 text-gray-400">
                          {formatDate(log.executed_at)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            log.status_code >= 200 && log.status_code < 300
                              ? 'bg-green-900/50 text-green-400'
                              : log.status_code >= 400
                              ? 'bg-red-900/50 text-red-400'
                              : 'bg-yellow-900/50 text-yellow-400'
                          }`}>
                            {log.status_code}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          {log.execution_time_ms}ms
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          {formatBytes(log.request_size)}
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          {formatBytes(log.response_size)}
                        </td>
                        <td className="py-3 px-4 text-gray-400 font-mono">
                          {log.client_ip}
                        </td>
                        <td className="py-3 px-4">
                          {log.error_message ? (
                            <div className="flex items-center text-red-400">
                              <AlertCircle className="w-4 h-4 mr-1" />
                              <span className="text-xs" title={log.error_message}>
                                {log.error_message.substring(0, 30)}...
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => router.push(`/admin/functions/${id}/execution-logs/${log.id}`)}
                            className="text-blue-400 hover:text-blue-300 text-sm flex items-center"
                          >
                            <Activity className="w-4 h-4 mr-1" />
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Pagination Controls */}
            {logsPagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-700">
                <div className="text-sm text-gray-400">
                  Showing {((logsPagination.currentPage - 1) * logsPagination.limit) + 1} to {Math.min(logsPagination.currentPage * logsPagination.limit, logsPagination.totalCount)} of {logsPagination.totalCount} results
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleLogsPageChange(logsCurrentPage - 1)}
                    disabled={!logsPagination.hasPrevPage || logsLoading}
                    className="p-2 text-gray-400 hover:text-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, logsPagination.totalPages) }, (_, i) => {
                      let pageNum;
                      if (logsPagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (logsPagination.currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (logsPagination.currentPage >= logsPagination.totalPages - 2) {
                        pageNum = logsPagination.totalPages - 4 + i;
                      } else {
                        pageNum = logsPagination.currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handleLogsPageChange(pageNum)}
                          disabled={logsLoading}
                          className={`px-3 py-1 text-sm rounded ${
                            pageNum === logsPagination.currentPage
                              ? 'bg-primary-600 text-white'
                              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                          } disabled:cursor-not-allowed`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  
                  <button
                    onClick={() => handleLogsPageChange(logsCurrentPage + 1)}
                    disabled={!logsPagination.hasNextPage || logsLoading}
                    className="p-2 text-gray-400 hover:text-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}