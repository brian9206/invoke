import { useState, useEffect, useRef, type JSX } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import { useProject } from '@/contexts/ProjectContext'
import {
  ArrowLeft,
  Save,
  Code2,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Play,
  Trash2,
  Download,
  ChevronRight,
  ChevronDown,
  FilePlus,
  FolderPlus,
  Pencil,
  Code,
  Search,
  Replace,
  X,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
  Minus
} from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { toast } from 'sonner'

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import('@/lib/monaco-editor'), { ssr: false })

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
  build_status: string
  is_active: boolean
  files: FileNode[]
}

interface VersionInfo {
  id: string
  version: number
  is_active: boolean
  build_status: string
  created_at: string
  artifact_path: string | null
}

interface BuildInfo {
  id: string
  status: string
  error_message?: string
  created_at: string
  started_at?: string
  completed_at?: string
}

interface BuildLog {
  message: string
  timestamp: string
}

// Guard against re-registering Monaco completion providers on hot-reload / component remount.
// The providers are language-global and only need to be set up once per page lifecycle.
let __invokeCompletionProvidersRegistered = false

export default function FunctionCodeEditor() {
  const router = useRouter()
  const { id: functionId, versionId } = router.query
  const { lockProject, unlockProject } = useProject()
  const hasLockedProject = useRef(false)
  const [dialogState, setDialogState] = useState<{
    type: 'alert' | 'confirm' | null
    title: string
    message: string
    onConfirm?: () => void | Promise<void>
  }>({ type: null, title: '', message: '' })

  const [functionData, setFunctionData] = useState<FunctionData | null>(null)
  const [files, setFiles] = useState<FileNode[]>([])
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false)
  const [showCreateFileModal, setShowCreateFileModal] = useState(false)
  const [showCreateDirModal, setShowCreateDirModal] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newDirName, setNewDirName] = useState('')
  const [parentDirectory, setParentDirectory] = useState<FileNode | null>(null)
  const [renamingFile, setRenamingFile] = useState<FileNode | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set())
  const hasFetchedRef = useRef(false)
  const editorRef = useRef<any>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Quick Open state
  const [showQuickOpen, setShowQuickOpen] = useState(false)
  const [quickOpenQuery, setQuickOpenQuery] = useState('')
  const [selectedQuickOpenIndex, setSelectedQuickOpenIndex] = useState(0)

  // Find in Files state
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<
    Array<{ file: FileNode; line: number; lineText: string; matchStart: number; matchEnd: number }>
  >([])
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)

  // Find and Replace state
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceValue, setReplaceValue] = useState('')
  const [findReplaceResults, setFindReplaceResults] = useState<
    Array<{ file: FileNode; line: number; lineText: string; matchStart: number; matchEnd: number }>
  >([])
  const [selectedFindReplaceIndex, setSelectedFindReplaceIndex] = useState(0)
  const [isFindReplaceSearching, setIsFindReplaceSearching] = useState(false)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    file: FileNode | null
    isBlankSpace: boolean
  } | null>(null)

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(256)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)

  // Tabs state for multiple files
  const [openTabs, setOpenTabs] = useState<FileNode[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)

  // Drag and drop state
  const [draggedFile, setDraggedFile] = useState<FileNode | null>(null)
  const [dragOverFile, setDragOverFile] = useState<string | null>(null)

  // Editor state
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 })

  // Version dropdown state
  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [showVersionDropdown, setShowVersionDropdown] = useState(false)
  const [versionSearch, setVersionSearch] = useState('')
  const versionSearchRef = useRef<HTMLInputElement>(null)

  // Build panel state
  const [showBuildPanel, setShowBuildPanel] = useState(false)
  const [buildPanelHeight, setBuildPanelHeight] = useState(200)
  const [currentBuild, setCurrentBuild] = useState<BuildInfo | null>(null)
  const [buildLogs, setBuildLogs] = useState<BuildLog[]>([])
  const [isResizingBuildPanel, setIsResizingBuildPanel] = useState(false)
  const buildPanelResizeStartY = useRef(0)
  const buildPanelResizeStartHeight = useRef(0)
  const buildLogsEndRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F1 to open Monaco command palette
      if (e.key === 'F1') {
        e.preventDefault()
        if (editorRef.current) {
          editorRef.current.focus()
          editorRef.current.trigger('keyboard', 'editor.action.quickCommand')
        }
      }

      // Ctrl+S or Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (hasChanges && !saving && !deploying) {
          if (canOverwrite) {
            handleSaveOverwrite()
          } else {
            confirmSave()
          }
        }
      }

      // Ctrl+P or Cmd+P to open Quick Open file picker
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        setShowQuickOpen(true)
        setQuickOpenQuery('')
        setSelectedQuickOpenIndex(0)
      }

      // Ctrl+Shift+F or Cmd+Shift+F to open Find in Files
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        setShowSearch(true)
        setSearchQuery('')
        setSearchResults([])
        setSelectedSearchIndex(0)
      }

      // Ctrl+Shift+H or Cmd+Shift+H to open Find and Replace
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault()
        setShowFindReplace(true)
        setFindQuery('')
        setReplaceValue('')
        setFindReplaceResults([])
        setSelectedFindReplaceIndex(0)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasChanges, saving, deploying])

  // Cleanup search timeout on unmount or when search closes
  useEffect(() => {
    if (!showSearch && searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
      setIsSearching(false)
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [showSearch])

  // Warn before closing window/tab with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault()
        e.returnValue = '' // Required for Chrome
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasChanges])

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      if (hasChanges && !confirm('You have unsaved changes. Are you sure you want to leave?')) {
        router.events.emit('routeChangeError')
        throw 'Route change aborted.'
      }
    }

    router.events.on('routeChangeStart', handleRouteChange)
    return () => {
      router.events.off('routeChangeStart', handleRouteChange)
    }
  }, [hasChanges, router])

  useEffect(() => {
    if (functionId && versionId && typeof functionId === 'string' && typeof versionId === 'string') {
      // Reset all version-specific state when versionId changes
      hasFetchedRef.current = false
      setFunctionData(null)
      setFiles([])
      setSelectedFile(null)
      setEditorContent('')
      setOpenTabs([])
      setActiveTabPath(null)
      setHasChanges(false)
      setModifiedFiles(new Set())
      setCurrentBuild(null)
      setBuildLogs([])
      setShowBuildPanel(false)
      setLoading(true)
      fetchSourceCode()
      fetchLatestBuild()
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

  // Computed: can overwrite this version in-place
  const canOverwrite = functionData ? functionData.build_status === 'none' && !functionData.is_active : false

  // Fetch versions list
  const fetchVersions = async () => {
    if (!functionId) return
    try {
      const response = await authenticatedFetch(`/api/functions/${functionId}/versions`)
      const result = await response.json()
      if (result.success) {
        setVersions(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching versions:', error)
    }
  }

  // Fetch versions on mount
  useEffect(() => {
    if (functionId && typeof functionId === 'string') {
      fetchVersions()
    }
  }, [functionId])

  // Close version dropdown on outside click, reset search on close
  useEffect(() => {
    if (!showVersionDropdown) {
      setVersionSearch('')
      return
    }
    const handleClick = () => setShowVersionDropdown(false)
    document.addEventListener('click', handleClick)
    // Auto-focus search input
    setTimeout(() => versionSearchRef.current?.focus(), 10)
    return () => document.removeEventListener('click', handleClick)
  }, [showVersionDropdown])

  // Build panel polling
  const isBuildActive = currentBuild?.status === 'queued' || currentBuild?.status === 'running'

  const fetchBuildStatus = async (buildId: string) => {
    try {
      const response = await authenticatedFetch(`/api/builds/${buildId}`)
      const result = await response.json()
      if (result.success) {
        const build = result.data
        setCurrentBuild({
          id: build.id,
          status: build.status,
          error_message: build.error_message,
          created_at: build.created_at,
          started_at: build.started_at,
          completed_at: build.completed_at
        })
        if (build.logs && Array.isArray(build.logs)) {
          setBuildLogs(build.logs)
        }
        // If build completed, refresh versions and functionData
        if (build.status === 'success' || build.status === 'failed' || build.status === 'cancelled') {
          fetchVersions()
          // Refresh build_status/is_active using functional update to avoid stale closure
          try {
            const srcResp = await authenticatedFetch(`/api/functions/${functionId}/versions/${versionId}/source`)
            const srcResult = await srcResp.json()
            if (srcResult.success) {
              setFunctionData(prev =>
                prev
                  ? {
                      ...prev,
                      build_status: srcResult.data.build_status,
                      is_active: srcResult.data.is_active
                    }
                  : prev
              )
            }
          } catch {}
        }
      }
    } catch (error) {
      console.error('Error fetching build status:', error)
    }
  }

  useEffect(() => {
    if (!isBuildActive || !currentBuild?.id) return
    const interval = setInterval(() => fetchBuildStatus(currentBuild.id), 3000)
    return () => clearInterval(interval)
  }, [isBuildActive, currentBuild?.id])

  // Auto-scroll build logs
  useEffect(() => {
    if (buildLogsEndRef.current && showBuildPanel) {
      buildLogsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [buildLogs, showBuildPanel])

  // Build panel resize handlers
  const handleBuildPanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizingBuildPanel(true)
    buildPanelResizeStartY.current = e.clientY
    buildPanelResizeStartHeight.current = buildPanelHeight
  }

  useEffect(() => {
    if (!isResizingBuildPanel) return
    const handleMouseMove = (e: MouseEvent) => {
      const delta = buildPanelResizeStartY.current - e.clientY
      const newHeight = Math.max(100, Math.min(600, buildPanelResizeStartHeight.current + delta))
      setBuildPanelHeight(newHeight)
    }
    const handleMouseUp = () => setIsResizingBuildPanel(false)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingBuildPanel])

  // Auto-load latest build on mount
  const fetchLatestBuild = async () => {
    if (!functionId || !versionId) return
    try {
      const response = await authenticatedFetch(`/api/functions/${functionId}/builds?limit=1&versionId=${versionId}`)
      const result = await response.json()
      const build = result.data?.builds?.[0]
      if (build) {
        setCurrentBuild({
          id: build.id,
          status: build.status,
          error_message: build.error_message,
          created_at: build.created_at,
          started_at: build.started_at,
          completed_at: build.completed_at
        })
        if (build.status === 'queued' || build.status === 'running') {
          setShowBuildPanel(true)
        }
        // Always fetch full build details (including logs) for any known build
        fetchBuildStatus(build.id)
      }
    } catch (error) {
      console.error('Error fetching latest build:', error)
    }
  }

  const fetchSourceCode = async () => {
    if (hasFetchedRef.current) return // Prevent multiple calls

    try {
      hasFetchedRef.current = true
      const response = await authenticatedFetch(`/api/functions/${functionId}/versions/${versionId}/source`)

      const result = await response.json()

      if (result.success) {
        // Normalize all file paths to use forward slashes
        const normalizedFiles = normalizeFilePaths(result.data.files)
        setFunctionData(result.data)
        setFiles(normalizedFiles)

        // Auto-select index.js if it exists
        const indexFile = findFileByName(normalizedFiles, 'index.js')
        if (indexFile) {
          setSelectedFile(indexFile)
          setEditorContent(indexFile.content || '')
          setOpenTabs([indexFile])
          setActiveTabPath(indexFile.path)
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

  const normalizeFilePaths = (files: FileNode[]): FileNode[] => {
    return files.map(file => {
      const normalizedPath = file.path.replace(/\\/g, '/')
      if (file.type === 'directory' && file.children) {
        return {
          ...file,
          path: normalizedPath,
          children: normalizeFilePaths(file.children)
        }
      }
      return {
        ...file,
        path: normalizedPath
      }
    })
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

      // Add to tabs if not already open
      if (!openTabs.find(tab => tab.path === file.path)) {
        setOpenTabs(prev => [...prev, file])
      }

      setActiveTabPath(file.path)
      setSelectedFile(file)
      setEditorContent(file.content || '')
      setHasChanges(false)
    } else {
      toggleDirectory(file.path)
    }
  }

  const closeTab = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation()

    const newTabs = openTabs.filter(tab => tab.path !== path)
    setOpenTabs(newTabs)

    if (activeTabPath === path) {
      // Switch to another tab or clear selection
      if (newTabs.length > 0) {
        const newActiveTab = newTabs[newTabs.length - 1]
        setActiveTabPath(newActiveTab.path)
        setSelectedFile(newActiveTab)
        setEditorContent(newActiveTab.content || '')
      } else {
        setActiveTabPath(null)
        setSelectedFile(null)
        setEditorContent('')
        // Don't reset hasChanges here - let it persist for deletions
      }
    }
  }

  const switchTab = (file: FileNode) => {
    // Save current file changes before switching
    if (selectedFile && hasChanges) {
      updateFileContent(selectedFile, editorContent)
    }

    setActiveTabPath(file.path)
    setSelectedFile(file)
    setEditorContent(file.content || '')
    setHasChanges(false)
  }

  const handleEditorChange = (value: string | undefined) => {
    setEditorContent(value || '')
    setHasChanges(true)

    // Update the file in memory
    if (selectedFile) {
      updateFileContent(selectedFile, value || '')
      // Mark file as modified
      setModifiedFiles(prev => new Set([...prev, selectedFile.path]))
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

    // Update tab content
    setOpenTabs(prev => prev.map(tab => (tab.path === file.path ? { ...tab, content } : tab)))
  }

  const handleCreateFile = () => {
    if (!newFileName.trim()) return

    const parentPath = parentDirectory?.path || ''
    const newPath = parentPath ? `${parentPath}/${newFileName}` : newFileName

    // Check for duplicates in target directory
    const targetChildren = parentDirectory?.children || files
    const isDuplicate = targetChildren.some(f => f.name === newFileName)

    if (isDuplicate) {
      toast.error(`A file or folder named "${newFileName}" already exists in this directory`)
      return
    }

    const newFile: FileNode = {
      name: newFileName,
      path: newPath,
      type: 'file',
      content: '',
      size: 0
    }

    if (parentDirectory) {
      // Add file to parent directory
      const updateFiles = (filesList: FileNode[]): FileNode[] => {
        return filesList.map(f => {
          if (f.path === parentDirectory.path && f.type === 'directory') {
            return {
              ...f,
              children: [...(f.children || []), newFile]
            }
          } else if (f.type === 'directory' && f.children) {
            return { ...f, children: updateFiles(f.children) }
          }
          return f
        })
      }
      setFiles(prev => updateFiles(prev))
      // Expand parent directory
      setExpandedDirs(prev => new Set(prev).add(parentDirectory.path))
    } else {
      // Add file to root
      setFiles(prev => [...prev, newFile])
    }

    setSelectedFile(newFile)
    setEditorContent('')
    setHasChanges(true)
    setNewFileName('')
    setShowCreateFileModal(false)
    setParentDirectory(null)
  }

  const handleCreateDirectory = () => {
    if (!newDirName.trim()) return

    const parentPath = parentDirectory?.path || ''
    const newPath = parentPath ? `${parentPath}/${newDirName}` : newDirName

    // Check for duplicates in target directory
    const targetChildren = parentDirectory?.children || files
    const isDuplicate = targetChildren.some(f => f.name === newDirName)

    if (isDuplicate) {
      toast.error(`A file or folder named "${newDirName}" already exists in this directory`)
      return
    }

    const newDir: FileNode = {
      name: newDirName,
      path: newPath,
      type: 'directory',
      children: []
    }

    if (parentDirectory) {
      // Add directory to parent directory
      const updateFiles = (filesList: FileNode[]): FileNode[] => {
        return filesList.map(f => {
          if (f.path === parentDirectory.path && f.type === 'directory') {
            return {
              ...f,
              children: [...(f.children || []), newDir]
            }
          } else if (f.type === 'directory' && f.children) {
            return { ...f, children: updateFiles(f.children) }
          }
          return f
        })
      }
      setFiles(prev => updateFiles(prev))
      // Expand parent directory
      setExpandedDirs(prev => new Set(prev).add(parentDirectory.path))
    } else {
      // Add directory to root
      setFiles(prev => [...prev, newDir])
    }

    setExpandedDirs(prev => new Set(prev).add(newPath))
    setHasChanges(true)
    setNewDirName('')
    setShowCreateDirModal(false)
    setParentDirectory(null)
  }

  const handleDeleteFile = (fileToDelete: FileNode) => {
    setDialogState({
      type: 'confirm',
      title: 'Delete File',
      message: `Are you sure you want to delete "${fileToDelete.name}"?`,
      onConfirm: () => {
        const deleteFromFiles = (files: FileNode[]): FileNode[] => {
          return files
            .filter(file => {
              if (file.path === fileToDelete.path) {
                return false // Remove this file
              } else if (file.type === 'directory' && file.children) {
                return {
                  ...file,
                  children: deleteFromFiles(file.children)
                }
              }
              return file
            })
            .map(file => {
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

        // Remove from modified files set
        setModifiedFiles(prev => {
          const newSet = new Set(prev)
          newSet.delete(fileToDelete.path)
          return newSet
        })

        // Close tab if file is open
        if (openTabs.find(tab => tab.path === fileToDelete.path)) {
          closeTab(fileToDelete.path)
        }

        // If the deleted file was selected, clear selection
        if (selectedFile?.path === fileToDelete.path) {
          setSelectedFile(null)
          setEditorContent('')
        }
        setDialogState({ type: null, title: '', message: '' })
      }
    })
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

    const newPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/') + 1) + newName : newName

    setFiles(prev => updateFileNames(prev, file.path, newPath))

    // Update modified files set with new path if it was modified
    if (modifiedFiles.has(file.path)) {
      setModifiedFiles(prev => {
        const newSet = new Set(prev)
        newSet.delete(file.path)
        newSet.add(newPath)
        return newSet
      })
    }

    // Update selected file if it's the one being renamed
    if (selectedFile?.path === file.path) {
      setSelectedFile({ ...file, name: newName, path: newPath })
    }

    // Update tabs if file is open
    setOpenTabs(prev => prev.map(tab => (tab.path === file.path ? { ...tab, name: newName, path: newPath } : tab)))

    // Update active tab path
    if (activeTabPath === file.path) {
      setActiveTabPath(newPath)
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

    setDialogState({
      type: 'confirm',
      title: 'Deploy Function',
      message: hasChanges
        ? 'This will save your changes and switch to this version. If a build is needed, it will be queued. Continue?'
        : 'This will switch to this version. If a build is needed, it will be queued. Continue?',
      onConfirm: async () => {
        setDialogState({ type: null, title: '', message: '' })
        setDeploying(true)

        try {
          // Step 1: Save if there are changes
          let targetVersionId = functionData.versionId
          if (hasChanges) {
            targetVersionId = (await saveAndGetVersionId()) || functionData.versionId
          }

          // Step 2: Call switch-version
          const switchResponse = await authenticatedFetch(`/api/functions/${functionId}/switch-version`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ versionId: targetVersionId })
          })

          const switchResult = await switchResponse.json()

          if (switchResponse.status === 202 && switchResult.buildRequired) {
            // Build queued
            toast.success(`Build queued. Will auto-switch when complete.`)
            if (switchResult.build) {
              setCurrentBuild({
                id: switchResult.build.id,
                status: switchResult.build.status || 'queued',
                created_at: switchResult.build.created_at
              })
              setShowBuildPanel(true)
              setBuildLogs([])
            }
            // Update functionData to reflect new state
            setFunctionData(prev => (prev ? { ...prev, build_status: 'queued', is_active: false } : prev))
            fetchVersions()
            // If we created a new version, navigate to it
            if (targetVersionId !== functionData.versionId) {
              setTimeout(() => {
                router.push(`/admin/functions/${functionId}/versions/${targetVersionId}/edit`)
              }, 100)
            }
          } else if (switchResult.success) {
            toast.success(`Version switched successfully!`)
            setFunctionData(prev => (prev ? { ...prev, is_active: true } : prev))
            fetchVersions()
            // If we created a new version, navigate to it
            if (targetVersionId !== functionData.versionId) {
              setTimeout(() => {
                router.push(`/admin/functions/${functionId}/versions/${targetVersionId}/edit`)
              }, 100)
            }
          } else {
            toast.error(switchResult.message || 'Failed to deploy version')
          }
        } catch (error) {
          toast.error('Network error occurred during deployment')
        } finally {
          setDeploying(false)
        }
      }
    })
  }

  const handleDownload = async () => {
    if (!functionId || !versionId || !functionData) return

    setDownloading(true)

    try {
      const response = await authenticatedFetch(`/api/functions/${functionId}/versions/${versionId}/download`)

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${functionData.functionName || 'function'}-v${functionData.version}.tgz`
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

  const handleSaveOverwrite = async () => {
    if (!functionData) return
    setSaving(true)
    try {
      const response = await authenticatedFetch(`/api/functions/${functionId}/versions/${versionId}/source`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      })
      const result = await response.json()
      if (result.success) {
        toast.success(`Version ${functionData.version} saved successfully!`)
        setHasChanges(false)
        setModifiedFiles(new Set())
        fetchVersions()
      } else if (response.status === 409) {
        // Version was built/activated in the meantime, fall back to save as new
        toast.error(result.message || 'Cannot overwrite. Saving as new version instead.')
      } else {
        toast.error(result.message || 'Failed to save changes')
      }
    } catch (error) {
      toast.error('Network error occurred')
    } finally {
      setSaving(false)
    }
  }

  // Helper: save and return the versionId (either overwrite or create new)
  const saveAndGetVersionId = async (): Promise<string | null> => {
    if (!functionData) return null
    if (!hasChanges) return functionData.versionId

    if (canOverwrite) {
      const response = await authenticatedFetch(`/api/functions/${functionId}/versions/${versionId}/source`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      })
      const result = await response.json()
      if (result.success) {
        setHasChanges(false)
        setModifiedFiles(new Set())
        return functionData.versionId
      }
      throw new Error(result.message || 'Failed to save')
    } else {
      const response = await authenticatedFetch(`/api/functions/${functionId}/versions/create-from-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      })
      const result = await response.json()
      if (result.success) {
        setHasChanges(false)
        setModifiedFiles(new Set())
        return result.data.versionId
      }
      throw new Error(result.message || 'Failed to save')
    }
  }

  const confirmSave = () => {
    setShowSaveConfirmModal(true)
  }

  const handleSave = async () => {
    if (!functionData) return

    setShowSaveConfirmModal(false)
    setSaving(true)

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
        toast.success(`New version ${result.data.version} created successfully!`)
        setHasChanges(false)
        setModifiedFiles(new Set())
        setFunctionData({
          ...functionData,
          versionId: result.data.versionId,
          version: result.data.version
        })

        // Navigate to the new version's edit page
        setTimeout(() => {
          router.push(`/admin/functions/${functionId}/versions/${result.data.versionId}/edit`)
        }, 100)
      } else {
        toast.error(result.message || 'Failed to save changes')
      }
    } catch (error) {
      toast.error('Network error occurred')
    } finally {
      setSaving(false)
    }
  }

  const getLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'js':
        return 'javascript'
      case 'ts':
        return 'typescript'
      case 'json':
        return 'json'
      case 'md':
        return 'markdown'
      case 'txt':
        return 'plaintext'
      case 'yml':
      case 'yaml':
        return 'yaml'
      case 'xml':
        return 'xml'
      case 'html':
        return 'html'
      case 'css':
        return 'css'
      default:
        return 'plaintext'
    }
  }

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, file: FileNode | null, isBlankSpace: boolean = false) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file,
      isBlankSpace
    })
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  const handleContextMenuAction = (action: string) => {
    if (!contextMenu) return

    switch (action) {
      case 'newFile':
        // Set parent directory - use the right-clicked folder or null for root
        setParentDirectory(contextMenu.file?.type === 'directory' ? contextMenu.file : null)
        setShowCreateFileModal(true)
        break
      case 'newFolder':
        // Set parent directory - use the right-clicked folder or null for root
        setParentDirectory(contextMenu.file?.type === 'directory' ? contextMenu.file : null)
        setShowCreateDirModal(true)
        break
      case 'rename':
        if (contextMenu.file) {
          startRename(contextMenu.file)
        }
        break
      case 'delete':
        if (contextMenu.file) {
          handleDeleteFile(contextMenu.file)
        }
        break
    }
    closeContextMenu()
  }

  // Sidebar resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartX.current = e.clientX
    resizeStartWidth.current = sidebarWidth
  }

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing) return

      const delta = e.clientX - resizeStartX.current
      const newWidth = Math.max(180, Math.min(400, resizeStartWidth.current + delta))
      setSidebarWidth(newWidth)
    }

    const handleResizeEnd = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove)
      document.addEventListener('mouseup', handleResizeEnd)
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [isResizing])

  // Trigger Monaco's built-in Go to Line
  const handleGoToLine = () => {
    if (editorRef.current) {
      editorRef.current.focus()
      editorRef.current.trigger('anyString', 'editor.action.gotoLine')
    }
  }

  // Flatten file tree for Quick Open
  const getAllFiles = (nodes: FileNode[]): FileNode[] => {
    let allFiles: FileNode[] = []
    for (const node of nodes) {
      if (node.type === 'file') {
        allFiles.push(node)
      } else if (node.type === 'directory' && node.children) {
        allFiles = allFiles.concat(getAllFiles(node.children))
      }
    }
    return allFiles
  }

  // Filter files for Quick Open based on query
  const getFilteredFiles = () => {
    const allFiles = getAllFiles(files)
    if (!quickOpenQuery.trim()) return allFiles

    const query = quickOpenQuery.toLowerCase()
    // Fuzzy matching: prioritize files where query matches path segments
    return allFiles
      .filter(file => file.path.toLowerCase().includes(query) || file.name.toLowerCase().includes(query))
      .sort((a, b) => {
        // Prioritize exact name matches
        const aNameMatch = a.name.toLowerCase().startsWith(query)
        const bNameMatch = b.name.toLowerCase().startsWith(query)
        if (aNameMatch && !bNameMatch) return -1
        if (!aNameMatch && bNameMatch) return 1
        return a.path.localeCompare(b.path)
      })
  }

  const handleQuickOpenSelect = (file: FileNode) => {
    handleFileSelect(file)
    setShowQuickOpen(false)
    setQuickOpenQuery('')
    // Focus editor after selection
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus()
      }
    }, 100)
  }

  // Search in all files with debouncing and performance optimization
  const searchInFiles = (query: string) => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!query.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)

    // Debounce search by 300ms
    searchTimeoutRef.current = setTimeout(() => {
      const MAX_RESULTS = 1000
      const results: Array<{ file: FileNode; line: number; lineText: string; matchStart: number; matchEnd: number }> =
        []
      const allFiles = getAllFiles(files)
      const searchLower = query.toLowerCase()
      let resultCount = 0

      // Use early break when max results reached
      for (const file of allFiles) {
        if (file.content && resultCount < MAX_RESULTS) {
          const lines = file.content.split('\n')

          for (let lineIndex = 0; lineIndex < lines.length && resultCount < MAX_RESULTS; lineIndex++) {
            const lineText = lines[lineIndex]
            const lineLower = lineText.toLowerCase()
            let startIndex = 0
            let matchIndex = lineLower.indexOf(searchLower, startIndex)

            while (matchIndex !== -1 && resultCount < MAX_RESULTS) {
              results.push({
                file,
                line: lineIndex + 1,
                lineText: lineText,
                matchStart: matchIndex,
                matchEnd: matchIndex + query.length
              })
              resultCount++
              startIndex = matchIndex + 1
              matchIndex = lineLower.indexOf(searchLower, startIndex)
            }
          }
        }

        if (resultCount >= MAX_RESULTS) break
      }

      setSearchResults(results)
      setSelectedSearchIndex(0)
      setIsSearching(false)
    }, 300)
  }

  const handleSearchResultSelect = (result: (typeof searchResults)[0]) => {
    handleFileSelect(result.file)
    setShowSearch(false)
    // Navigate to the line in the editor
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.revealLineInCenter(result.line)
        editorRef.current.setPosition({ lineNumber: result.line, column: result.matchStart + 1 })
        editorRef.current.focus()
      }
    }, 100)
  }

  const searchInFilesForReplace = (query: string) => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!query.trim()) {
      setFindReplaceResults([])
      setIsFindReplaceSearching(false)
      return
    }

    setIsFindReplaceSearching(true)

    // Debounce search by 300ms
    searchTimeoutRef.current = setTimeout(() => {
      const MAX_RESULTS = 1000
      const results: Array<{ file: FileNode; line: number; lineText: string; matchStart: number; matchEnd: number }> =
        []
      const allFiles = getAllFiles(files)
      const searchLower = query.toLowerCase()
      let resultCount = 0

      // Use early break when max results reached
      for (const file of allFiles) {
        if (file.content && resultCount < MAX_RESULTS) {
          const lines = file.content.split('\n')

          for (let lineIndex = 0; lineIndex < lines.length && resultCount < MAX_RESULTS; lineIndex++) {
            const lineText = lines[lineIndex]
            const lineLower = lineText.toLowerCase()
            let startIndex = 0
            let matchIndex = lineLower.indexOf(searchLower, startIndex)

            while (matchIndex !== -1 && resultCount < MAX_RESULTS) {
              results.push({
                file,
                line: lineIndex + 1,
                lineText: lineText,
                matchStart: matchIndex,
                matchEnd: matchIndex + query.length
              })
              resultCount++
              startIndex = matchIndex + 1
              matchIndex = lineLower.indexOf(searchLower, startIndex)
            }
          }
        }

        if (resultCount >= MAX_RESULTS) break
      }

      setFindReplaceResults(results)
      setSelectedFindReplaceIndex(0)
      setIsFindReplaceSearching(false)
    }, 300)
  }

  const handleFindReplaceSelect = (result: (typeof findReplaceResults)[0]) => {
    handleFileSelect(result.file)
    // Navigate to the line in the editor
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.revealLineInCenter(result.line)
        editorRef.current.setPosition({ lineNumber: result.line, column: result.matchStart + 1 })
        editorRef.current.focus()
      }
    }, 100)
  }

  const handleReplaceOne = (result: (typeof findReplaceResults)[0]) => {
    if (!selectedFile || selectedFile.path !== result.file.path) {
      handleFileSelect(result.file)
    }

    setTimeout(() => {
      if (editorRef.current && selectedFile) {
        const currentContent = editorContent
        const lines = currentContent.split('\n')
        const lineIndex = result.line - 1

        if (lineIndex >= 0 && lineIndex < lines.length) {
          const line = lines[lineIndex]
          const newLine = line.substring(0, result.matchStart) + replaceValue + line.substring(result.matchEnd)
          lines[lineIndex] = newLine
          const newContent = lines.join('\n')

          // Update the editor and mark as changed
          setEditorContent(newContent)
          selectedFile.content = newContent
          setHasChanges(true)

          // Update the files tree
          const updatedFiles = [...files]
          setFiles(updatedFiles)

          // Re-search to update results
          searchInFilesForReplace(findQuery)
        }
      }
    }, 100)
  }

  const handleReplaceAll = () => {
    if (findReplaceResults.length === 0) return

    // Group results by file
    const fileMap = new Map<string, typeof findReplaceResults>()
    for (const result of findReplaceResults) {
      if (!fileMap.has(result.file.path)) {
        fileMap.set(result.file.path, [])
      }
      fileMap.get(result.file.path)!.push(result)
    }

    // Replace in each file
    for (const [filePath, results] of fileMap) {
      const file = getAllFiles(files).find(f => f.path === filePath)
      if (file && file.content) {
        let newContent = file.content

        // Sort results in reverse order to preserve indices
        const sortedResults = [...results].sort((a, b) => b.matchStart - a.matchStart)

        for (const result of sortedResults) {
          const lines = newContent.split('\n')
          const lineIndex = result.line - 1

          if (lineIndex >= 0 && lineIndex < lines.length) {
            const line = lines[lineIndex]
            const newLine = line.substring(0, result.matchStart) + replaceValue + line.substring(result.matchEnd)
            lines[lineIndex] = newLine
            newContent = lines.join('\n')
          }
        }

        file.content = newContent
        if (selectedFile && selectedFile.path === filePath) {
          setEditorContent(newContent)
        }
      }
    }

    setHasChanges(true)
    setFindReplaceResults([])
    setShowFindReplace(false)
    toast.success(`Replaced ${findReplaceResults.length} occurrences`)
  }

  // Handle external file drops from filesystem
  const processDroppedFiles = async (files: FileList, targetPath: string = ''): Promise<FileNode[]> => {
    const fileNodes: FileNode[] = []

    // Process all files
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const relativePath = (file as any).webkitRelativePath || file.name
      const parts = relativePath.split('/').filter((p: string) => p) // Remove empty parts

      if (parts.length === 0) continue

      const fileName = parts[parts.length - 1]
      const filePath = targetPath ? `${targetPath}/${fileName}` : fileName

      try {
        const content = await file.text()
        fileNodes.push({
          name: fileName,
          path: filePath,
          type: 'file',
          content,
          size: file.size
        })
      } catch (err) {
        console.error(`Failed to read file ${fileName}:`, err)
        toast.error(`Failed to read file: ${fileName}`)
      }
    }

    return fileNodes
  }

  const handleDragStart = (e: React.DragEvent, file: FileNode) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', file.path) // Required for Firefox
    setDraggedFile(file)
  }

  const handleDragEnd = (e: React.DragEvent) => {
    e.preventDefault()
    // Clear dragged file state when drag operation ends
    setDraggedFile(null)
    setDragOverFile(null)
  }

  const hasDirectories = (files: FileList): boolean => {
    for (let i = 0; i < files.length; i++) {
      if (files[i].size === 0 && !files[i].type) {
        return true
      }
    }
    return false
  }

  const handleDragOver = (e: React.DragEvent, file: FileNode | null) => {
    e.preventDefault()
    e.stopPropagation()

    // Check if dropping external files or internal drag
    const hasFiles = e.dataTransfer.types.includes('Files')

    if (hasFiles) {
      // Only allow dropping files, not folders
      if (e.dataTransfer.items && hasDirectories(e.dataTransfer.files)) {
        e.dataTransfer.dropEffect = 'none'
      } else if (!file) {
        e.dataTransfer.dropEffect = 'copy'
        setDragOverFile('root')
      } else if (file.type === 'directory') {
        e.dataTransfer.dropEffect = 'copy'
        setDragOverFile(file.path)
      } else {
        e.dataTransfer.dropEffect = 'none'
      }
    } else {
      // Internal drag - existing behavior
      if (!file) {
        // Dropping to root
        if (draggedFile && draggedFile.path.includes('/')) {
          e.dataTransfer.dropEffect = 'move'
          setDragOverFile('root')
        } else {
          e.dataTransfer.dropEffect = 'none'
        }
      } else {
        if (file.type === 'directory' && draggedFile && file.path !== draggedFile.path) {
          e.dataTransfer.dropEffect = 'move'
          setDragOverFile(file.path)
        } else {
          e.dataTransfer.dropEffect = 'none'
        }
      }
    }
  }

  const handleDragLeave = (e: React.DragEvent, isRoot: boolean = false) => {
    e.preventDefault()

    // For root drop zone, only clear if leaving the explorer area entirely
    if (isRoot) {
      const relatedTarget = e.relatedTarget as HTMLElement
      // Check if we're leaving the explorer container
      if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
        setDragOverFile(null)
      }
    } else {
      setDragOverFile(null)
    }
  }

  const handleDrop = (e: React.DragEvent, targetFile: FileNode | null) => {
    e.preventDefault()
    e.stopPropagation()

    setDragOverFile(null)

    // Handle external file drops from filesystem
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Check if any directories are being dropped
      if (hasDirectories(e.dataTransfer.files)) {
        toast.error('Folders are not supported. Please import individual files only.')
        return
      }

      const targetPath = targetFile?.type === 'directory' ? targetFile.path : ''

      // Process dropped files
      processDroppedFiles(e.dataTransfer.files, targetPath).then(newNodes => {
        if (newNodes.length === 0) {
          toast.error('No files could be imported')
          return
        }

        // Check for duplicates at target location
        const targetChildren = targetFile?.type === 'directory' ? targetFile.children || [] : files
        const duplicates = newNodes.filter(node => targetChildren.some(existing => existing.name === node.name))

        if (duplicates.length > 0) {
          toast.error(`Files/folders already exist: ${duplicates.map(d => d.name).join(', ')}`)
          return
        }

        // Add files to explorer
        if (targetFile && targetFile.type === 'directory') {
          const addToTarget = (filesList: FileNode[]): FileNode[] => {
            return filesList.map(f => {
              if (f.path === targetFile.path && f.type === 'directory') {
                return {
                  ...f,
                  children: [...(f.children || []), ...newNodes]
                }
              } else if (f.type === 'directory' && f.children) {
                return { ...f, children: addToTarget(f.children) }
              }
              return f
            })
          }
          setFiles(prev => addToTarget(prev))
          // Expand the target directory
          setExpandedDirs(prev => new Set(prev).add(targetFile.path))
        } else {
          // Add to root
          setFiles(prev => [...prev, ...newNodes])
        }

        // Mark new files as modified
        const getAllPaths = (nodes: FileNode[]): string[] => {
          const paths: string[] = []
          for (const node of nodes) {
            if (node.type === 'file') {
              paths.push(node.path)
            } else if (node.children) {
              paths.push(...getAllPaths(node.children))
            }
          }
          return paths
        }

        setModifiedFiles(prev => {
          const newSet = new Set(prev)
          getAllPaths(newNodes).forEach(path => newSet.add(path))
          return newSet
        })

        setHasChanges(true)
        toast.success(`Imported ${newNodes.length} item(s)`)
      })
      return
    }

    if (!draggedFile) {
      setDraggedFile(null)
      return
    }

    // If targetFile is null, drop to root
    if (!targetFile) {
      // Check if already at root
      if (!draggedFile.path.includes('/')) {
        setDraggedFile(null)
        return
      }

      // Check for duplicate at root
      if (files.some(f => f.name === draggedFile.name)) {
        toast.error(`A file or folder named "${draggedFile.name}" already exists at root`)
        setDraggedFile(null)
        return
      }

      // Move to root
      const draggedPath = draggedFile.path
      const removeFromSource = (filesList: FileNode[]): FileNode[] => {
        return filesList.reduce((acc: FileNode[], f) => {
          if (f.path === draggedPath) {
            // Skip this file - don't add it to accumulator
            return acc
          }
          if (f.type === 'directory' && f.children && f.children.length > 0) {
            // Recursively remove from children
            const newChildren = removeFromSource(f.children)
            acc.push({ ...f, children: newChildren })
          } else {
            acc.push(f)
          }
          return acc
        }, [])
      }

      // Create moved file with updated path
      let movedFile: FileNode
      if (draggedFile.type === 'directory' && draggedFile.children) {
        const updateChildPaths = (children: FileNode[], parentPath: string): FileNode[] => {
          return children.map(child => {
            const newChildPath = `${parentPath}/${child.name}`
            if (child.type === 'directory' && child.children) {
              return {
                ...child,
                path: newChildPath,
                children: updateChildPaths(child.children, newChildPath)
              }
            }
            return { ...child, path: newChildPath }
          })
        }
        movedFile = {
          ...draggedFile,
          path: draggedFile.name,
          children: updateChildPaths(draggedFile.children, draggedFile.name)
        }
      } else {
        movedFile = {
          ...draggedFile,
          path: draggedFile.name
        }
      }

      // Create new files array without the dragged file, then add it at root
      const filesWithoutDragged = removeFromSource(files)
      const newFiles = [...filesWithoutDragged, movedFile]

      setFiles(newFiles)

      // Update tabs if the moved file is open
      const oldPath = draggedFile.path
      const newPath = draggedFile.name
      setOpenTabs(prev =>
        prev.map(tab => {
          if (tab.path === oldPath) {
            return { ...tab, path: newPath }
          } else if (tab.path.startsWith(oldPath + '/')) {
            const relativePath = tab.path.substring(oldPath.length)
            return { ...tab, path: newPath + relativePath }
          }
          return tab
        })
      )

      // Update active tab path
      if (activeTabPath === oldPath) {
        setActiveTabPath(newPath)
      } else if (activeTabPath && activeTabPath.startsWith(oldPath + '/')) {
        const relativePath = activeTabPath.substring(oldPath.length)
        setActiveTabPath(newPath + relativePath)
      }

      // Update selected file
      if (selectedFile?.path === oldPath) {
        setSelectedFile({ ...draggedFile, path: newPath })
      }

      setHasChanges(true)
      setDraggedFile(null)
      toast.success(`Moved "${draggedFile.name}" to root`)
      return
    }

    if (targetFile.type !== 'directory' || targetFile.path === draggedFile.path) {
      setDraggedFile(null)
      return
    }

    // Check if trying to move a folder into itself or its descendants
    if (draggedFile.type === 'directory' && targetFile.path.startsWith(draggedFile.path + '/')) {
      toast.error('Cannot move a folder into itself or its subfolder')
      setDraggedFile(null)
      return
    }

    // Check for duplicate in target directory
    if (targetFile.children?.some(f => f.name === draggedFile.name)) {
      toast.error(`A file or folder named "${draggedFile.name}" already exists in "${targetFile.name}"`)
      setDraggedFile(null)
      return
    }

    // Remove from source and add to target
    const draggedPath = draggedFile.path
    const removeFromSource = (filesList: FileNode[]): FileNode[] => {
      return filesList.reduce((acc: FileNode[], f) => {
        if (f.path === draggedPath) {
          // Skip this file - don't add it to accumulator
          return acc
        }
        if (f.type === 'directory' && f.children && f.children.length > 0) {
          // Recursively remove from children
          const newChildren = removeFromSource(f.children)
          acc.push({ ...f, children: newChildren })
        } else {
          acc.push(f)
        }
        return acc
      }, [])
    }

    const addToTarget = (filesList: FileNode[]): FileNode[] => {
      return filesList.map(f => {
        if (f.path === targetFile.path && f.type === 'directory') {
          const newPath = `${targetFile.path}/${draggedFile.name}`
          const movedFile = { ...draggedFile, path: newPath }

          // If moving a directory, update all child paths recursively
          if (movedFile.type === 'directory' && movedFile.children) {
            const updateChildPaths = (children: FileNode[], parentPath: string): FileNode[] => {
              return children.map(child => {
                const newChildPath = `${parentPath}/${child.name}`
                if (child.type === 'directory' && child.children) {
                  return {
                    ...child,
                    path: newChildPath,
                    children: updateChildPaths(child.children, newChildPath)
                  }
                }
                return { ...child, path: newChildPath }
              })
            }
            movedFile.children = updateChildPaths(movedFile.children, newPath)
          }

          return {
            ...f,
            children: [...(f.children || []), movedFile]
          }
        } else if (f.type === 'directory' && f.children) {
          return { ...f, children: addToTarget(f.children) }
        }
        return f
      })
    }

    setFiles(prev => addToTarget(removeFromSource(prev)))

    // Update tabs if the moved file is open
    const oldPath = draggedFile.path
    const newPath = `${targetFile.path}/${draggedFile.name}`
    setOpenTabs(prev =>
      prev.map(tab => {
        if (tab.path === oldPath) {
          return { ...tab, path: newPath }
        } else if (tab.path.startsWith(oldPath + '/')) {
          // Update child file paths if moving a directory
          const relativePath = tab.path.substring(oldPath.length)
          return { ...tab, path: newPath + relativePath }
        }
        return tab
      })
    )

    // Update active tab path
    if (activeTabPath === oldPath) {
      setActiveTabPath(newPath)
    } else if (activeTabPath && activeTabPath.startsWith(oldPath + '/')) {
      const relativePath = activeTabPath.substring(oldPath.length)
      setActiveTabPath(newPath + relativePath)
    }

    // Update selected file
    if (selectedFile?.path === oldPath) {
      setSelectedFile({ ...draggedFile, path: newPath })
    }

    // Expand target directory
    setExpandedDirs(prev => new Set(prev).add(targetFile.path))
    setHasChanges(true)
    setDraggedFile(null)
    toast.success(`Moved "${draggedFile.name}" to "${targetFile.name}"`)
  }

  const checkFolderHasModifiedFiles = (folder: FileNode): boolean => {
    if (folder.type === 'file') {
      return modifiedFiles.has(folder.path)
    }
    if (folder.children) {
      return folder.children.some(child => checkFolderHasModifiedFiles(child))
    }
    return false
  }

  const renderFileTree = (files: FileNode[], depth = 0): JSX.Element[] => {
    // Sort files: directories first, then files, alphabetically within each group
    const sortedFiles = [...files].sort((a, b) => {
      // Directories come before files
      if (a.type === 'directory' && b.type === 'file') return -1
      if (a.type === 'file' && b.type === 'directory') return 1
      // Within same type, sort alphabetically (case-insensitive)
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })

    return sortedFiles.map(file => {
      const isModified = file.type === 'file' ? modifiedFiles.has(file.path) : checkFolderHasModifiedFiles(file)

      return (
        <div key={file.path}>
          <div
            className={`flex items-center py-1 px-2 text-sm cursor-pointer rounded group ${
              dragOverFile === file.path
                ? 'bg-[#007acc] text-[#ffffff]'
                : selectedFile?.path === file.path
                  ? 'bg-[#37373d] text-[#ffffff]'
                  : 'text-[#cccccc] hover:bg-[#2a2d2e]'
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            draggable
            onDragStart={e => {
              e.stopPropagation()
              handleDragStart(e, file)
            }}
            onDragEnd={e => {
              e.stopPropagation()
              handleDragEnd(e)
            }}
            onDragOver={e => {
              // Stop propagation to prevent parent from receiving event
              e.stopPropagation()
              handleDragOver(e, file)
            }}
            onDragLeave={e => {
              e.stopPropagation()
              handleDragLeave(e, false)
            }}
            onDrop={e => {
              e.stopPropagation()
              handleDrop(e, file)
            }}
            onClick={() => handleFileSelect(file)}
            onContextMenu={e => handleContextMenu(e, file)}
          >
            {file.type === 'directory' ? (
              expandedDirs.has(file.path) ? (
                <FolderOpen className='w-4 h-4 mr-2 text-[#dcb67a] pointer-events-none' />
              ) : (
                <Folder className='w-4 h-4 mr-2 text-[#dcb67a] pointer-events-none' />
              )
            ) : (
              <FileText className='w-4 h-4 mr-2 text-[#858585] pointer-events-none' />
            )}

            {renamingFile?.path === file.path ? (
              <input
                type='text'
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => handleRenameFile(file, renameValue)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleRenameFile(file, renameValue)
                  } else if (e.key === 'Escape') {
                    setRenamingFile(null)
                    setRenameValue('')
                  }
                }}
                className='flex-1 bg-[#3c3c3c] text-[#cccccc] px-1 py-0 text-sm border border-[#007acc] rounded'
                autoFocus
              />
            ) : (
              <>
                <span className='truncate flex-1 pointer-events-none'>{file.name}</span>
                {isModified && <span className='ml-1 text-[#f48771] font-bold text-lg leading-none'>●</span>}
              </>
            )}
          </div>
          {file.type === 'directory' && file.children && expandedDirs.has(file.path) && (
            <div>{renderFileTree(file.children, depth + 1)}</div>
          )}
        </div>
      )
    })
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className='flex items-center justify-center h-screen bg-[#1e1e1e]'>
          <div className='flex items-center space-x-2 text-[#cccccc]'>
            <Loader2 className='w-5 h-5 animate-spin' />
            <span>Loading source code...</span>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (!functionData) {
    return (
      <ProtectedRoute>
        <div className='flex items-center justify-center h-screen bg-[#1e1e1e]'>
          <div className='text-[#f48771]'>Failed to load source code</div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      {/* Fullscreen VS Code-like container */}
      <div
        className='flex flex-col h-screen w-screen bg-[#1e1e1e] overflow-hidden'
        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
        {/* Center Monaco Command Palette */}
        <style jsx global>{`
          .monaco-editor .quick-input-widget {
            transform: translateX(calc(-1 * var(--sidebar-width) / 2)) !important;
          }

          .monaco-editor .monaco-hover,
          .monaco-editor .suggest-widget,
          .monaco-editor .parameter-hints-widget,
          .context-view {
            z-index: 2000 !important;
          }
        `}</style>

        {/* Dialog Modal */}
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
          confirmText={dialogState.type === 'alert' ? undefined : 'Deploy'}
          confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
        />

        {/* VS Code-style Title Bar */}
        <div className='h-[35px] bg-[#323233] border-b border-[#1e1e1e] flex items-center justify-between px-2'>
          <div className='flex items-center space-x-3'>
            <button
              onClick={() => {
                if (hasChanges) {
                  if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
                    router.push(`/admin/functions/${functionId}`)
                  }
                } else {
                  router.push(`/admin/functions/${functionId}`)
                }
              }}
              className='p-1 hover:bg-[#2a2d2e] rounded transition-colors'
              title='Exit Code Editor'
            >
              <ArrowLeft className='w-4 h-4 text-[#cccccc]' />
            </button>
            <div className='flex items-center space-x-2 text-[#cccccc] text-sm'>
              <Code className='w-3 h-3 text-[#cccccc]' />
              <span className='text-[#cccccc]'>Code Editor</span>
              <span className='text-[#858585]'>//</span>
              <span className='text-[#cccccc]'>{functionData.functionName}</span>
              <ChevronRight className='w-3 h-3 text-[#858585]' />
              {/* Version dropdown */}
              <div className='relative'>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    setShowVersionDropdown(!showVersionDropdown)
                  }}
                  className='flex items-center space-x-1 text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] px-1.5 py-0.5 rounded transition-colors'
                >
                  <span>v{functionData.version}</span>
                  {functionData.is_active && <span className='text-[#4ec9b0] text-[10px] ml-1'>●</span>}
                  <ChevronDown className='w-3 h-3' />
                </button>
                {showVersionDropdown && (
                  <div
                    className='absolute top-full left-0 mt-1 w-[240px] bg-[#252526] border border-[#3c3c3c] rounded shadow-lg z-[100]'
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Search input */}
                    <div className='px-2 py-1.5 border-b border-[#3c3c3c]'>
                      <input
                        ref={versionSearchRef}
                        type='text'
                        value={versionSearch}
                        onChange={e => setVersionSearch(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Escape') setShowVersionDropdown(false)
                          if (e.key === 'Enter') {
                            const sorted = [...versions].sort((a, b) => b.version - a.version)
                            const filtered = versionSearch.trim()
                              ? sorted.filter(v => String(v.version).includes(versionSearch.trim()))
                              : sorted.slice(0, 5)
                            if (filtered.length === 1) {
                              const v = filtered[0]
                              setShowVersionDropdown(false)
                              if (v.id !== functionData.versionId) {
                                if (!hasChanges || confirm('You have unsaved changes. Switch version anyway?')) {
                                  router.push(`/admin/functions/${functionId}/versions/${v.id}/edit`)
                                }
                              }
                            }
                          }
                        }}
                        placeholder='Search version...'
                        className='w-full bg-[#3c3c3c] text-[#cccccc] placeholder-[#858585] text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-[#007acc]'
                      />
                    </div>
                    {/* Version list */}
                    <div className='max-h-[220px] overflow-y-auto'>
                      {(() => {
                        const sorted = [...versions].sort((a, b) => b.version - a.version)
                        const filtered = versionSearch.trim()
                          ? sorted.filter(v => String(v.version).includes(versionSearch.trim()))
                          : sorted.slice(0, 5)
                        const showingAll = !!versionSearch.trim()
                        return (
                          <>
                            {filtered.map(v => (
                              <button
                                key={v.id}
                                onClick={() => {
                                  setShowVersionDropdown(false)
                                  if (v.id === functionData.versionId) return
                                  if (hasChanges) {
                                    if (!confirm('You have unsaved changes. Switch version anyway?')) return
                                  }
                                  router.push(`/admin/functions/${functionId}/versions/${v.id}/edit`)
                                }}
                                className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors ${
                                  v.id === functionData.versionId
                                    ? 'bg-[#094771] text-[#ffffff]'
                                    : 'text-[#cccccc] hover:bg-[#2a2d2e]'
                                }`}
                              >
                                <div className='flex items-center space-x-2'>
                                  <span>v{v.version}</span>
                                  {v.is_active && (
                                    <span className='text-[9px] bg-[#4ec9b0] text-black px-1.5 py-0 rounded-full font-medium'>
                                      ACTIVE
                                    </span>
                                  )}
                                </div>
                                <div className='flex items-center space-x-1'>
                                  {v.build_status === 'built' && <CheckCircle2 className='w-3 h-3 text-[#4ec9b0]' />}
                                  {v.build_status === 'failed' && <XCircle className='w-3 h-3 text-[#f48771]' />}
                                  {(v.build_status === 'queued' || v.build_status === 'building') && (
                                    <Clock className='w-3 h-3 text-[#dcdcaa]' />
                                  )}
                                </div>
                              </button>
                            ))}
                            {filtered.length === 0 && (
                              <div className='px-3 py-4 text-center text-[#858585] text-xs'>No matching versions</div>
                            )}
                            {!showingAll && versions.length > 5 && (
                              <div className='px-3 py-1.5 text-[10px] text-[#858585] border-t border-[#3c3c3c] text-center'>
                                {versions.length - 5} older version{versions.length - 5 !== 1 ? 's' : ''} — type to
                                search
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                )}
              </div>
              {selectedFile && (
                <>
                  <ChevronRight className='w-3 h-3 text-[#858585]' />
                  <span className='text-[#858585]'>{selectedFile.path}</span>
                </>
              )}
            </div>
          </div>
          <div className='flex items-center space-x-2'>
            {hasChanges && <span className='text-[#ce9178] text-xs'>● Unsaved</span>}

            <button
              onClick={canOverwrite ? handleSaveOverwrite : confirmSave}
              disabled={!hasChanges || saving || deploying}
              className={`flex items-center space-x-2 px-3 py-1 rounded text-sm transition-colors ${
                !hasChanges || saving || deploying
                  ? 'bg-[#2d2d30] text-[#656565] cursor-not-allowed'
                  : 'bg-[#0e639c] text-white hover:bg-[#1177bb]'
              }`}
            >
              {saving ? <Loader2 className='w-4 h-4 animate-spin' /> : <Save className='w-4 h-4' />}
              <span>{saving ? 'Saving...' : canOverwrite ? 'Save' : 'Save as New Version'}</span>
            </button>

            <button
              onClick={handleDeploy}
              disabled={saving || deploying || (functionData.is_active && !hasChanges)}
              className={`flex items-center space-x-2 px-3 py-1 rounded text-sm transition-colors ${
                saving || deploying || (functionData.is_active && !hasChanges)
                  ? 'bg-[#2d2d30] text-[#656565] cursor-not-allowed'
                  : 'bg-[#c72c2c] text-white hover:bg-[#e53935]'
              }`}
            >
              {deploying ? <Loader2 className='w-4 h-4 animate-spin' /> : <Play className='w-4 h-4' />}
              <span>{deploying ? 'Deploying...' : 'Deploy'}</span>
            </button>
          </div>
        </div>

        {/* Main Editor Area */}
        <div className='flex flex-1 overflow-hidden'>
          {/* Sidebar - File Explorer */}
          <div className='bg-[#252526] flex flex-col border-r border-[#1e1e1e]' style={{ width: `${sidebarWidth}px` }}>
            <div className='flex items-center justify-between px-3 py-2 border-b border-[#1e1e1e]'>
              <h3 className='text-xs font-semibold text-[#cccccc] uppercase tracking-wider'>Explorer</h3>
              <div className='flex space-x-1'>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className='p-1 text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] rounded'
                  title='Download Package'
                >
                  {downloading ? <Loader2 className='w-4 h-4 animate-spin' /> : <Download className='w-4 h-4' />}
                </button>
                <button
                  onClick={() => setShowCreateFileModal(true)}
                  className='p-1 text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] rounded'
                  title='New File'
                >
                  <FilePlus className='w-4 h-4' />
                </button>
                <button
                  onClick={() => setShowCreateDirModal(true)}
                  className='p-1 text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] rounded'
                  title='New Folder'
                >
                  <FolderPlus className='w-4 h-4' />
                </button>
              </div>
            </div>
            <div
              className='overflow-y-auto flex-1 flex flex-col'
              onContextMenu={e => handleContextMenu(e, null, true)}
              onDragOver={e => handleDragOver(e, null)}
              onDragLeave={e => handleDragLeave(e, true)}
              onDrop={e => handleDrop(e, null)}
            >
              <div className='p-2'>{renderFileTree(files)}</div>
              {/* Spacer for empty drop area */}
              <div
                className={`flex-1 min-h-[100px] transition-colors ${
                  dragOverFile === 'root' ? 'bg-[#007acc] bg-opacity-10' : ''
                }`}
                onDragOver={e => handleDragOver(e, null)}
                onDrop={e => handleDrop(e, null)}
              />
              {draggedFile && (
                <div
                  className={`mx-2 mb-2 p-3 border-2 border-dashed rounded text-center text-xs transition-colors ${
                    dragOverFile === 'root'
                      ? 'border-[#007acc] bg-[#007acc] bg-opacity-20 text-[#007acc]'
                      : 'border-[#3c3c3c] text-[#858585]'
                  }`}
                  onDragOver={e => handleDragOver(e, null)}
                  onDrop={e => handleDrop(e, null)}
                >
                  Drop here to move to root
                </div>
              )}
            </div>
          </div>

          {/* Resize Handle */}
          <div
            className={`w-1 bg-[#1e1e1e] hover:bg-[#007acc] cursor-col-resize transition-colors ${
              isResizing ? 'bg-[#007acc]' : ''
            }`}
            onMouseDown={handleResizeStart}
          />

          {/* Editor Pane */}
          <div className='flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden'>
            {/* Horizontal Tabs Above Editor */}
            {openTabs.length > 0 && (
              <div className='h-[35px] bg-[#252526] border-b border-[#1e1e1e] flex items-center overflow-x-auto'>
                {openTabs.map(tab => (
                  <div
                    key={tab.path}
                    onClick={() => switchTab(tab)}
                    onMouseDown={e => {
                      // Middle click (button 1) to close tab
                      if (e.button === 1) {
                        e.preventDefault()
                        closeTab(tab.path)
                      }
                    }}
                    className={`flex items-center px-3 py-1 text-sm cursor-pointer border-r border-[#1e1e1e] group min-w-[120px] max-w-[200px] ${
                      activeTabPath === tab.path ? 'bg-[#1e1e1e] text-[#ffffff]' : 'text-[#858585] hover:bg-[#2a2d2e]'
                    }`}
                  >
                    <FileText className='w-3 h-3 mr-2 flex-shrink-0' />
                    <span className='whitespace-nowrap truncate flex-1'>{tab.name}</span>
                    {activeTabPath === tab.path && hasChanges && <span className='text-[#ffffff] mx-1'>●</span>}
                    <button
                      onClick={e => closeTab(tab.path, e)}
                      className='ml-1 opacity-0 group-hover:opacity-100 hover:bg-[#3c3c3c] rounded p-0.5 flex-shrink-0'
                      title='Close'
                    >
                      <svg className='w-3 h-3' viewBox='0 0 16 16' fill='currentColor'>
                        <path d='M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z' />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Monaco Editor */}
            <div className='flex-1 overflow-hidden'>
              {selectedFile ? (
                <MonacoEditor
                  height='100%'
                  path={selectedFile.path}
                  language={getLanguage(selectedFile.name)}
                  theme='vs-dark'
                  value={editorContent}
                  onChange={handleEditorChange}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: 'on',
                    automaticLayout: true,
                    fixedOverflowWidgets: true,
                    scrollBeyondLastLine: false,
                    // IntelliSense configuration
                    quickSuggestions: {
                      other: true,
                      comments: false,
                      strings: true
                    },
                    suggestOnTriggerCharacters: true,
                    acceptSuggestionOnCommitCharacter: true,
                    acceptSuggestionOnEnter: 'on',
                    tabCompletion: 'on',
                    wordBasedSuggestions: 'allDocuments',
                    parameterHints: {
                      enabled: true,
                      cycle: true
                    },
                    hover: {
                      enabled: true,
                      delay: 300
                    },
                    autoClosingBrackets: 'always',
                    autoClosingQuotes: 'always',
                    autoClosingOvertype: 'always',
                    formatOnPaste: true,
                    formatOnType: true,
                    suggest: {
                      showKeywords: true,
                      showSnippets: true,
                      showFunctions: true,
                      showConstructors: true,
                      showFields: true,
                      showVariables: true,
                      showClasses: true,
                      showStructs: true,
                      showInterfaces: true,
                      showModules: true,
                      showProperties: true,
                      showEvents: true,
                      showOperators: true,
                      showUnits: true,
                      showValues: true,
                      showConstants: true,
                      showEnums: true,
                      showEnumMembers: true
                    }
                  }}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor

                    // Load invoke runtime ambient type definitions
                    fetch('/monaco/@types/invoke-ambient.d.ts')
                      .then(r => r.text())
                      .then(dts => {
                        const uri = 'ts:filename/invoke-ambient.d.ts'

                        // Register for both JS and TS
                        for (const lang of ['typescript', 'javascript'] as const) {
                          const defaults =
                            lang === 'typescript'
                              ? monaco.languages.typescript.typescriptDefaults
                              : monaco.languages.typescript.javascriptDefaults

                          defaults.addExtraLib(dts, uri)
                          defaults.setCompilerOptions({
                            ...defaults.getCompilerOptions(),
                            lib: ['es2022', 'dom', 'dom.iterable'],
                            target: monaco.languages.typescript.ScriptTarget.ES2022,
                            // CommonJS + NodeJs resolution so `import fs from 'fs'`
                            // resolves against the @types/node extra libs we've added
                            module: monaco.languages.typescript.ModuleKind.CommonJS,
                            moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
                            // Allow `import fs from 'fs'` (default import of CJS module)
                            esModuleInterop: true,
                            allowSyntheticDefaultImports: true,
                            allowNonTsExtensions: true,
                            allowJs: true,
                            checkJs: true,
                            noImplicitAny: false,
                            strict: false,
                            noLib: false
                          })
                          defaults.setDiagnosticsOptions({
                            ...(defaults.getDiagnosticsOptions?.() ?? {}),
                            diagnosticCodesToIgnore: [7006, 7044]
                          })
                        }

                        if (!__invokeCompletionProvidersRegistered) {
                          __invokeCompletionProvidersRegistered = true

                          // --- Custom hover provider ---
                          // Replaces the built-in TS hover. Queries the TS worker for
                          // quick-info, then overrides `any`-typed req/res/next params
                          // with the correct Invoke platform types.
                          const paramTypeOverrides: Record<string, string> = {
                            req: '(parameter) req: InvokeRequest',
                            res: '(parameter) res: InvokeResponse',
                            next: '(parameter) next: (err?: unknown) => void'
                          }

                          const hoverProvider = {
                            provideHover: async (model: any, position: any) => {
                              const word = model.getWordAtPosition(position)
                              if (!word) return null

                              try {
                                const isJS = model.getLanguageId() === 'javascript'
                                const getWorker = isJS
                                  ? monaco.languages.typescript.getJavaScriptWorker
                                  : monaco.languages.typescript.getTypeScriptWorker
                                const worker = await getWorker()
                                const client = await worker(model.uri)
                                const offset = model.getOffsetAt(position)
                                const info = await (client as any).getQuickInfoAtPosition(model.uri.toString(), offset)
                                if (!info || !info.displayParts) return null

                                const display = (info.displayParts as any[]).map((p: any) => p.text).join('')
                                const range = new monaco.Range(
                                  position.lineNumber,
                                  word.startColumn,
                                  position.lineNumber,
                                  word.endColumn
                                )

                                // Override any-typed req/res/next with correct Invoke types
                                const override = paramTypeOverrides[word.word]
                                const showDisplay = override && display.includes(': any') ? override : display

                                const contents: { value: string }[] = [
                                  { value: '```typescript\n' + showDisplay + '\n```' }
                                ]
                                if (info.documentation?.length) {
                                  contents.push({
                                    value: (info.documentation as any[]).map((d: any) => d.text).join('')
                                  })
                                }
                                if (info.tags?.length) {
                                  for (const tag of info.tags as any[]) {
                                    const tagText = tag.text?.map((t: any) => t.text).join('') ?? ''
                                    contents.push({ value: `*@${tag.name}* — ${tagText}` })
                                  }
                                }
                                return { range, contents }
                              } catch {
                                return null
                              }
                            }
                          }

                          monaco.languages.registerHoverProvider('javascript', hoverProvider)
                          monaco.languages.registerHoverProvider('typescript', hoverProvider)

                          // --- Custom completion provider for req./res. member access ---
                          // Uses hidden helper models where req/res are global-typed vars
                          // (not shadowed by function params) to get correct completions.
                          const reqHelperUri = monaco.Uri.parse('ts:invoke-helper/req.ts')
                          const resHelperUri = monaco.Uri.parse('ts:invoke-helper/res.ts')
                          if (!monaco.editor.getModel(reqHelperUri)) {
                            monaco.editor.createModel('req.', 'typescript', reqHelperUri)
                          }
                          if (!monaco.editor.getModel(resHelperUri)) {
                            monaco.editor.createModel('res.', 'typescript', resHelperUri)
                          }

                          const { CompletionItemKind: CIK } = monaco.languages
                          const kindMap: Record<string, number> = {
                            method: CIK.Method,
                            function: CIK.Function,
                            constructor: CIK.Constructor,
                            field: CIK.Field,
                            member: CIK.Field,
                            variable: CIK.Variable,
                            class: CIK.Class,
                            interface: CIK.Interface,
                            module: CIK.Module,
                            property: CIK.Property,
                            event: CIK.Event,
                            operator: CIK.Operator,
                            unit: CIK.Unit,
                            value: CIK.Value,
                            'enum member': CIK.EnumMember,
                            constant: CIK.Constant,
                            keyword: CIK.Keyword,
                            'type parameter': CIK.TypeParameter,
                            snippet: CIK.Snippet
                          }

                          const completionProvider = {
                            triggerCharacters: ['.'],
                            provideCompletionItems: async (model: any, position: any) => {
                              const lineText = model.getValueInRange({
                                startLineNumber: position.lineNumber,
                                startColumn: 1,
                                endLineNumber: position.lineNumber,
                                endColumn: position.column
                              })
                              const isReq = /\breq\.$/.test(lineText)
                              const isRes = /\bres\.$/.test(lineText)
                              if (!isReq && !isRes) return null

                              try {
                                const helperUri = isReq ? reqHelperUri : resHelperUri
                                const helperModel = monaco.editor.getModel(helperUri)!
                                const workerFn = await monaco.languages.typescript.getTypeScriptWorker()
                                const client = await workerFn(helperUri)
                                const offset = helperModel.getValueLength()
                                const info = await (client as any).getCompletionsAtPosition(
                                  helperUri.toString(),
                                  offset,
                                  undefined
                                )
                                if (!info) return null

                                const word = model.getWordAtPosition(position)
                                const range = {
                                  startLineNumber: position.lineNumber,
                                  endLineNumber: position.lineNumber,
                                  startColumn: word ? word.startColumn : position.column,
                                  endColumn: word ? word.endColumn : position.column
                                }
                                return {
                                  suggestions: (info.entries as any[]).map((e: any) => ({
                                    label: e.name,
                                    kind: kindMap[e.kind as string] ?? CIK.Property,
                                    insertText: e.name,
                                    range,
                                    sortText: e.sortText
                                  }))
                                }
                              } catch {
                                return null
                              }
                            }
                          }

                          monaco.languages.registerCompletionItemProvider('javascript', completionProvider)
                          monaco.languages.registerCompletionItemProvider('typescript', completionProvider)
                        }
                      })
                      .catch(() => {
                        /* silently ignore if types can't load */
                      })

                    // Load @types/node and bun-types as extra libs so Node.js / Bun
                    // globals and APIs get IntelliSense in function source files.
                    // Fetch each package's file list from /monaco/@types/<pkg>/index.json,
                    // then fetch each listed .d.ts file from public assets.
                    const loadPackageTypes = async (pkg: 'node' | 'bun', uriBase: string) => {
                      const indexRes = await fetch(`/monaco/@types/${pkg}/index.json`)
                      if (!indexRes.ok) throw new Error(`Failed to load ${pkg} index.json`)

                      const relPaths = (await indexRes.json()) as string[]
                      const entries = await Promise.all(
                        relPaths.map(async relPath => {
                          const fileRes = await fetch(`/monaco/@types/${pkg}/${relPath}`)
                          if (!fileRes.ok) throw new Error(`Failed to load ${pkg}/${relPath}`)
                          return [relPath, await fileRes.text()] as const
                        })
                      )

                      for (const lang of ['typescript', 'javascript'] as const) {
                        const defaults =
                          lang === 'typescript'
                            ? monaco.languages.typescript.typescriptDefaults
                            : monaco.languages.typescript.javascriptDefaults
                        for (const [relPath, content] of entries) {
                          defaults.addExtraLib(content, `file:///node_modules/${uriBase}/${relPath}`)
                        }
                      }
                    }

                    Promise.all([loadPackageTypes('node', '@types/node'), loadPackageTypes('bun', 'bun-types')]).catch(
                      () => {
                        /* silently ignore if node/bun types can't load */
                      }
                    )

                    // Track cursor position
                    editor.onDidChangeCursorPosition(e => {
                      setCursorPosition({
                        line: e.position.lineNumber,
                        column: e.position.column
                      })
                    })

                    // Register custom Quick Open action
                    editor.addAction({
                      id: 'custom-quick-open',
                      label: 'Go to File...',
                      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP],
                      run: () => {
                        setShowQuickOpen(true)
                        setQuickOpenQuery('')
                        setSelectedQuickOpenIndex(0)
                      }
                    })

                    // Register Find in Files action
                    editor.addAction({
                      id: 'custom-find-in-files',
                      label: 'Find in Files',
                      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
                      run: () => {
                        setShowSearch(true)
                        setSearchQuery('')
                        setSearchResults([])
                        setSelectedSearchIndex(0)
                      }
                    })

                    // Register Find and Replace action
                    editor.addAction({
                      id: 'custom-find-replace',
                      label: 'Find and Replace',
                      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyH],
                      run: () => {
                        setShowFindReplace(true)
                        setFindQuery('')
                        setReplaceValue('')
                        setFindReplaceResults([])
                        setSelectedFindReplaceIndex(0)
                      }
                    })

                    // Register Duplicate Line/Selection action
                    editor.addAction({
                      id: 'custom-duplicate-line',
                      label: 'Duplicate Line',
                      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD],
                      run: () => {
                        const model = editor.getModel()
                        if (!model) return

                        const selection = editor.getSelection()
                        if (!selection) return

                        const isLineSelection =
                          selection.startLineNumber !== selection.endLineNumber ||
                          selection.startColumn !== selection.endColumn

                        if (isLineSelection) {
                          const text = model.getValueInRange(selection)
                          editor.executeEdits('custom-duplicate-line', [
                            {
                              range: new monaco.Range(
                                selection.endLineNumber,
                                selection.endColumn,
                                selection.endLineNumber,
                                selection.endColumn
                              ),
                              text
                            }
                          ])

                          const textLines = text.split(/\r\n|\r|\n/)
                          const endPosition =
                            textLines.length === 1
                              ? {
                                  lineNumber: selection.endLineNumber,
                                  column: selection.endColumn + textLines[0].length
                                }
                              : {
                                  lineNumber: selection.endLineNumber + textLines.length - 1,
                                  column: textLines[textLines.length - 1].length + 1
                                }

                          editor.setSelection(
                            new monaco.Selection(
                              selection.endLineNumber,
                              selection.endColumn,
                              endPosition.lineNumber,
                              endPosition.column
                            )
                          )
                          return
                        }

                        const lineNumber = selection.startLineNumber
                        const lineContent = model.getLineContent(lineNumber)
                        const lineMaxColumn = model.getLineMaxColumn(lineNumber)
                        const eol = model.getEOL()
                        editor.executeEdits('custom-duplicate-line', [
                          {
                            range: new monaco.Range(lineNumber, lineMaxColumn, lineNumber, lineMaxColumn),
                            text: eol + lineContent
                          }
                        ])

                        const nextLine = lineNumber + 1
                        const currentColumn = selection.startColumn
                        const nextLineMaxColumn = model.getLineMaxColumn(nextLine)
                        editor.setPosition({
                          lineNumber: nextLine,
                          column: Math.min(currentColumn, nextLineMaxColumn)
                        })
                      }
                    })
                  }}
                />
              ) : (
                <div className='flex items-center justify-center h-full text-[#858585]'>
                  Select a file to start editing
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Build Panel */}
        {showBuildPanel && (
          <>
            {/* Resize Handle */}
            <div
              className={`h-1 bg-[#1e1e1e] hover:bg-[#007acc] cursor-row-resize transition-colors ${
                isResizingBuildPanel ? 'bg-[#007acc]' : ''
              }`}
              onMouseDown={handleBuildPanelResizeStart}
            />
            <div
              className='bg-[#1e1e1e] border-t border-[#3c3c3c] flex flex-col'
              style={{ height: `${buildPanelHeight}px` }}
            >
              {/* Panel Header */}
              <div className='h-[35px] bg-[#252526] border-b border-[#1e1e1e] flex items-center justify-between px-3 flex-shrink-0'>
                <div className='flex items-center space-x-3'>
                  <div className='flex items-center space-x-2 text-[#cccccc] text-xs font-medium'>
                    <Terminal className='w-3.5 h-3.5' />
                    <span>BUILD</span>
                  </div>
                  {currentBuild && (
                    <div className='flex items-center space-x-1.5'>
                      {currentBuild.status === 'queued' && (
                        <span className='flex items-center space-x-1 text-[10px] text-[#dcdcaa] bg-[#dcdcaa20] px-2 py-0.5 rounded'>
                          <Clock className='w-3 h-3' /> <span>Queued</span>
                        </span>
                      )}
                      {currentBuild.status === 'running' && (
                        <span className='flex items-center space-x-1 text-[10px] text-[#569cd6] bg-[#569cd620] px-2 py-0.5 rounded'>
                          <Loader2 className='w-3 h-3 animate-spin' /> <span>Running</span>
                        </span>
                      )}
                      {currentBuild.status === 'success' && (
                        <span className='flex items-center space-x-1 text-[10px] text-[#4ec9b0] bg-[#4ec9b020] px-2 py-0.5 rounded'>
                          <CheckCircle2 className='w-3 h-3' /> <span>Success</span>
                        </span>
                      )}
                      {currentBuild.status === 'failed' && (
                        <span className='flex items-center space-x-1 text-[10px] text-[#f48771] bg-[#f4877120] px-2 py-0.5 rounded'>
                          <XCircle className='w-3 h-3' /> <span>Failed</span>
                        </span>
                      )}
                      {currentBuild.status === 'cancelled' && (
                        <span className='flex items-center space-x-1 text-[10px] text-[#858585] bg-[#85858520] px-2 py-0.5 rounded'>
                          <Minus className='w-3 h-3' /> <span>Cancelled</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className='flex items-center space-x-1'>
                  <button
                    onClick={() => setShowBuildPanel(false)}
                    className='p-1 hover:bg-[#2a2d2e] rounded transition-colors text-[#858585] hover:text-[#cccccc]'
                    title='Close Panel'
                  >
                    <X className='w-3.5 h-3.5' />
                  </button>
                </div>
              </div>
              {/* Panel Body - Logs */}
              <div className='flex-1 overflow-y-auto bg-black p-3 font-mono text-xs'>
                {!currentBuild && <div className='text-[#858585]'>No build information available.</div>}
                {currentBuild?.status === 'queued' && buildLogs.length === 0 && (
                  <div className='text-[#dcdcaa]'>Waiting for build to start...</div>
                )}
                {currentBuild?.error_message && (
                  <div className='text-[#f48771] mb-2 p-2 bg-[#f4877115] rounded border border-[#f4877130]'>
                    Error: {currentBuild.error_message}
                  </div>
                )}
                {buildLogs.map((log, index) => (
                  <div key={index} className='leading-5 text-[#cccccc]'>
                    <span className='text-[#858585] mr-2 select-none'>
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    {log.message}
                  </div>
                ))}
                {currentBuild?.status === 'success' && (
                  <div className='text-[#4ec9b0] mt-2'>Build completed successfully.</div>
                )}
                {currentBuild?.status === 'failed' && buildLogs.length > 0 && (
                  <div className='text-[#f48771] mt-2'>Build failed.</div>
                )}
                <div ref={buildLogsEndRef} />
              </div>
            </div>
          </>
        )}

        {/* Status Bar - Full Width */}
        <div className='h-[22px] bg-[#007acc] flex items-center justify-between px-4 text-xs text-white'>
          <div className='flex items-center space-x-2'>
            <button
              onClick={() => {
                setShowSearch(true)
                setSearchQuery('')
                setSearchResults([])
                setSelectedSearchIndex(0)
              }}
              className='p-1 hover:bg-[#1177bb] rounded transition-colors'
              title='Find in Files (Ctrl+Shift+F)'
            >
              <Search className='w-4 h-4' />
            </button>
            <button
              onClick={() => {
                setShowFindReplace(true)
                setFindQuery('')
                setReplaceValue('')
                setFindReplaceResults([])
                setSelectedFindReplaceIndex(0)
              }}
              className='p-1 hover:bg-[#1177bb] rounded transition-colors'
              title='Find and Replace (Ctrl+Shift+H)'
            >
              <Replace className='w-4 h-4' />
            </button>
            <button
              onClick={() => setShowBuildPanel(!showBuildPanel)}
              className={`flex items-center space-x-1 p-1 hover:bg-[#1177bb] rounded transition-colors ${showBuildPanel ? 'bg-[#1177bb]' : ''}`}
              title='Toggle Build Panel'
            >
              <Terminal className='w-3.5 h-3.5' />
              <span>Build</span>
              {currentBuild && isBuildActive && <Loader2 className='w-3 h-3 animate-spin' />}
            </button>
          </div>

          <div className='flex items-center space-x-4'>
            <button
              onClick={handleGoToLine}
              className='hover:bg-[#1177bb] px-2 py-0.5 rounded cursor-pointer'
              title='Go to Line/Column'
            >
              Ln {cursorPosition.line}, Col {cursorPosition.column}
            </button>
            {selectedFile && <span className='text-white'>{getLanguage(selectedFile.name).toUpperCase()}</span>}
          </div>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <>
            <div className='fixed inset-0 z-40' onClick={closeContextMenu} />
            <div
              className='fixed bg-[#3c3c3c] border border-[#454545] rounded shadow-lg z-50 py-1 min-w-[180px]'
              style={{
                left: `${contextMenu.x}px`,
                top: `${contextMenu.y}px`
              }}
            >
              {(contextMenu.file?.type === 'directory' || contextMenu.isBlankSpace) && (
                <>
                  <button
                    onClick={() => handleContextMenuAction('newFile')}
                    className='w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#2a2d2e] flex items-center'
                  >
                    <FilePlus className='w-4 h-4 mr-3' />
                    New File
                  </button>
                  <button
                    onClick={() => handleContextMenuAction('newFolder')}
                    className='w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#2a2d2e] flex items-center'
                  >
                    <FolderPlus className='w-4 h-4 mr-3' />
                    New Folder
                  </button>
                  {!contextMenu.isBlankSpace && <div className='h-px bg-[#454545] my-1' />}
                </>
              )}
              {!contextMenu.isBlankSpace && contextMenu.file && (
                <>
                  <button
                    onClick={() => handleContextMenuAction('rename')}
                    className='w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#2a2d2e] flex items-center'
                  >
                    <Pencil className='w-4 h-4 mr-3' />
                    Rename
                  </button>
                  <button
                    onClick={() => handleContextMenuAction('delete')}
                    className='w-full text-left px-3 py-1.5 text-sm text-[#f48771] hover:bg-[#2a2d2e] flex items-center'
                  >
                    <Trash2 className='w-4 h-4 mr-3' />
                    Delete
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* Create File Modal */}
        {showCreateFileModal && (
          <Modal
            isOpen={showCreateFileModal}
            title={parentDirectory ? `Create New File in ${parentDirectory.name}` : 'Create New File'}
            onCancel={() => {
              setShowCreateFileModal(false)
              setNewFileName('')
              setParentDirectory(null)
            }}
            onConfirm={handleCreateFile}
            cancelText='Cancel'
            confirmText='Create'
          >
            <input
              type='text'
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              placeholder='Enter file name (e.g., utils.js)'
              className='w-full px-3 py-2 bg-[#3c3c3c] border border-[#454545] rounded text-[#cccccc] placeholder-[#858585] focus:border-[#007acc] focus:outline-none'
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleCreateFile()
                } else if (e.key === 'Escape') {
                  setShowCreateFileModal(false)
                  setNewFileName('')
                  setParentDirectory(null)
                }
              }}
              autoFocus
            />
          </Modal>
        )}

        {/* Create Directory Modal */}
        {showCreateDirModal && (
          <Modal
            isOpen={showCreateDirModal}
            title={parentDirectory ? `Create New Directory in ${parentDirectory.name}` : 'Create New Directory'}
            onCancel={() => {
              setShowCreateDirModal(false)
              setNewDirName('')
              setParentDirectory(null)
            }}
            onConfirm={handleCreateDirectory}
            cancelText='Cancel'
            confirmText='Create'
          >
            <input
              type='text'
              value={newDirName}
              onChange={e => setNewDirName(e.target.value)}
              placeholder='Enter directory name (e.g., lib)'
              className='w-full px-3 py-2 bg-[#3c3c3c] border border-[#454545] rounded text-[#cccccc] placeholder-[#858585] focus:border-[#007acc] focus:outline-none'
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleCreateDirectory()
                } else if (e.key === 'Escape') {
                  setShowCreateDirModal(false)
                  setNewDirName('')
                  setParentDirectory(null)
                }
              }}
              autoFocus
            />
          </Modal>
        )}

        {/* Save Confirmation Modal */}
        {showSaveConfirmModal && (
          <Modal
            isOpen={showSaveConfirmModal}
            title='Save as New Version'
            description='This will create a new version of the function. Continue?'
            onCancel={() => setShowSaveConfirmModal(false)}
            onConfirm={handleSave}
            cancelText='Cancel'
            confirmText='Save'
          />
        )}

        {/* Quick Open File Picker (Ctrl+P) - Monaco-style */}
        {showQuickOpen && (
          <>
            <div className='fixed inset-0 z-50' onClick={() => setShowQuickOpen(false)} />
            <div className='fixed top-[15%] left-1/2 -translate-x-1/2 z-[60] w-[600px] bg-[#252526] border border-[#454545] shadow-2xl'>
              <input
                type='text'
                value={quickOpenQuery}
                onChange={e => {
                  setQuickOpenQuery(e.target.value)
                  setSelectedQuickOpenIndex(0)
                }}
                onKeyDown={e => {
                  const filteredFiles = getFilteredFiles()
                  if (e.key === 'Escape') {
                    setShowQuickOpen(false)
                    setQuickOpenQuery('')
                  } else if (e.key === 'Enter' && filteredFiles.length > 0) {
                    handleQuickOpenSelect(filteredFiles[selectedQuickOpenIndex])
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedQuickOpenIndex(prev => Math.min(prev + 1, filteredFiles.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedQuickOpenIndex(prev => Math.max(prev - 1, 0))
                  }
                }}
                placeholder='Search files by name'
                className='w-full px-4 py-3 bg-[#3c3c3c] text-[#cccccc] placeholder-[#858585] focus:outline-none text-[13px] font-mono'
                autoFocus
              />
              <div className='max-h-[400px] overflow-y-auto bg-[#252526]'>
                {getFilteredFiles().length > 0 ? (
                  getFilteredFiles().map((file, index) => (
                    <div
                      key={file.path}
                      onClick={() => handleQuickOpenSelect(file)}
                      onMouseEnter={() => setSelectedQuickOpenIndex(index)}
                      className={`px-3 py-2 cursor-pointer flex items-center space-x-3 ${
                        index === selectedQuickOpenIndex ? 'bg-[#094771]' : 'hover:bg-[#2a2d2e]'
                      }`}
                    >
                      <FileText className='w-4 h-4 text-[#858585] flex-shrink-0' />
                      <div className='flex-1 min-w-0'>
                        <div className='text-[#cccccc] text-[13px] font-mono truncate'>{file.name}</div>
                        <div className='text-[#858585] text-[11px] font-mono truncate'>{file.path}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className='px-4 py-8 text-center text-[#858585] text-[13px]'>
                    {quickOpenQuery ? 'No matching files' : 'No files in workspace'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Find in Files Modal (Ctrl+Shift+F) */}
        {showSearch && (
          <>
            <div className='fixed inset-0 z-50' onClick={() => setShowSearch(false)} />
            <div className='fixed top-[15%] left-1/2 -translate-x-1/2 z-[60] w-[700px] bg-[#252526] border border-[#454545] shadow-2xl'>
              <input
                type='text'
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value)
                  searchInFiles(e.target.value)
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setShowSearch(false)
                    setSearchQuery('')
                    setSearchResults([])
                  } else if (e.key === 'Enter' && searchResults.length > 0) {
                    handleSearchResultSelect(searchResults[selectedSearchIndex])
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedSearchIndex(prev => Math.min(prev + 1, searchResults.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedSearchIndex(prev => Math.max(prev - 1, 0))
                  }
                }}
                placeholder='Search in files...'
                className='w-full px-4 py-3 bg-[#3c3c3c] text-[#cccccc] placeholder-[#858585] focus:outline-none text-[13px] font-mono'
                autoFocus
              />
              <div className='max-h-[500px] overflow-y-auto bg-[#252526]'>
                {isSearching ? (
                  <div className='px-4 py-8 text-center text-[#858585] text-[13px]'>Searching...</div>
                ) : searchResults.length > 0 ? (
                  <>
                    <div className='px-4 py-2 bg-[#2d2d30] text-[#858585] text-[11px] border-b border-[#454545]'>
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} in{' '}
                      {new Set(searchResults.map(r => r.file.path)).size} file
                      {new Set(searchResults.map(r => r.file.path)).size !== 1 ? 's' : ''}
                      {searchResults.length >= 1000 && (
                        <span className='ml-2 text-[#ffa500]'>(showing first 1000)</span>
                      )}
                    </div>
                    {searchResults.map((result, index) => {
                      const trimmedText = result.lineText.trim()
                      const leadingWhitespace =
                        result.lineText.length -
                        trimmedText.length +
                        (result.lineText.length - result.lineText.trimEnd().length)
                      const leadingWhitespaceCount = result.lineText.search(/\S/)
                      const adjustedStart = Math.max(
                        0,
                        result.matchStart - (leadingWhitespaceCount === -1 ? 0 : leadingWhitespaceCount)
                      )
                      const adjustedEnd = Math.max(
                        0,
                        result.matchEnd - (leadingWhitespaceCount === -1 ? 0 : leadingWhitespaceCount)
                      )

                      const highlightedText = (
                        <>
                          {trimmedText.substring(0, adjustedStart)}
                          <span className='bg-[#ffa500] text-black px-0.5'>
                            {trimmedText.substring(adjustedStart, adjustedEnd)}
                          </span>
                          {trimmedText.substring(adjustedEnd)}
                        </>
                      )

                      return (
                        <div
                          key={`${result.file.path}-${result.line}-${index}`}
                          onClick={() => handleSearchResultSelect(result)}
                          onMouseEnter={() => setSelectedSearchIndex(index)}
                          className={`px-3 py-2 cursor-pointer border-b border-[#1e1e1e] ${
                            index === selectedSearchIndex ? 'bg-[#094771]' : 'hover:bg-[#2a2d2e]'
                          }`}
                        >
                          <div className='flex items-center space-x-2 mb-1'>
                            <FileText className='w-3 h-3 text-[#858585] flex-shrink-0' />
                            <span className='text-[#cccccc] text-[11px] font-mono'>{result.file.path}</span>
                            <span className='text-[#858585] text-[11px]'>:</span>
                            <span className='text-[#4ec9b0] text-[11px]'>{result.line}</span>
                          </div>
                          <div className='text-[#cccccc] text-[12px] font-mono ml-5 truncate'>{highlightedText}</div>
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <div className='px-4 py-8 text-center text-[#858585] text-[13px]'>
                    {searchQuery ? 'No results found' : 'Type to search in all files'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Find and Replace (Ctrl+Shift+H) - Monaco-style */}
        {showFindReplace && (
          <>
            <div className='fixed inset-0 z-50' onClick={() => setShowFindReplace(false)} />
            <div className='fixed top-[15%] left-1/2 -translate-x-1/2 z-[60] w-[700px] bg-[#252526] border border-[#454545] shadow-2xl'>
              {/* Find input */}
              <div className='border-b border-[#454545]'>
                <input
                  type='text'
                  value={findQuery}
                  onChange={e => {
                    setFindQuery(e.target.value)
                    searchInFilesForReplace(e.target.value)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setShowFindReplace(false)
                      setFindQuery('')
                      setReplaceValue('')
                      setFindReplaceResults([])
                    } else if (e.key === 'Enter' && findReplaceResults.length > 0) {
                      handleFindReplaceSelect(findReplaceResults[selectedFindReplaceIndex])
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSelectedFindReplaceIndex(prev => Math.min(prev + 1, findReplaceResults.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSelectedFindReplaceIndex(prev => Math.max(prev - 1, 0))
                    }
                  }}
                  placeholder='Find...'
                  className='w-full px-4 py-3 bg-[#3c3c3c] text-[#cccccc] placeholder-[#858585] focus:outline-none text-[13px] font-mono'
                  autoFocus
                />
              </div>

              {/* Replace input */}
              <div className='border-b border-[#454545]'>
                <input
                  type='text'
                  value={replaceValue}
                  onChange={e => setReplaceValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setShowFindReplace(false)
                      setFindQuery('')
                      setReplaceValue('')
                      setFindReplaceResults([])
                    }
                  }}
                  placeholder='Replace with...'
                  className='w-full px-4 py-3 bg-[#3c3c3c] text-[#cccccc] placeholder-[#858585] focus:outline-none text-[13px] font-mono'
                />
              </div>

              {/* Replace buttons */}
              <div className='px-4 py-2 bg-[#2d2d30] border-b border-[#454545] flex items-center space-x-2'>
                <button
                  onClick={() => handleReplaceOne(findReplaceResults[selectedFindReplaceIndex])}
                  disabled={findReplaceResults.length === 0}
                  className='px-3 py-1 text-xs bg-[#0e639c] text-white hover:bg-[#1177bb] disabled:bg-[#2d2d30] disabled:text-[#656565] rounded'
                  title='Replace'
                >
                  Replace
                </button>
                <button
                  onClick={handleReplaceAll}
                  disabled={findReplaceResults.length === 0}
                  className='px-3 py-1 text-xs bg-[#0e639c] text-white hover:bg-[#1177bb] disabled:bg-[#2d2d30] disabled:text-[#656565] rounded'
                  title='Replace All'
                >
                  Replace All ({findReplaceResults.length})
                </button>
              </div>

              {/* Results */}
              <div className='max-h-[400px] overflow-y-auto bg-[#252526]'>
                {isFindReplaceSearching ? (
                  <div className='px-4 py-8 text-center text-[#858585] text-[13px]'>Searching...</div>
                ) : findReplaceResults.length > 0 ? (
                  <>
                    <div className='px-4 py-2 bg-[#2d2d30] text-[#858585] text-[11px] border-b border-[#454545]'>
                      {findReplaceResults.length} result{findReplaceResults.length !== 1 ? 's' : ''} in{' '}
                      {new Set(findReplaceResults.map(r => r.file.path)).size} file
                      {new Set(findReplaceResults.map(r => r.file.path)).size !== 1 ? 's' : ''}
                      {findReplaceResults.length >= 1000 && (
                        <span className='ml-2 text-[#ffa500]'>(showing first 1000)</span>
                      )}
                    </div>
                    {findReplaceResults.map((result, index) => {
                      const trimmedText = result.lineText.trim()
                      const leadingWhitespaceCount = result.lineText.search(/\S/)
                      const adjustedStart = Math.max(
                        0,
                        result.matchStart - (leadingWhitespaceCount === -1 ? 0 : leadingWhitespaceCount)
                      )
                      const adjustedEnd = Math.max(
                        0,
                        result.matchEnd - (leadingWhitespaceCount === -1 ? 0 : leadingWhitespaceCount)
                      )

                      const highlightedText = (
                        <>
                          {trimmedText.substring(0, adjustedStart)}
                          <span className='bg-[#ffa500] text-black px-0.5'>
                            {trimmedText.substring(adjustedStart, adjustedEnd)}
                          </span>
                          {trimmedText.substring(adjustedEnd)}
                        </>
                      )

                      return (
                        <div
                          key={`${result.file.path}-${result.line}-${index}`}
                          onClick={() => handleFindReplaceSelect(result)}
                          onMouseEnter={() => setSelectedFindReplaceIndex(index)}
                          className={`px-3 py-2 cursor-pointer border-b border-[#1e1e1e] flex items-center justify-between group ${
                            index === selectedFindReplaceIndex ? 'bg-[#094771]' : 'hover:bg-[#2a2d2e]'
                          }`}
                        >
                          <div>
                            <div className='flex items-center space-x-2 mb-1'>
                              <FileText className='w-3 h-3 text-[#858585] flex-shrink-0' />
                              <span className='text-[#cccccc] text-[11px] font-mono'>{result.file.path}</span>
                              <span className='text-[#858585] text-[11px]'>:</span>
                              <span className='text-[#4ec9b0] text-[11px]'>{result.line}</span>
                            </div>
                            <div className='text-[#cccccc] text-[12px] font-mono ml-5 truncate'>{highlightedText}</div>
                          </div>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              handleReplaceOne(result)
                            }}
                            className='px-2 py-1 text-xs bg-[#0e639c] text-white hover:bg-[#1177bb] rounded opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0'
                          >
                            Replace
                          </button>
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <div className='px-4 py-8 text-center text-[#858585] text-[13px]'>
                    {findQuery ? 'No results found' : 'Type to find and replace'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  )
}
