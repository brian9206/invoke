import { useState, useEffect, useRef, type JSX } from 'react';
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
  FilePlus,
  FolderPlus,
  Pencil,
  Code
} from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import toast from 'react-hot-toast'

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
  const [dialogState, setDialogState] = useState<{ type: 'alert' | 'confirm' | null; title: string; message: string; onConfirm?: () => void | Promise<void> }>({ type: null, title: '', message: '' })
  
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
  const [searchResults, setSearchResults] = useState<Array<{file: FileNode, line: number, lineText: string, matchStart: number, matchEnd: number}>>([])
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  
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
          confirmSave()
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
    setOpenTabs(prev => prev.map(tab => 
      tab.path === file.path ? { ...tab, content } : tab
    ))
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
    
    const newPath = file.path.includes('/') 
      ? file.path.substring(0, file.path.lastIndexOf('/') + 1) + newName
      : newName
    
    setFiles(prev => updateFileNames(prev, file.path, newPath))
    
    // Update selected file if it's the one being renamed
    if (selectedFile?.path === file.path) {
      setSelectedFile({ ...file, name: newName, path: newPath })
    }
    
    // Update tabs if file is open
    setOpenTabs(prev => prev.map(tab => 
      tab.path === file.path ? { ...tab, name: newName, path: newPath } : tab
    ))
    
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
      message: 'Deploying will create a new version and will immediately switch. Continue?',
      onConfirm: async () => {
        setDeploying(true)
        
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
            toast.success(`Version ${result.data.version} deployed and activated successfully!`)
            setHasChanges(false)
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
            toast.error(result.message || 'Failed to deploy version')
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
      .filter(file => 
        file.path.toLowerCase().includes(query) || 
        file.name.toLowerCase().includes(query)
      )
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
      const results: Array<{file: FileNode, line: number, lineText: string, matchStart: number, matchEnd: number}> = []
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
                lineText: lineText.trim(),
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

  const handleSearchResultSelect = (result: typeof searchResults[0]) => {
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

  const handleDragOver = (e: React.DragEvent, file: FileNode | null) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Allow dropping on directories and on null (root)
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
    
    // Only stop propagation if dropping on a specific file/folder
    if (targetFile) {
      e.stopPropagation()
    }
    
    setDragOverFile(null)
    
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
      setOpenTabs(prev => prev.map(tab => {
        if (tab.path === oldPath) {
          return { ...tab, path: newPath }
        } else if (tab.path.startsWith(oldPath + '/')) {
          const relativePath = tab.path.substring(oldPath.length)
          return { ...tab, path: newPath + relativePath }
        }
        return tab
      }))
      
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
    setOpenTabs(prev => prev.map(tab => {
      if (tab.path === oldPath) {
        return { ...tab, path: newPath }
      } else if (tab.path.startsWith(oldPath + '/')) {
        // Update child file paths if moving a directory
        const relativePath = tab.path.substring(oldPath.length)
        return { ...tab, path: newPath + relativePath }
      }
      return tab
    }))
    
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

  const renderFileTree = (files: FileNode[], depth = 0): JSX.Element[] => {
    // Sort files: directories first, then files, alphabetically within each group
    const sortedFiles = [...files].sort((a, b) => {
      // Directories come before files
      if (a.type === 'directory' && b.type === 'file') return -1
      if (a.type === 'file' && b.type === 'directory') return 1
      // Within same type, sort alphabetically (case-insensitive)
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })
    
    return sortedFiles.map((file) => (
      <div key={file.path}>
        <div
          className={`flex items-center py-1 px-2 text-sm cursor-pointer rounded group ${
            dragOverFile === file.path ? 'bg-[#007acc] text-[#ffffff]' :
            selectedFile?.path === file.path ? 'bg-[#37373d] text-[#ffffff]' : 'text-[#cccccc] hover:bg-[#2a2d2e]'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          draggable
          onDragStart={(e) => {
            e.stopPropagation()
            handleDragStart(e, file)
          }}
          onDragEnd={(e) => {
            e.stopPropagation()
            handleDragEnd(e)
          }}
          onDragOver={(e) => {
            // Stop propagation to prevent parent from receiving event
            e.stopPropagation()
            handleDragOver(e, file)
          }}
          onDragLeave={(e) => {
            e.stopPropagation()
            handleDragLeave(e, false)
          }}
          onDrop={(e) => {
            e.stopPropagation()
            handleDrop(e, file)
          }}
          onClick={() => handleFileSelect(file)}
          onContextMenu={(e) => handleContextMenu(e, file)}
        >
          {file.type === 'directory' ? (
            expandedDirs.has(file.path) ? (
              <FolderOpen className="w-4 h-4 mr-2 text-[#dcb67a] pointer-events-none" />
            ) : (
              <Folder className="w-4 h-4 mr-2 text-[#dcb67a] pointer-events-none" />
            )
          ) : (
            <FileText className="w-4 h-4 mr-2 text-[#858585] pointer-events-none" />
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
              className="flex-1 bg-[#3c3c3c] text-[#cccccc] px-1 py-0 text-sm border border-[#007acc] rounded"
              autoFocus
            />
          ) : (
            <>
              <span className="truncate flex-1 pointer-events-none">{file.name}</span>
              <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    startRename(file)
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => e.stopPropagation()}
                  className="p-1 text-[#858585] hover:text-[#cccccc] text-xs"
                  title="Rename"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteFile(file)
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => e.stopPropagation()}
                  className="p-1 text-[#858585] hover:text-[#f48771] text-xs"
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
        <div className="flex items-center justify-center h-screen bg-[#1e1e1e]">
          <div className="flex items-center space-x-2 text-[#cccccc]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading source code...</span>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (!functionData) {
    return (
      <ProtectedRoute>
        <div className="flex items-center justify-center h-screen bg-[#1e1e1e]">
          <div className="text-[#f48771]">Failed to load source code</div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      {/* Fullscreen VS Code-like container */}
      <div 
        className="flex flex-col h-screen w-screen bg-[#1e1e1e] overflow-hidden"
        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
        {/* Center Monaco Command Palette */}
        <style jsx global>{`
          .monaco-editor .quick-input-widget {
            transform: translateX(calc(-1 * var(--sidebar-width) / 2)) !important;
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
              await dialogState.onConfirm();
            } else {
              setDialogState({ type: null, title: '', message: '' });
            }
          }}
          cancelText={dialogState.type === 'alert' ? 'OK' : 'Cancel'}
          confirmText={dialogState.type === 'alert' ? undefined : 'Deploy'}
          confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
        />

        {/* VS Code-style Title Bar */}
        <div className="h-[35px] bg-[#323233] border-b border-[#1e1e1e] flex items-center justify-between px-2">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                if (hasChanges) {
                  if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
                    router.push(`/admin/functions/${functionId}/versioning`)
                  }
                } else {
                  router.push(`/admin/functions/${functionId}/versioning`)
                }
              }}
              className="p-1 hover:bg-[#2a2d2e] rounded transition-colors"
              title="Exit Code Editor"
            >
              <ArrowLeft className="w-4 h-4 text-[#cccccc]" />
            </button>
            <div className="flex items-center space-x-2 text-[#cccccc] text-sm">
              <Code className="w-3 h-3 text-[#cccccc]" />
              <span className="text-[#cccccc]">Code Editor</span>
              <span className="text-[#858585]">//</span>
              <span className="text-[#cccccc]">{functionData.functionName}</span>
              <ChevronRight className="w-3 h-3 text-[#858585]" />
              <span className="text-[#858585]">v{functionData.version}</span>
              {selectedFile && (
                <>
                  <ChevronRight className="w-3 h-3 text-[#858585]" />
                  <span className="text-[#858585]">{selectedFile.path}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {hasChanges && (
              <span className="text-[#ce9178] text-xs">● Unsaved</span>
            )}
            
            <button
              onClick={confirmSave}
              disabled={!hasChanges || saving || deploying}
              className={`flex items-center space-x-2 px-3 py-1 rounded text-sm transition-colors ${
                !hasChanges || saving || deploying 
                  ? 'bg-[#2d2d30] text-[#656565] cursor-not-allowed' 
                  : 'bg-[#0e639c] text-white hover:bg-[#1177bb]'
              }`}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{saving ? 'Saving...' : 'Save as New Version'}</span>
            </button>
            
            <button
              onClick={handleDeploy}
              disabled={!hasChanges || saving || deploying}
              className={`flex items-center space-x-2 px-3 py-1 rounded text-sm transition-colors ${
                !hasChanges || saving || deploying 
                  ? 'bg-[#2d2d30] text-[#656565] cursor-not-allowed' 
                  : 'bg-[#c72c2c] text-white hover:bg-[#e53935]'
              }`}
            >
              {deploying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>{deploying ? 'Deploying...' : 'Deploy'}</span>
            </button>
          </div>
        </div>

        {/* Main Editor Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - File Explorer */}
          <div 
            className="bg-[#252526] flex flex-col border-r border-[#1e1e1e]"
            style={{ width: `${sidebarWidth}px` }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e1e]">
              <h3 className="text-xs font-semibold text-[#cccccc] uppercase tracking-wider">
                Explorer
              </h3>
              <div className="flex space-x-1">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="p-1 text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] rounded"
                  title="Download Package"
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => setShowCreateFileModal(true)}
                  className="p-1 text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] rounded"
                  title="New File"
                >
                  <FilePlus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowCreateDirModal(true)}
                  className="p-1 text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] rounded"
                  title="New Folder"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div 
              className="overflow-y-auto flex-1 flex flex-col"
              onContextMenu={(e) => handleContextMenu(e, null, true)}
              onDragOver={(e) => handleDragOver(e, null)}
              onDragLeave={(e) => handleDragLeave(e, true)}
              onDrop={(e) => handleDrop(e, null)}
            >
              <div className="p-2">
                {renderFileTree(files)}
              </div>
              {/* Spacer for empty drop area */}
              <div 
                className={`flex-1 min-h-[100px] transition-colors ${
                  dragOverFile === 'root' ? 'bg-[#007acc] bg-opacity-10' : ''
                }`}
                onDragOver={(e) => handleDragOver(e, null)}
                onDrop={(e) => handleDrop(e, null)}
              />
              {draggedFile && (
                <div 
                  className={`mx-2 mb-2 p-3 border-2 border-dashed rounded text-center text-xs transition-colors ${
                    dragOverFile === 'root' 
                      ? 'border-[#007acc] bg-[#007acc] bg-opacity-20 text-[#007acc]' 
                      : 'border-[#3c3c3c] text-[#858585]'
                  }`}
                  onDragOver={(e) => handleDragOver(e, null)}
                  onDrop={(e) => handleDrop(e, null)}
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
          <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
            {/* Horizontal Tabs Above Editor */}
            {openTabs.length > 0 && (
              <div className="h-[35px] bg-[#252526] border-b border-[#1e1e1e] flex items-center overflow-x-auto">
                {openTabs.map((tab) => (
                  <div
                    key={tab.path}
                    onClick={() => switchTab(tab)}
                    onMouseDown={(e) => {
                      // Middle click (button 1) to close tab
                      if (e.button === 1) {
                        e.preventDefault()
                        closeTab(tab.path)
                      }
                    }}
                    className={`flex items-center px-3 py-1 text-sm cursor-pointer border-r border-[#1e1e1e] group min-w-[120px] max-w-[200px] ${
                      activeTabPath === tab.path
                        ? 'bg-[#1e1e1e] text-[#ffffff]'
                        : 'text-[#858585] hover:bg-[#2a2d2e]'
                    }`}
                  >
                    <FileText className="w-3 h-3 mr-2 flex-shrink-0" />
                    <span className="whitespace-nowrap truncate flex-1">{tab.name}</span>
                    {activeTabPath === tab.path && hasChanges && (
                      <span className="text-[#ffffff] mx-1">●</span>
                    )}
                    <button
                      onClick={(e) => closeTab(tab.path, e)}
                      className="ml-1 opacity-0 group-hover:opacity-100 hover:bg-[#3c3c3c] rounded p-0.5 flex-shrink-0"
                      title="Close"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden">{selectedFile ? (
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
                    
                    // Track cursor position
                    editor.onDidChangeCursorPosition((e) => {
                      setCursorPosition({
                        line: e.position.lineNumber,
                        column: e.position.column
                      })
                    })
                    
                    // Register custom Quick Open action
                    editor.addAction({
                      id: 'custom-quick-open',
                      label: 'Go to File...',
                      keybindings: [
                        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP
                      ],
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
                      keybindings: [
                        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF
                      ],
                      run: () => {
                        setShowSearch(true)
                        setSearchQuery('')
                        setSearchResults([])
                        setSelectedSearchIndex(0)
                      }
                    })
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[#858585]">
                  Select a file to start editing
                </div>
              )}
            </div>
            
          </div>
        </div>
        
        {/* Status Bar - Full Width */}
        <div className="h-[22px] bg-[#007acc] flex items-center justify-end px-4 text-xs text-white">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleGoToLine}
              className="hover:bg-[#1177bb] px-2 py-0.5 rounded cursor-pointer"
              title="Go to Line/Column"
            >
              Ln {cursorPosition.line}, Col {cursorPosition.column}
            </button>
            {selectedFile && (
              <span className="text-white">
                {getLanguage(selectedFile.name).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <>
            <div 
              className="fixed inset-0 z-40"
              onClick={closeContextMenu}
            />
            <div
              className="fixed bg-[#3c3c3c] border border-[#454545] rounded shadow-lg z-50 py-1 min-w-[180px]"
              style={{
                left: `${contextMenu.x}px`,
                top: `${contextMenu.y}px`
              }}
            >
              {(contextMenu.file?.type === 'directory' || contextMenu.isBlankSpace) && (
                <>
                  <button
                    onClick={() => handleContextMenuAction('newFile')}
                    className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#2a2d2e] flex items-center"
                  >
                    <FilePlus className="w-4 h-4 mr-3" />
                    New File
                  </button>
                  <button
                    onClick={() => handleContextMenuAction('newFolder')}
                    className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#2a2d2e] flex items-center"
                  >
                    <FolderPlus className="w-4 h-4 mr-3" />
                    New Folder
                  </button>
                  {!contextMenu.isBlankSpace && <div className="h-px bg-[#454545] my-1" />}
                </>
              )}
              {!contextMenu.isBlankSpace && contextMenu.file && (
                <>
                  <button
                    onClick={() => handleContextMenuAction('rename')}
                    className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#2a2d2e] flex items-center"
                  >
                    <Pencil className="w-4 h-4 mr-3" />
                    Rename
                  </button>
                  <button
                    onClick={() => handleContextMenuAction('delete')}
                    className="w-full text-left px-3 py-1.5 text-sm text-[#f48771] hover:bg-[#2a2d2e] flex items-center"
                  >
                    <Trash2 className="w-4 h-4 mr-3" />
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
            title={parentDirectory ? `Create New File in ${parentDirectory.name}` : "Create New File"}
            onCancel={() => {
              setShowCreateFileModal(false);
              setNewFileName('');
              setParentDirectory(null);
            }}
            onConfirm={handleCreateFile}
            cancelText="Cancel"
            confirmText="Create"
          >
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="Enter file name (e.g., utils.js)"
              className="w-full px-3 py-2 bg-[#3c3c3c] border border-[#454545] rounded text-[#cccccc] placeholder-[#858585] focus:border-[#007acc] focus:outline-none"
              onKeyDown={(e) => {
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
            title={parentDirectory ? `Create New Directory in ${parentDirectory.name}` : "Create New Directory"}
            onCancel={() => {
              setShowCreateDirModal(false);
              setNewDirName('');
              setParentDirectory(null);
            }}
            onConfirm={handleCreateDirectory}
            cancelText="Cancel"
            confirmText="Create"
          >
            <input
              type="text"
              value={newDirName}
              onChange={(e) => setNewDirName(e.target.value)}
              placeholder="Enter directory name (e.g., lib)"
              className="w-full px-3 py-2 bg-[#3c3c3c] border border-[#454545] rounded text-[#cccccc] placeholder-[#858585] focus:border-[#007acc] focus:outline-none"
              onKeyDown={(e) => {
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
            title="Save as New Version"
            description="This will create a new version of the function. Continue?"
            onCancel={() => setShowSaveConfirmModal(false)}
            onConfirm={handleSave}
            cancelText="Cancel"
            confirmText="Save"
          />
        )}

        {/* Quick Open File Picker (Ctrl+P) - Monaco-style */}
        {showQuickOpen && (
          <>
            <div 
              className="fixed inset-0 z-50"
              onClick={() => setShowQuickOpen(false)}
            />
            <div className="fixed top-[15%] left-1/2 -translate-x-1/2 z-[60] w-[600px] bg-[#252526] border border-[#454545] shadow-2xl">
              <input
                type="text"
                value={quickOpenQuery}
                onChange={(e) => {
                  setQuickOpenQuery(e.target.value)
                  setSelectedQuickOpenIndex(0)
                }}
                onKeyDown={(e) => {
                  const filteredFiles = getFilteredFiles()
                  if (e.key === 'Escape') {
                    setShowQuickOpen(false)
                    setQuickOpenQuery('')
                  } else if (e.key === 'Enter' && filteredFiles.length > 0) {
                    handleQuickOpenSelect(filteredFiles[selectedQuickOpenIndex])
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedQuickOpenIndex(prev => 
                      Math.min(prev + 1, filteredFiles.length - 1)
                    )
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedQuickOpenIndex(prev => Math.max(prev - 1, 0))
                  }
                }}
                placeholder="Search files by name"
                className="w-full px-4 py-3 bg-[#3c3c3c] text-[#cccccc] placeholder-[#858585] focus:outline-none text-[13px] font-mono"
                autoFocus
              />
              <div className="max-h-[400px] overflow-y-auto bg-[#252526]">
                {getFilteredFiles().length > 0 ? (
                  getFilteredFiles().map((file, index) => (
                    <div
                      key={file.path}
                      onClick={() => handleQuickOpenSelect(file)}
                      onMouseEnter={() => setSelectedQuickOpenIndex(index)}
                      className={`px-3 py-2 cursor-pointer flex items-center space-x-3 ${
                        index === selectedQuickOpenIndex
                          ? 'bg-[#094771]'
                          : 'hover:bg-[#2a2d2e]'
                      }`}
                    >
                      <FileText className="w-4 h-4 text-[#858585] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[#cccccc] text-[13px] font-mono truncate">{file.name}</div>
                        <div className="text-[#858585] text-[11px] font-mono truncate">{file.path}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-[#858585] text-[13px]">
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
            <div 
              className="fixed inset-0 z-50"
              onClick={() => setShowSearch(false)}
            />
            <div className="fixed top-[15%] left-1/2 -translate-x-1/2 z-[60] w-[700px] bg-[#252526] border border-[#454545] shadow-2xl">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  searchInFiles(e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowSearch(false)
                    setSearchQuery('')
                    setSearchResults([])
                  } else if (e.key === 'Enter' && searchResults.length > 0) {
                    handleSearchResultSelect(searchResults[selectedSearchIndex])
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedSearchIndex(prev => 
                      Math.min(prev + 1, searchResults.length - 1)
                    )
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedSearchIndex(prev => Math.max(prev - 1, 0))
                  }
                }}
                placeholder="Search in files..."
                className="w-full px-4 py-3 bg-[#3c3c3c] text-[#cccccc] placeholder-[#858585] focus:outline-none text-[13px] font-mono"
                autoFocus
              />
              <div className="max-h-[500px] overflow-y-auto bg-[#252526]">
                {isSearching ? (
                  <div className="px-4 py-8 text-center text-[#858585] text-[13px]">
                    Searching...
                  </div>
                ) : searchResults.length > 0 ? (
                  <>
                    <div className="px-4 py-2 bg-[#2d2d30] text-[#858585] text-[11px] border-b border-[#454545]">
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} in {new Set(searchResults.map(r => r.file.path)).size} file{new Set(searchResults.map(r => r.file.path)).size !== 1 ? 's' : ''}
                      {searchResults.length >= 1000 && <span className="ml-2 text-[#ffa500]">(showing first 1000)</span>}
                    </div>
                    {searchResults.map((result, index) => {
                      const highlightedText = (
                        <>
                          {result.lineText.substring(0, result.matchStart)}
                          <span className="bg-[#ffa500] text-black px-0.5">
                            {result.lineText.substring(result.matchStart, result.matchEnd)}
                          </span>
                          {result.lineText.substring(result.matchEnd)}
                        </>
                      )
                      
                      return (
                        <div
                          key={`${result.file.path}-${result.line}-${index}`}
                          onClick={() => handleSearchResultSelect(result)}
                          onMouseEnter={() => setSelectedSearchIndex(index)}
                          className={`px-3 py-2 cursor-pointer border-b border-[#1e1e1e] ${
                            index === selectedSearchIndex
                              ? 'bg-[#094771]'
                              : 'hover:bg-[#2a2d2e]'
                          }`}
                        >
                          <div className="flex items-center space-x-2 mb-1">
                            <FileText className="w-3 h-3 text-[#858585] flex-shrink-0" />
                            <span className="text-[#cccccc] text-[11px] font-mono">{result.file.path}</span>
                            <span className="text-[#858585] text-[11px]">:</span>
                            <span className="text-[#4ec9b0] text-[11px]">{result.line}</span>
                          </div>
                          <div className="text-[#cccccc] text-[12px] font-mono ml-5 truncate">
                            {highlightedText}
                          </div>
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <div className="px-4 py-8 text-center text-[#858585] text-[13px]">
                    {searchQuery ? 'No results found' : 'Type to search in all files'}
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