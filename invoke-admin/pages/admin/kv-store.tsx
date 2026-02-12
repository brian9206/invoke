import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'
import { authenticatedFetch } from '@/lib/frontend-utils'
import {
  Database,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  Search,
  Download,
  Upload,
  AlertCircle,
  Loader
} from 'lucide-react'

interface KVItem {
  key: string
  value: any
  size?: number
}

interface StorageInfo {
  bytes: number
  limit: number
  percentage: number
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function KVStore() {
  const { user } = useAuth()
  const { activeProject } = useProject()
  
  const [items, setItems] = useState<KVItem[]>([])
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({ bytes: 0, limit: 0, percentage: 0 })
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [dialogState, setDialogState] = useState<{ type: 'alert' | 'confirm' | null; title: string; message: string; onConfirm?: () => void }>({ type: null, title: '', message: '' })
  
  // Add/Edit state
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ key: '', value: '' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  
  // Import state
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importStrategy, setImportStrategy] = useState<'merge' | 'replace'>('merge')
  const [importing, setImporting] = useState(false)
  
  // Fetch KV store data
  useEffect(() => {
    if (user && activeProject && activeProject.id !== 'system') {
      fetchKVStore()
    } else {
      setLoading(false)
    }
  }, [activeProject, user, pagination.page, searchQuery])
  
