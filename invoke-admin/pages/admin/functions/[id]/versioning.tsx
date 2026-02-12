import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import { useProject } from '@/contexts/ProjectContext'
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  ArrowLeft, 
  History,
  Play,
  Pause,
  Calendar,
  HardDrive,
  Hash,
  User,
  Trash2,
  Code2,
  GitBranch,
  Eye,
  Download
} from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'

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

export default function FunctionVersioning() {
  const router = useRouter()
  const { id } = router.query
  const { lockProject, unlockProject } = useProject()
  const hasLockedProject = useRef(false)
  const [dialogState, setDialogState] = useState<{ type: 'alert' | 'confirm' | null; title: string; message: string; onConfirm?: () => void }>({ type: null, title: '', message: '' })
  
  const [functionData, setFunctionData] = useState<any>(null)
  const [versions, setVersions] = useState<FunctionVersion[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [switchingVersion, setSwitchingVersion] = useState<string | null>(null)
  const [deletingVersion, setDeletingVersion] = useState<string | null>(null)
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; data?: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (id) {
      fetchFunctionData()
      fetchVersions()
    }
  }, [id])

  // Lock project when function data loads
  useEffect(() => {
    if (functionData?.project_id && functionData?.project_name && !hasLockedProject.current) {
      hasLockedProject.current = true
      lockProject({
        id: functionData.project_id,
        name: functionData.project_name,
        description: '',
        role: 'locked'
      })
    }
    
    return () => {
      if (hasLockedProject.current) {
        hasLockedProject.current = false
        unlockProject()
      }
    }
  }, [functionData?.project_id, functionData?.project_name])

  const fetchFunctionData = async () => {
    try {
      const response = await authenticatedFetch(`/api/functions/${id}`)
      const result = await response.json()

      if (result.success) {
        setFunctionData(result.data)
      }
    } catch (error) {
      console.error('Error fetching function:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchVersions = async () => {
    try {
      const response = await authenticatedFetch(`/api/functions/${id}/versions`)
      const result = await response.json()

      if (result.success) {
        setVersions(result.data)
      }
    } catch (error) {
      console.error('Error fetching versions:', error)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setUploadResult(null)
    }
  }

  const handleUploadNewVersion = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!file) {
      setUploadResult({ success: false, message: 'Please select a file to upload' })
      return
    }

    setUploading(true)
    setUploadResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await authenticatedFetch(`/api/functions/${id}/versions`, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        setUploadResult({ success: true, message: 'New version uploaded successfully!' })
        setFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        // Refresh versions list
        fetchVersions()
      } else {
        setUploadResult({ success: false, message: result.message || 'Upload failed' })
      }
    } catch (error) {
      setUploadResult({ success: false, message: 'Network error occurred' })
    } finally {
      setUploading(false)
    }
  }

  const handleSwitchVersion = async (versionId: string, version: string) => {
    setDialogState({
      type: 'confirm',
      title: 'Switch Version',
      message: `Are you sure you want to switch to version ${version}?`,
      onConfirm: async () => {
        setSwitchingVersion(versionId)
        
        try {
          const response = await authenticatedFetch(`/api/functions/${id}/switch-version`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ versionId })
          })

          const result = await response.json()

          if (result.success) {
            setUploadResult({ success: true, message: `Switched to version ${version}` })
            // Refresh versions list to update active status
            fetchVersions()
            fetchFunctionData()
            setDialogState({ type: null, title: '', message: '' })
          } else {
            setUploadResult({ success: false, message: result.message || 'Version switch failed' })
          }
        } catch (error) {
          setUploadResult({ success: false, message: 'Network error occurred' })
        } finally {
          setSwitchingVersion(null)
        }
      }
    })
  }

  const handleDeleteVersion = async (versionId: string, versionNumber: number) => {
    setDialogState({
      type: 'confirm',
      title: 'Delete Version',
      message: `Are you sure you want to delete version ${versionNumber}? This action cannot be undone.`,
      onConfirm: async () => {
        setDeletingVersion(versionId)

        try {
          const response = await authenticatedFetch(`/api/functions/${id}/versions?version=${versionNumber}`, {
            method: 'DELETE'
          })

          const result = await response.json()

          if (result.success) {
            setUploadResult({ success: true, message: `Version ${versionNumber} deleted successfully` })
            // Refresh versions list
            fetchVersions()
            setDialogState({ type: null, title: '', message: '' })
          } else {
            setUploadResult({ success: false, message: result.message || 'Failed to delete version' })
          }
        } catch (error) {
          setUploadResult({ success: false, message: 'Network error occurred' })
        } finally {
          setDeletingVersion(null)
        }
      }
    })
  }

  const handleDownloadVersion = async (versionId: string, version: string) => {
    setDownloadingVersion(versionId)
    
    try {
      const response = await authenticatedFetch(`/api/functions/${id}/versions/${versionId}/download`)

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${functionData?.name || 'function'}-v${version}.zip`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      } else {
        console.error('Failed to download version')
      }
    } catch (error) {
      console.error('Error downloading version:', error)
    } finally {
      setDownloadingVersion(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.zip') || droppedFile.name.endsWith('.tar.gz') || droppedFile.name.endsWith('.tgz'))) {
      setFile(droppedFile)
      setUploadResult(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const formatBytes = (bytes: number) => {
    if (bytes == null || isNaN(bytes)) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes == 0) return '0 Bytes'
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

  const activeVersion = versions.find(v => v.is_active)

  return (
    <ProtectedRoute>
      <Layout>
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
            confirmText={dialogState.type === 'alert' ? undefined : 'Continue'}
            confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
          />
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push(`/admin/functions/${id}`)}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <div className="flex-1">
              <PageHeader
                title="Function Versioning"
                subtitle={`Manage versions for ${functionData.name}${activeVersion ? ` - Active: v${activeVersion.version}` : ''}`}
                icon={<GitBranch className="w-8 h-8 text-primary-500" />}
              />
            </div>
          </div>

          {/* Upload New Version */}
          <div className="card max-w-2xl">
            <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center">
              <Upload className="w-5 h-5 mr-2" />
              Upload New Version
            </h2>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                file ? 'border-primary-500 bg-primary-500/10' : 'border-gray-600 hover:border-gray-500'
              }`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="space-y-3">
                  <FileText className="w-12 h-12 mx-auto text-primary-500" />
                  <div>
                    <p className="text-gray-100 font-medium">{file.name}</p>
                    <p className="text-gray-400 text-sm">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                  <button
                    onClick={() => setFile(null)}
                    className="text-gray-400 hover:text-gray-300 text-sm"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="w-12 h-12 mx-auto text-gray-500" />
                  <div>
                    <p className="text-gray-100">
                      Drag and drop your function package here
                    </p>
                    <p className="text-gray-400 text-sm">
                      or click to browse files (.zip, .tar.gz, .tgz)
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.tar.gz,.tgz"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary"
                  >
                    Choose File
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleUploadNewVersion} className="mt-4">
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={!file || uploading}
                  className="btn-primary flex items-center disabled:opacity-50"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload New Version'}
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                New version will be uploaded but not activated automatically
              </p>
            </form>
          </div>

          {/* Upload Result */}
          {uploadResult && (
            <div className={`card max-w-2xl p-4 ${
              uploadResult.success 
                ? 'bg-green-900/50 border border-green-700' 
                : 'bg-red-900/50 border border-red-700'
            }`}>
              <div className="flex items-center">
                {uploadResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-400 mr-2" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
                )}
                <span className={uploadResult.success ? 'text-green-300' : 'text-red-300'}>
                  {uploadResult.message}
                </span>
              </div>
            </div>
          )}

          {/* Versions Table */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center">
              <History className="w-5 h-5 mr-2" />
              Versions
              <span className="ml-2 text-sm bg-gray-700 px-2 py-1 rounded">
                {versions.length} versions
              </span>
            </h2>

            {versions.length === 0 ? (
              <div className="text-center py-8">
                <History className="w-12 h-12 mx-auto text-gray-600 mb-4" />
                <p className="text-gray-400">No versions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-300">Version</th>
                      <th className="text-left py-3 px-4 text-gray-300">Status</th>
                      <th className="text-left py-3 px-4 text-gray-300">Size</th>
                      <th className="text-left py-3 px-4 text-gray-300">Hash</th>
                      <th className="text-left py-3 px-4 text-gray-300">Created</th>
                      <th className="text-left py-3 px-4 text-gray-300">Created By</th>
                      <th className="text-left py-3 px-4 text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((version) => (
                      <tr key={version.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="py-3 px-4">
                          <span className="font-medium text-gray-100">v{version.version}</span>
                        </td>
                        <td className="py-3 px-4">
                          {version.is_active ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-900/50 text-green-400 border border-green-700">
                              <Play className="w-3 h-3 mr-1" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-700 text-gray-400">
                              <Pause className="w-3 h-3 mr-1" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          <div className="flex items-center">
                            <HardDrive className="w-4 h-4 mr-1" />
                            {formatBytes(version.file_size)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          <div className="flex items-center font-mono text-xs">
                            <Hash className="w-4 h-4 mr-1" />
                            {version.package_hash.substring(0, 8)}...
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            {formatDate(version.created_at)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          <div className="flex items-center">
                            <User className="w-4 h-4 mr-1" />
                            {version.created_by_name || 'Unknown'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-2">
                            {!version.is_active ? (
                              <>
                                <button
                                  onClick={() => router.push(`/admin/functions/${id}/versions/${version.id}/edit`)}
                                  className="text-blue-400 hover:text-blue-300 p-1 rounded"
                                  title="View/Edit code"
                                >
                                  <Code2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDownloadVersion(version.id, version.version)}
                                  disabled={downloadingVersion === version.id}
                                  className="text-primary-400 hover:text-primary-300 p-1 rounded disabled:opacity-50"
                                  title="Download package"
                                >
                                  {downloadingVersion === version.id ? (
                                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Download className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleSwitchVersion(version.id, version.version)}
                                  disabled={switchingVersion === version.id}
                                  className="text-primary-400 hover:text-primary-300 text-sm font-medium disabled:opacity-50"
                                  title="Switch to this version"
                                >
                                  {switchingVersion === version.id ? (
                                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Play className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleDeleteVersion(version.id, parseInt(version.version))}
                                  disabled={deletingVersion === version.id}
                                  className="text-red-400 hover:text-red-300 p-1 rounded disabled:opacity-50"
                                  title="Delete version"
                                >
                                  {deletingVersion === version.id ? (
                                    <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => router.push(`/admin/functions/${id}/versions/${version.id}/edit`)}
                                  className="text-blue-400 hover:text-blue-300 p-1 rounded"
                                  title="View/Edit code"
                                >
                                  <Code2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDownloadVersion(version.id, version.version)}
                                  disabled={downloadingVersion === version.id}
                                  className="text-primary-400 hover:text-primary-300 p-1 rounded disabled:opacity-50"
                                  title="Download package"
                                >
                                  {downloadingVersion === version.id ? (
                                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Download className="w-4 h-4" />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}