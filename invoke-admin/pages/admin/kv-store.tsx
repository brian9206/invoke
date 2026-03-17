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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
  const [dialogState, setDialogState] = useState<{
    type: 'alert' | 'confirm' | null
    title: string
    message: string
    onConfirm?: () => void
  }>({ type: null, title: '', message: '' })

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ key: '', value: '' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importStrategy, setImportStrategy] = useState<'merge' | 'replace'>('merge')
  const [importing, setImporting] = useState(false)

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

      const response = await authenticatedFetch(`/api/projects/${activeProject!.id}/kv?${params}`)
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

      let parsedValue = formData.value
      try {
        parsedValue = JSON.parse(formData.value)
      } catch {
        // Keep as string if not valid JSON
      }

      const response = await authenticatedFetch(`/api/projects/${activeProject!.id}/kv`, {
        method: 'POST',
        body: JSON.stringify({ key: formData.key, value: parsedValue }),
      })
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
      },
    })
  }

  const handleEditItem = (item: KVItem) => {
    setEditingKey(item.key)
    setFormData({
      key: item.key,
      value: typeof item.value === 'string' ? item.value : JSON.stringify(item.value, null, 2),
    })
    setShowAddForm(true)
  }

  const handleExport = async () => {
    try {
      const response = await authenticatedFetch(`/api/projects/${activeProject!.id}/kv-export`)

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
        setDialogState({ type: 'alert', title: 'Error', message: 'Failed to export KV store' })
      }
    } catch (error) {
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

      const response = await authenticatedFetch(`/api/projects/${activeProject!.id}/kv-import`, {
        method: 'POST',
        body: JSON.stringify({ data, strategy: importStrategy }),
      })
      const result = await response.json()

      if (result.success) {
        setDialogState({
          type: 'alert',
          title: 'Success',
          message: `Import successful! ${result.data.imported} new, ${result.data.updated} updated`,
        })
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
    if (bytes == 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  const formatValue = (value: any) => {
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  }

  if (!activeProject || activeProject.id === 'system') {
    return (
      <ProtectedRoute>
        <Layout title="KV Store">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Database className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Please Select a Project</h2>
              <p className="text-muted-foreground">
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
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader className="w-5 h-5 text-primary animate-spin" />
              <p className="animate-pulse">Loading KV Store...</p>
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
          <Modal
            isOpen={dialogState.type !== null}
            title={dialogState.title}
            description={dialogState.message}
            onCancel={() => setDialogState({ type: null, title: '', message: '' })}
            onConfirm={async () => {
              if (dialogState.onConfirm) {
                await dialogState.onConfirm()
              } else {
                setDialogState({ type: null, title: '', message: '' })
              }
            }}
            cancelText={dialogState.type === 'alert' ? 'OK' : 'Cancel'}
            confirmText={dialogState.type === 'alert' ? undefined : 'Delete'}
            confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
          />

          <PageHeader
            title="Key-Value Store"
            subtitle={`Manage persistent key-value storage for ${activeProject.name}`}
            icon={<Database className="w-8 h-8 text-primary" />}
          />

          {/* Storage Usage */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Storage Usage</span>
                <span className="text-sm text-muted-foreground">
                  {formatBytes(storageInfo.bytes)} / {formatBytes(storageInfo.limit)}
                </span>
              </div>
              <Progress
                value={Math.min(storageInfo.percentage, 100)}
                className={
                  storageInfo.percentage > 90
                    ? '[&>div]:bg-red-500'
                    : storageInfo.percentage > 75
                    ? '[&>div]:bg-yellow-500'
                    : ''
                }
              />
              <div className="text-xs text-muted-foreground mt-1">
                {storageInfo.percentage.toFixed(1)}% used
              </div>
            </CardContent>
          </Card>

          {/* Actions Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search by key..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" onClick={handleSearch}>Search</Button>
              {searchQuery && (
                <Button variant="outline" onClick={handleSearchClear}>Clear</Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowAddForm(true)
                  setEditingKey(null)
                  setFormData({ key: '', value: '' })
                  setFormError('')
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Key
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
            </div>
          </div>

          {/* Add/Edit Form */}
          {showAddForm && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-foreground">
                    {editingKey ? 'Edit Key' : 'Add New Key'}
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowAddForm(false)
                      setEditingKey(null)
                      setFormData({ key: '', value: '' })
                      setFormError('')
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {formError && (
                  <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-2 text-red-400">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {formError}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Key</Label>
                    <Input
                      value={formData.key}
                      onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                      disabled={editingKey !== null}
                      placeholder="my-key"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Value (JSON or string)</Label>
                    <Textarea
                      value={formData.value}
                      onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                      rows={6}
                      className="font-mono text-sm"
                      placeholder='{"example": "value"} or simple string'
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowAddForm(false)
                        setEditingKey(null)
                        setFormData({ key: '', value: '' })
                        setFormError('')
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSaveItem} disabled={saving}>
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Import Dialog */}
          {showImportDialog && (
            <Modal
              isOpen={showImportDialog}
              title="Import KV Store"
              onCancel={() => setShowImportDialog(false)}
              onConfirm={() => {
                const input = document.querySelector('input[data-import-file]') as HTMLInputElement
                input?.click()
              }}
              cancelText="Cancel"
              confirmText="Select File"
              loading={importing}
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Import Strategy</Label>
                  <Select
                    value={importStrategy}
                    onValueChange={(v) => setImportStrategy(v as 'merge' | 'replace')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="merge">Merge (keep existing keys)</SelectItem>
                      <SelectItem value="replace">Replace All (delete existing)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {importStrategy === 'merge'
                      ? 'Existing keys will be preserved unless overwritten by import'
                      : 'All existing keys will be deleted before import'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Select JSON File</Label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportFile}
                    disabled={importing}
                    className="w-full px-3 py-2 bg-card border border-border rounded-md text-foreground text-sm file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:text-sm file:cursor-pointer hover:file:opacity-90"
                    data-import-file
                  />
                </div>
              </div>
            </Modal>
          )}

          {/* KV Table */}
          <Card className="overflow-hidden">
            {items.length === 0 ? (
              <CardContent className="py-12 text-center">
                <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {searchQuery ? 'No keys match your search' : 'No keys in this project'}
                </p>
                {!searchQuery && (
                  <Button
                    variant="link"
                    className="mt-2"
                    onClick={() => {
                      setShowAddForm(true)
                      setEditingKey(null)
                      setFormData({ key: '', value: '' })
                    }}
                  >
                    Add your first key
                  </Button>
                )}
              </CardContent>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.key}>
                        <TableCell>
                          <code className="text-sm text-primary font-mono">{item.key}</code>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground max-w-md truncate font-mono">
                            {formatValue(item.value)}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.size ? formatBytes(item.size) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditItem(item)}
                            title="Edit"
                            className="text-primary hover:text-primary"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteItem(item.key)}
                            title="Delete"
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {pagination.totalPages > 1 && (
                  <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                      {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} keys
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
                        disabled={pagination.page === 1}
                      >
                        First
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                        disabled={pagination.page === 1}
                      >
                        Previous
                      </Button>
                      <span className="px-3 py-1.5 text-sm text-muted-foreground">
                        Page {pagination.page} of {pagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                        disabled={pagination.page === pagination.totalPages}
                      >
                        Next
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.totalPages }))}
                        disabled={pagination.page === pagination.totalPages}
                      >
                        Last
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
