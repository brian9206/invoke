import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { Settings, AlertCircle, CheckCircle, Plus, Trash2, Loader } from 'lucide-react'
import { clearFunctionBaseUrlCache, authenticatedFetch } from '@/lib/frontend-utils'
import { useProject } from '@/contexts/ProjectContext'
import toast from 'react-hot-toast'

interface GlobalSettings {
  type: { value: string; description: string }
  value: { value: string; description: string }
  enabled: { value: string; description: string }
  function_base_url: { value: string; description: string }
  kv_storage_limit_bytes: { value: string; description: string }
}

interface CleanupResult {
  deleted: number
  functions: number
}

export default function GlobalSettings() {
  const { lockProject, unlockProject, userProjects } = useProject()
  const hasLockedProject = useRef(false)
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [message, setMessage] = useState('')
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null)
  
  // Form state
  const [retentionType, setRetentionType] = useState('time')
  const [retentionValue, setRetentionValue] = useState('7')
  const [retentionEnabled, setRetentionEnabled] = useState(true)
  const [functionBaseUrl, setFunctionBaseUrl] = useState('https://localhost:3001/invoke')
  const [kvStorageLimitGB, setKvStorageLimitGB] = useState('1')

  useEffect(() => {
    fetchSettings()
  }, [])

  // Lock project to System when on this page
  useEffect(() => {
    const systemProject = userProjects.find(p => p.id === 'system')
    
    if (systemProject && !hasLockedProject.current) {
      hasLockedProject.current = true
      lockProject(systemProject)
    }

    return () => {
      if (hasLockedProject.current) {
        hasLockedProject.current = false
        unlockProject()
      }
    }
  }, [userProjects])

  const fetchSettings = async () => {
    try {
      const response = await authenticatedFetch('/api/admin/global-settings')
      const data = await response.json()
      
      if (data.success) {
        setSettings(data.data)
        setRetentionType(data.data.type.value)
        setRetentionValue(data.data.value.value)
        setRetentionEnabled(data.data.enabled.value === 'true')
        setFunctionBaseUrl(data.data.function_base_url?.value || 'https://localhost:3001/invoke')
        
        // Convert bytes to GB for display
        const kvLimitBytes = parseInt(data.data.kv_storage_limit_bytes?.value || '1073741824')
        const kvLimitGB = (kvLimitBytes / (1024 * 1024 * 1024)).toFixed(2)
        setKvStorageLimitGB(kvLimitGB)
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
      setMessage('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const response = await authenticatedFetch('/api/admin/global-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: retentionType,
          value: parseInt(retentionValue),
          enabled: retentionEnabled,
          function_base_url: functionBaseUrl,
          kv_storage_limit_bytes: Math.floor(parseFloat(kvStorageLimitGB) * 1024 * 1024 * 1024)
        })
      })

      const data = await response.json()
      
      if (data.success) {
        toast.success('Settings saved successfully!')
        clearFunctionBaseUrlCache() // Clear cache so other pages get updated URL
        fetchSettings() // Refresh
      } else {
        toast.error('Failed to save settings: ' + data.message)
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleCleanup = async () => {
    setCleaning(true)
    setMessage('')
    setCleanupResult(null)

    try {
      const response = await authenticatedFetch('/api/admin/cleanup-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      })

      const data = await response.json()
      
      if (data.success) {
        setCleanupResult(data.data)
        toast.success('Cleanup completed successfully!')
      } else {
        toast.error('Cleanup failed: ' + data.message)
      }
    } catch (error) {
      console.error('Error during cleanup:', error)
      toast.error('Cleanup failed')
    } finally {
      setCleaning(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Global Settings">
          <div className="flex justify-center items-center h-64">
            <div className="flex items-center gap-2 text-lg">
              <Loader className="w-6 h-6 text-primary-500 animate-spin" />
              <span className="text-gray-400 animate-pulse">Loading global settings...</span>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Layout title="Global Settings">
        <div className="space-y-6">
          <PageHeader
            title="Global Settings"
            subtitle="Configure default execution log retention settings for all functions"
            icon={<Settings className="w-8 h-8 text-primary-500" />}
          />

          <div className="card max-w-2xl">
            <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              Log Retention Settings
            </h2>

            <form onSubmit={handleSave} className="space-y-6">
              {/* Retention Enabled */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={retentionEnabled}
                    onChange={(e) => setRetentionEnabled(e.target.checked)}
                    className="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500 focus:ring-2"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-300">
                    Enable execution log retention cleanup
                  </span>
                </label>
                <p className="mt-1 text-sm text-gray-500">
                  When enabled, old execution logs will be automatically cleaned up based on the settings below
                </p>
              </div>

              {/* Retention Type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Retention Type
                </label>
                <select
                  value={retentionType}
                  onChange={(e) => setRetentionType(e.target.value)}
                  disabled={!retentionEnabled}
                  className="block w-full bg-gray-800 border-2 border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-100 disabled:bg-gray-700 disabled:text-gray-400 disabled:border-gray-700 px-3 py-2"
                >
                  <option value="time">Time-based (days)</option>
                  <option value="count">Count-based (number of logs)</option>
                  <option value="none">No cleanup</option>
                </select>
                <p className="mt-1 text-sm text-gray-500">
                  {retentionType === 'time' && 'Delete logs older than specified number of days'}
                  {retentionType === 'count' && 'Keep only the most recent N execution logs'}
                  {retentionType === 'none' && 'Never delete execution logs automatically'}
                </p>
              </div>

              {/* Retention Value */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Retention Value
                </label>
                <input
                  type="number"
                  value={retentionValue}
                  onChange={(e) => setRetentionValue(e.target.value)}
                  disabled={!retentionEnabled || retentionType === 'none'}
                  min="1"
                  className="block w-full bg-gray-800 border-2 border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-100 disabled:bg-gray-700 disabled:text-gray-400 disabled:border-gray-700 px-3 py-2"
                />
                <p className="mt-1 text-sm text-gray-500">
                  {retentionType === 'time' && 'Number of days to keep logs'}
                  {retentionType === 'count' && 'Maximum number of logs to keep per function'}
                </p>
              </div>

              {/* Function Base URL */}
              <div className="border-t border-gray-700 pt-6 mt-6">
                <h3 className="text-lg font-medium text-gray-200 mb-4 flex items-center">
                  <Settings className="w-5 h-5 mr-2" />
                  Function URL Settings
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Function Base URL
                  </label>
                  <input
                    type="url"
                    value={functionBaseUrl}
                    onChange={(e) => setFunctionBaseUrl(e.target.value)}
                    placeholder="https://localhost:3001/invoke"
                    className="block w-full bg-gray-800 border-2 border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-100 px-3 py-2"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Base URL used for function invocation endpoints. Function URLs will be displayed as <code className="bg-gray-700 px-1 rounded">{functionBaseUrl}/&lt;function-id&gt;</code>
                  </p>
                </div>
              </div>

              {/* KV Storage Limit */}
              <div className="border-t border-gray-700 pt-6 mt-6">
                <h3 className="text-lg font-medium text-gray-200 mb-4 flex items-center">
                  <Settings className="w-5 h-5 mr-2" />
                  KV Storage Settings
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Default Storage Limit (GB)
                  </label>
                  <input
                    type="number"
                    value={kvStorageLimitGB}
                    onChange={(e) => setKvStorageLimitGB(e.target.value)}
                    min="0.1"
                    step="0.1"
                    placeholder="1"
                    className="block w-full bg-gray-800 border-2 border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-100 px-3 py-2"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Default storage limit for new projects. You can customize the limit for each project individually on the Projects page.
                  </p>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-between items-center pt-4 border-t border-gray-700">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex items-center"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>

                <button
                  type="button"
                  onClick={handleCleanup}
                  disabled={cleaning || !retentionEnabled}
                  className="btn-danger flex items-center disabled:opacity-50"
                >
                  {cleaning ? 'Cleaning...' : 'Run Cleanup Now'}
                </button>
              </div>
            </form>
          </div>

          {/* Message Display */}
          {message && (
            <div className={`card max-w-2xl p-4 ${
              message.includes('success') || message.includes('completed') 
                ? 'bg-green-900/50 border border-green-700 text-green-300'
                : 'bg-red-900/50 border border-red-700 text-red-300'
            }`}>
              {message}
            </div>
          )}

          {/* Cleanup Result */}
          {cleanupResult && (
            <div className="card max-w-2xl">
              <h3 className="text-xl font-semibold text-gray-100 mb-4 flex items-center">
                <Settings className="w-5 h-5 mr-2" />
                Cleanup Results
              </h3>
              <div className="text-gray-300">
                <p>• Deleted {cleanupResult.deleted} execution logs</p>
                <p>• Processed {cleanupResult.functions} functions</p>
              </div>
            </div>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  )
}