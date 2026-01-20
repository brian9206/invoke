import { useState, useEffect, useRef, type JSX } from 'react';
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useProject } from '@/contexts/ProjectContext'
import { 
  ArrowLeft, 
  Save, 
  Code2, 
  FileText, 
  Folder, 
  FolderOpen,
  CheckCircle,
  AlertCircle,
  Loader2,
  Play,
  Trash2,
  ChevronDown,
  MoreVertical,
  Download
} from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  content?: string
  size?: number
  children?: FileNode[]
}

interface FunctionData {
  functionId: string
  versionId: string
  version: number
  functionName: string
  project_id: string
  project_name: string
  files: FileNode[]
}

export default function FunctionCodeEditor() {
  const router = useRouter()
  const { id: functionId, versionId } = router.query
  const { lockProject, unlockProject } = useProject()
  const hasLockedProject = useRef(false)
  
  const [functionData, setFunctionData] = useState<FunctionData | null>(null)
  const [files, setFiles] = useState<FileNode[]>([])
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [showCreateFileModal, setShowCreateFileModal] = useState(false)
  const [showCreateDirModal, setShowCreateDirModal] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newDirName, setNewDirName] = useState('')
  const [renamingFile, setRenamingFile] = useState<FileNode | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const hasFetchedRef = useRef(false)
  const editorRef = useRef<any>(null)

  useEffect(() => {
    if (functionId && versionId && typeof functionId === 'string' && typeof versionId === 'string' && !hasFetchedRef.current) {
      fetchSourceCode()
    }
  }, [functionId, versionId])

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

  const fetchSourceCode = async () => {
    if (hasFetchedRef.current) return // Prevent multiple calls
    
    try {
      hasFetchedRef.current = true
      const response = await authenticatedFetch(`/api/functions/${functionId}/versions/${versionId}/source`)
      
      const result = await response.json()
      
      if (result.success) {
        setFunctionData(result.data)
        setFiles(result.data.files)
        
        // Auto-select index.js if it exists
        const indexFile = findFileByName(result.data.files, 'index.js')
        if (indexFile) {
          setSelectedFile(indexFile)
          setEditorContent(indexFile.content || '')
        }
      } else {
        console.error('Failed to fetch source code:', result.message)
        hasFetchedRef.current = false // Allow retry on error
      }
    } catch (error) {
      console.error('Error fetching source code:', error)
      hasFetchedRef.current = false // Allow retry on error
    } finally {
      setLoading(false)
    }
  }

  const findFileByName = (files: FileNode[], fileName: string): FileNode | null => {
    for (const file of files) {
      if (file.type === 'file' && file.name === fileName) {
        return file
      } else if (file.type === 'directory' && file.children) {
        const found = findFileByName(file.children, fileName)
        if (found) return found
      }
    }
    return null
  }

  const toggleDirectory = (path: string) => {
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedDirs(newExpanded)
  }

  const handleFileSelect = (file: FileNode) => {
    if (file.type === 'file') {
      // Save current file changes before switching
      if (selectedFile && hasChanges) {
        updateFileContent(selectedFile, editorContent)
      }
      
      setSelectedFile(file)
      setEditorContent(file.content || '')
      setHasChanges(false)
    } else {
      toggleDirectory(file.path)
    }
  }

  const handleEditorChange = (value: string | undefined) => {
    setEditorContent(value || '')
    setHasChanges(true)
    
    // Update the file in memory
    if (selectedFile) {
      updateFileContent(selectedFile, value || '')
    }
  }

  const updateFileContent = (file: FileNode, content: string) => {
    const updateFiles = (files: FileNode[]): FileNode[] => {
      return files.map(f => {
        if (f.path === file.path && f.type === 'file') {
          return { ...f, content }
        } else if (f.type === 'directory' && f.children) {
          return { ...f, children: updateFiles(f.children) }
        }
        return f
      })
    }
    
    setFiles(updateFiles(files))
  }

  const handleCreateFile = () => {
    if (!newFileName.trim()) return
    
    const newFile: FileNode = {
      name: newFileName,
      path: newFileName,
      type: 'file',
      content: '',
      size: 0
    }
    
    setFiles(prev => [...prev, newFile])
    setSelectedFile(newFile)
    setEditorContent('')
    setHasChanges(true)
    setNewFileName('')
    setShowCreateFileModal(false)
  }

  const handleCreateDirectory = () => {
    if (!newDirName.trim()) return
    
    const newDir: FileNode = {
      name: newDirName,
      path: newDirName,
      type: 'directory',
      children: []
    }
    
    setFiles(prev => [...prev, newDir])
    setExpandedDirs(prev => new Set(prev).add(newDirName))
    setHasChanges(true)
    setNewDirName('')
    setShowCreateDirModal(false)
  }

  const handleDeleteFile = (fileToDelete: FileNode) => {
    if (window.confirm(`Are you sure you want to delete "${fileToDelete.name}"?`)) {
      const deleteFromFiles = (files: FileNode[]): FileNode[] => {
        return files.filter(file => {
          if (file.path === fileToDelete.path) {
            return false // Remove this file
          } else if (file.type === 'directory' && file.children) {
            return {
              ...file,
              children: deleteFromFiles(file.children)
            }
          }
          return file
        }).map(file => {
          if (file.type === 'directory' && file.children) {
            return {
              ...file,
              children: deleteFromFiles(file.children)
            }
          }
          return file
        })
      }
      
      setFiles(deleteFromFiles(files))
      setHasChanges(true)
      
      // If the deleted file was selected, clear selection
      if (selectedFile?.path === fileToDelete.path) {
        setSelectedFile(null)
        setEditorContent('')
      }
    }
  }

  const handleRenameFile = (file: FileNode, newName: string) => {
    if (!newName.trim() || newName === file.name) {
      setRenamingFile(null)
      return
    }
    
    const updateFileNames = (files: FileNode[], oldPath: string, newPath: string): FileNode[] => {
      return files.map(f => {
        if (f.path === oldPath) {
          return { ...f, name: newName, path: newPath }
        } else if (f.type === 'directory' && f.children) {
          return { ...f, children: updateFileNames(f.children, oldPath, newPath) }
        }
        return f
      })
    }
    
    const newPath = file.path.includes('/') 
      ? file.path.substring(0, file.path.lastIndexOf('/') + 1) + newName
      : newName
    
    setFiles(prev => updateFileNames(prev, file.path, newPath))
    
    // Update selected file if it's the one being renamed
    if (selectedFile?.path === file.path) {
      setSelectedFile({ ...file, name: newName, path: newPath })
    }
    
    setHasChanges(true)
    setRenamingFile(null)
    setRenameValue('')
  }

  const startRename = (file: FileNode) => {
    setRenamingFile(file)
    setRenameValue(file.name)
  }

  const handleDeploy = async () => {
    if (!functionData) return

    if (!confirm('Deploying will create a new version and will immediately switch. Continue?')) {
        return
    }
    
    setDeploying(true)
    setSaveResult(null)
    
    try {
      // Create new version and set it as active
      const response = await authenticatedFetch(`/api/functions/${functionId}/versions/create-from-source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          files,
          setActive: true 
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setSaveResult({ success: true, message: `Version ${result.data.version} deployed and activated successfully!` })
        setHasChanges(false)
        
        // Navigate to function details page after deployment
        setTimeout(() => {
          router.push(`/admin/functions/${functionId}`)
        }, 2000)
      } else {
        setSaveResult({ success: false, message: result.message || 'Failed to deploy version' })
      }
    } catch (error) {
      setSaveResult({ success: false, message: 'Network error occurred during deployment' })
    } finally {
      setDeploying(false)
    }
  }

  const handleDownload = async () => {
    if (!functionId || !versionId || !functionData) return
    
    setDownloading(true)
    setDropdownOpen(false)
    
    try {
      const response = await authenticatedFetch(`/api/functions/${functionId}/versions/${versionId}/download`)

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${functionData.functionName || 'function'}-v${functionData.version}.zip`
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
      setDownloading(false)
    }
  }

  const handleSave = async () => {
    if (!functionData) return
    
    setSaving(true)
    setSaveResult(null)
    
    try {
      const response = await authenticatedFetch(`/api/functions/${functionId}/versions/create-from-source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ files })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setSaveResult({ success: true, message: `New version ${result.data.version} created successfully!` })
        setHasChanges(false)
        
        // Refresh the function versioning page after a delay
        setTimeout(() => {
          router.push(`/admin/functions/${functionId}/versioning`)
        }, 2000)
      } else {
        setSaveResult({ success: false, message: result.message || 'Failed to save changes' })
      }
    } catch (error) {
      setSaveResult({ success: false, message: 'Network error occurred' })
    } finally {
      setSaving(false)
    }
  }

  const getLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'js': return 'javascript'
      case 'ts': return 'typescript'
      case 'json': return 'json'
      case 'md': return 'markdown'
      case 'txt': return 'plaintext'
      case 'yml':
      case 'yaml': return 'yaml'
      case 'xml': return 'xml'
      case 'html': return 'html'
      case 'css': return 'css'
      default: return 'plaintext'
    }
  }

  const renderFileTree = (files: FileNode[], depth = 0): JSX.Element[] => {
    return files.map((file) => (
      <div key={file.path}>
        <div
          className={`flex items-center py-1 px-2 text-sm cursor-pointer hover:bg-gray-800 rounded group ${
            selectedFile?.path === file.path ? 'bg-primary-900/50 text-primary-300' : 'text-gray-300'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => handleFileSelect(file)}
        >
          {file.type === 'directory' ? (
            expandedDirs.has(file.path) ? (
              <FolderOpen className="w-4 h-4 mr-2 text-blue-400" />
            ) : (
              <Folder className="w-4 h-4 mr-2 text-blue-400" />
            )
          ) : (
            <FileText className="w-4 h-4 mr-2 text-gray-400" />
          )}
          
          {renamingFile?.path === file.path ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRenameFile(file, renameValue)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameFile(file, renameValue)
                } else if (e.key === 'Escape') {
                  setRenamingFile(null)
                  setRenameValue('')
                }
              }}
              className="flex-1 bg-gray-700 text-gray-100 px-1 py-0 text-sm border border-primary-500 rounded"
              autoFocus
            />
          ) : (
            <>
              <span className="truncate flex-1">{file.name}</span>
              <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    startRename(file)
                  }}
                  className="p-1 text-gray-500 hover:text-gray-300 text-xs"
                  title="Rename"
                >
                  ✏️
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteFile(file)
                  }}
                  className="p-1 text-gray-500 hover:text-red-400 text-xs"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </>
          )}
        </div>
        {file.type === 'directory' && file.children && expandedDirs.has(file.path) && (
          <div>{renderFileTree(file.children, depth + 1)}</div>
        )}
      </div>
    ))
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout>
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center space-x-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading source code...</span>
            </div>
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
            <div className="text-red-400">Failed to load source code</div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push(`/admin/functions/${functionId}/versioning`)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-100 flex items-center">
                  <Code2 className="w-6 h-6 mr-2" />
                  Code Editor
                </h1>
                <p className="text-gray-400 mt-1">
                  {functionData.functionName} - Version {functionData.version}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {hasChanges && (
                <span className="text-orange-400 text-sm">Unsaved changes</span>
              )}
                            
              <button
                onClick={handleDeploy}
                disabled={!hasChanges || saving || deploying}
                className={`btn-secondary flex items-center ${
                  !hasChanges || saving || deploying ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {deploying ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {deploying ? 'Deploying...' : 'Deploy Now'}
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
                            handleSave()
                            setDropdownOpen(false)
                          }}
                          disabled={!hasChanges || saving || deploying}
                          className={`w-full text-left px-4 py-2 text-sm flex items-center hover:bg-gray-700 ${
                            !hasChanges || saving || deploying 
                              ? 'text-gray-500 cursor-not-allowed' 
                              : 'text-gray-300 hover:text-white'
                          }`}
                        >
                          {saving ? (
                            <Loader2 className="w-4 h-4 mr-3 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4 mr-3" />
                          )}
                          {saving ? 'Creating...' : 'Save as New Version'}
                        </button>
                        
                        <button
                          onClick={handleDownload}
                          disabled={downloading}
                          className={`w-full text-left px-4 py-2 text-sm flex items-center hover:bg-gray-700 ${
                            downloading
                              ? 'text-gray-500 cursor-not-allowed'
                              : 'text-gray-300 hover:text-white'
                          }`}
                        >
                          {downloading ? (
                            <Loader2 className="w-4 h-4 mr-3 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4 mr-3" />
                          )}
                          {downloading ? 'Downloading...' : 'Download Package'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Save Result */}
          {saveResult && (
            <div className={`card p-4 ${
              saveResult.success 
                ? 'bg-green-900/50 border border-green-700' 
                : 'bg-red-900/50 border border-red-700'
            }`}>
              <div className="flex items-center">
                {saveResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-400 mr-2" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
                )}
                <span className={saveResult.success ? 'text-green-300' : 'text-red-300'}>
                  {saveResult.message}
                </span>
              </div>
            </div>
          )}

          {/* Code Editor */}
          <div className="grid grid-cols-4 gap-6 h-[700px]">
            {/* File Tree */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-100 flex items-center">
                  <Folder className="w-5 h-5 mr-2" />
                  Files
                </h3>
                <div className="flex space-x-1">
                  <button
                    onClick={() => setShowCreateFileModal(true)}
                    className="p-1 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded"
                    title="Create new file"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowCreateDirModal(true)}
                    className="p-1 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded"
                    title="Create new directory"
                  >
                    <Folder className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto max-h-[600px]">
                {renderFileTree(files)}
              </div>
            </div>

            {/* Editor */}
            <div className="col-span-3 card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-100 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  {selectedFile ? selectedFile.name : 'No file selected'}
                </h3>
                {selectedFile && (
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
                    {getLanguage(selectedFile.name).toUpperCase()}
                  </span>
                )}
              </div>
              
              <div className="h-[600px] border border-gray-700 rounded-lg overflow-hidden">
                {selectedFile ? (
                  <MonacoEditor
                    height="100%"
                    language={getLanguage(selectedFile.name)}
                    theme="vs-dark"
                    value={editorContent}
                    onChange={handleEditorChange}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      wordWrap: 'on',
                      automaticLayout: true,
                      scrollBeyondLastLine: false,
                    }}
                    onMount={(editor) => {
                      editorRef.current = editor
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    Select a file to start editing
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Create File Modal */}
        {showCreateFileModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-96 border border-gray-700">
              <h3 className="text-lg font-semibold text-gray-100 mb-4">Create New File</h3>
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="Enter file name (e.g., utils.js)"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-400 focus:border-primary-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateFile()
                  } else if (e.key === 'Escape') {
                    setShowCreateFileModal(false)
                    setNewFileName('')
                  }
                }}
                autoFocus
              />
              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={() => {
                    setShowCreateFileModal(false)
                    setNewFileName('')
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateFile}
                  disabled={!newFileName.trim()}
                  className="btn-primary disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Directory Modal */}
        {showCreateDirModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-96 border border-gray-700">
              <h3 className="text-lg font-semibold text-gray-100 mb-4">Create New Directory</h3>
              <input
                type="text"
                value={newDirName}
                onChange={(e) => setNewDirName(e.target.value)}
                placeholder="Enter directory name (e.g., lib)"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-400 focus:border-primary-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateDirectory()
                  } else if (e.key === 'Escape') {
                    setShowCreateDirModal(false)
                    setNewDirName('')
                  }
                }}
                autoFocus
              />
              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={() => {
                    setShowCreateDirModal(false)
                    setNewDirName('')
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateDirectory}
                  disabled={!newDirName.trim()}
                  className="btn-primary disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  )
}