  const fetchKVStore = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      })
      if (searchQuery) {
        params.append('search', searchQuery)
      }
      
      const response = await authenticatedFetch(
        `/api/projects/${activeProject!.id}/kv?${params}`
      )
      const data = await response.json()
      
      if (data.success) {
        setItems(data.data.items)
        setStorageInfo(data.data.storage)
        setPagination(data.data.pagination)
      }
    } catch (error) {
      console.error('Error fetching KV store:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 1 }))
    setSearchQuery(searchInput)
  }
  
  const handleSearchClear = () => {
    setSearchInput('')
    setSearchQuery('')
    setPagination(prev => ({ ...prev, page: 1 }))
  }
  
  const handleSaveItem = async () => {
    if (!formData.key.trim()) {
      setFormError('Key is required')
      return
    }
    
    try {
      setSaving(true)
      setFormError('')
      
      // Parse value as JSON if possible
      let parsedValue = formData.value
      try {
        parsedValue = JSON.parse(formData.value)
      } catch {
        // Keep as string if not valid JSON
      }
      
      const response = await authenticatedFetch(
        `/api/projects/${activeProject!.id}/kv`,
        {
          method: 'POST',
          body: JSON.stringify({
            key: formData.key,
            value: parsedValue
          })
        }
      )
      const data = await response.json()
      
      if (data.success) {
        await fetchKVStore()
        setShowAddForm(false)
        setEditingKey(null)
        setFormData({ key: '', value: '' })
      } else {
        setFormError(data.message || 'Failed to save')
      }
    } catch (error: any) {
      setFormError(error.message || 'Error saving item')
    } finally {
      setSaving(false)
    }
  }
  
  const handleDeleteItem = async (key: string) => {
    setDialogState({
      type: 'confirm',
      title: 'Delete Key',
      message: `Delete key "${key}"?`,
      onConfirm: async () => {
        try {
          const response = await authenticatedFetch(
            `/api/projects/${activeProject!.id}/kv?key=${encodeURIComponent(key)}`,
            { method: 'DELETE' }
          )
          const data = await response.json()
          
          if (data.success) {
            await fetchKVStore()
            setDialogState({ type: null, title: '', message: '' })
          }
        } catch (error) {
          console.error('Error deleting item:', error)
        }
      }
    })
  }
  
  const handleEditItem = (item: KVItem) => {
    setEditingKey(item.key)
    setFormData({
      key: item.key,
      value: typeof item.value === 'string' ? item.value : JSON.stringify(item.value, null, 2)
    })
    setShowAddForm(true)
  }
  
  const handleExport = async () => {
    try {
      const response = await authenticatedFetch(
        `/api/projects/${activeProject!.id}/kv-export`
      )
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `kv-export-${activeProject!.id}-${Date.now()}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      } else {
        const errorText = await response.text()
        console.error('Export failed:', errorText)
        setDialogState({ type: 'alert', title: 'Error', message: 'Failed to export KV store' })
      }
    } catch (error) {
      console.error('Error exporting KV store:', error)
      setDialogState({ type: 'alert', title: 'Error', message: 'Failed to export KV store' })
    }
  }
  
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    try {
      setImporting(true)
      const text = await file.text()
      const data = JSON.parse(text)
      
      const response = await authenticatedFetch(
        `/api/projects/${activeProject!.id}/kv-import`,
        {
          method: 'POST',
          body: JSON.stringify({ data, strategy: importStrategy })
        }
      )
      const result = await response.json()
      
      if (result.success) {
        setDialogState({ type: 'alert', title: 'Success', message: `Import successful! ${result.data.imported} new, ${result.data.updated} updated` })
        await fetchKVStore()
        setShowImportDialog(false)
      } else {
        setDialogState({ type: 'alert', title: 'Error', message: `Import failed: ${result.message}` })
      }
    } catch (error: any) {
      setDialogState({ type: 'alert', title: 'Error', message: `Import error: ${error.message}` })
    } finally {
      setImporting(false)
      event.target.value = ''
    }
  }
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }
  
  const formatValue = (value: any) => {
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  }
  
  // System project message
  if (!activeProject || activeProject.id === 'system') {
    return (
      <ProtectedRoute>
        <Layout title="KV Store">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Database className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-300 mb-2">
                Please Select a Project
              </h2>
              <p className="text-gray-400">
                KV Store is not available for the system project. Please select a regular project to manage key-value storage.
              </p>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }
  
  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="KV Store">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
              <div className="flex items-center gap-2">
                <Loader className="w-5 h-5 text-primary-500 animate-spin" />
                <p className="text-gray-400 animate-pulse">Loading KV Store...</p>
              </div>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }
  
  return (
    <ProtectedRoute>
      <Layout title="KV Store">
        <div className="space-y-6">
          {/* Dialog Modal */}
          <Modal
            isOpen={dialogState.type !== null}
            title={dialogState.title}
            description={dialogState.message}
            onCancel={() => setDialogState({ type: null, title: '', message: '' })}
            onConfirm={async () => {
              if (dialogState.onConfirm) {
                await dialogState.onConfirm();
              } else {
                setDialogState({ type: null, title: '', message: '' });
              }
            }}
            cancelText={dialogState.type === 'alert' ? 'OK' : 'Cancel'}
            confirmText={dialogState.type === 'alert' ? undefined : 'Delete'}
            confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
          />

          {/* Header */}
          <PageHeader
            title="Key-Value Store"
            subtitle={`Manage persistent key-value storage for ${activeProject.name}`}
            icon={<Database className="w-8 h-8 text-primary-500" />}
          />
          
          {/* Storage Usage */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-300">Storage Usage</span>
              <span className="text-sm text-gray-400">
                {formatBytes(storageInfo.bytes)} / {formatBytes(storageInfo.limit)}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  storageInfo.percentage > 90 ? 'bg-red-500' :
                  storageInfo.percentage > 75 ? 'bg-yellow-500' : 'bg-primary-500'
                }`}
                style={{ width: `${Math.min(storageInfo.percentage, 100)}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {storageInfo.percentage.toFixed(1)}% used
            </div>
          </div>
          
          {/* Actions Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by key..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleSearch}
                className="btn-secondary px-4"
              >
                Search
              </button>
              {searchQuery && (
                <button
                  onClick={handleSearchClear}
                  className="btn-secondary px-4"
                >
                  Clear
                </button>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowAddForm(true)
                  setEditingKey(null)
                  setFormData({ key: '', value: '' })
                  setFormError('')
                }}
                className="btn-primary flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Key
              </button>
              
              <button
                onClick={handleExport}
                className="btn-secondary flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </button>
              
              <button
                onClick={() => setShowImportDialog(true)}
                className="btn-secondary flex items-center"
              >
                <Upload className="w-4 h-4 mr-2" />
                Import
              </button>
            </div>
          </div>
          
          {/* Add/Edit Form */}
          {showAddForm && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-100">
                  {editingKey ? 'Edit Key' : 'Add New Key'}
                </h3>
                <button
                  onClick={() => {
                    setShowAddForm(false)
                    setEditingKey(null)
                    setFormData({ key: '', value: '' })
                    setFormError('')
                  }}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {formError && (
                <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg flex items-center text-red-300">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  {formError}
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Key
                  </label>
                  <input
                    type="text"
                    value={formData.key}
                    onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                    disabled={editingKey !== null}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-700 disabled:text-gray-500"
                    placeholder="my-key"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Value (JSON or string)
                  </label>
                  <textarea
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    rows={6}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                    placeholder='{"example": "value"} or simple string'
                  />
                </div>
                
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowAddForm(false)
                      setEditingKey(null)
                      setFormData({ key: '', value: '' })
                      setFormError('')
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveItem}
                    disabled={saving}
                    className="btn-primary flex items-center"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Import Dialog */}
          {showImportDialog && (
            <Modal
              isOpen={showImportDialog}
              title="Import KV Store"
              onCancel={() => setShowImportDialog(false)}
              onConfirm={() => {
                const input = document.querySelector('input[data-import-file]') as HTMLInputElement;
                input?.click();
              }}
              cancelText="Cancel"
              confirmText="Select File"
              loading={importing}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Import Strategy
                  </label>
                  <select
                    value={importStrategy}
                    onChange={(e) => setImportStrategy(e.target.value as 'merge' | 'replace')}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="merge">Merge (keep existing keys)</option>
                    <option value="replace">Replace All (delete existing)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {importStrategy === 'merge' 
                      ? 'Existing keys will be preserved unless overwritten by import'
                      : 'All existing keys will be deleted before import'}
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select JSON File
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportFile}
                    disabled={importing}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary-600 file:text-white file:cursor-pointer hover:file:bg-primary-700"
                    data-import-file
                  />
                </div>
              </div>
            </Modal>
          )}
          
          {/* KV Table */}
          <div className="card overflow-hidden">
            {items.length === 0 ? (
              <div className="text-center py-12">
                <Database className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">
                  {searchQuery ? 'No keys match your search' : 'No keys in this project'}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => {
                      setShowAddForm(true)
                      setEditingKey(null)
                      setFormData({ key: '', value: '' })
                    }}
                    className="mt-4 text-primary-400 hover:text-primary-300"
                  >
                    Add your first key
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-800 border-b border-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Key
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Value
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Size
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {items.map((item) => (
                        <tr key={item.key} className="hover:bg-gray-800/50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <code className="text-sm text-primary-400 font-mono">{item.key}</code>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-300 max-w-md truncate font-mono">
                              {formatValue(item.value)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                            {item.size ? formatBytes(item.size) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            <button
                              onClick={() => handleEditItem(item)}
                              className="text-primary-400 hover:text-primary-300 mr-3 transition-colors active:scale-95"
                              title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.key)}
                            className="text-red-400 hover:text-red-300 transition-colors active:scale-95"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {pagination.totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between">
                  <div className="text-sm text-gray-400">
                    Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} keys
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
                      disabled={pagination.page === 1}
                      className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      First
                    </button>
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      disabled={pagination.page === 1}
                      className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="px-4 py-1 bg-gray-800 text-gray-300 rounded">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      disabled={pagination.page === pagination.totalPages}
                      className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.totalPages }))}
                      disabled={pagination.page === pagination.totalPages}
                      className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </>
            )}
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
