import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Upload, FileText, AlertCircle, CheckCircle, Key, RefreshCw, Copy } from 'lucide-react'
import { getFunctionBaseUrl, getFunctionUrl, authenticatedFetch } from '@/lib/frontend-utils'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'

// Generate a random API key
const generateApiKey = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export default function DeployFunction() {
  const router = useRouter()
  const { user } = useAuth()
  const { activeProject } = useProject()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [requiresApiKey, setRequiresApiKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [uploading, setUploading] = useState(false)
  const [creationMode, setCreationMode] = useState<'upload' | 'helloworld'>('upload')
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; data?: any } | null>(null)
  const [functionBaseUrl, setFunctionBaseUrl] = useState('https://localhost:3001/invoke')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Generate API key when API key requirement is enabled
  useEffect(() => {
    if (requiresApiKey && !apiKey) {
      setApiKey(generateApiKey())
    }
  }, [requiresApiKey])
  
  // Fetch function base URL on component mount
  useEffect(() => {
    getFunctionBaseUrl().then(setFunctionBaseUrl)
  }, [])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setUploadResult(null)
    }
  }

  const handleCreateHelloWorld = async () => {
    if (!name.trim()) {
      setUploadResult({ success: false, message: 'Function name is required for Hello World creation' })
      return
    }

    setUploading(true)
    setUploadResult(null)

    const requestBody: any = {
      name: name.trim(),
      description: description.trim() || 'Hello World function',
      requiresApiKey,
      apiKey
    }

    // Add project assignment if a project is selected (for both admin and regular users)
    if (activeProject) {
      requestBody.projectId = activeProject.id
    }

    try {
      const response = await authenticatedFetch('/api/functions/create-from-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const result = await response.json()
      setUploadResult(result)

      if (result.success) {
        setTimeout(() => {
          router.push(`/admin/functions/${result.data.id}`)
        }, 2000)
      }
    } catch (error) {
      setUploadResult({ success: false, message: 'Network error occurred' })
    } finally {
      setUploading(false)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setUploadResult(null)

    const formData = new FormData()
    formData.append('function', file)
    formData.append('name', name.trim() || file.name.replace(/\.(zip|tar\.gz|tgz)$/i, ''))
    formData.append('description', description.trim())
    formData.append('requiresApiKey', requiresApiKey.toString())
    if (requiresApiKey && apiKey) {
      formData.append('apiKey', apiKey)
    }
    // Add project assignment if a project is selected (for both admin and regular users)
    if (activeProject) {
      formData.append('projectId', activeProject.id)
    }

    try {
      const response = await authenticatedFetch('/api/functions/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        // Reset form
        setFile(null)
        setName('')
        setDescription('')
        setRequiresApiKey(false)
        setApiKey('')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        
        // Navigate to function details page
        const functionId = result.data?.id
        if (functionId) {
          router.push(`/admin/functions/${functionId}`)
        } else {
          setUploadResult({ 
            success: true, 
            message: 'Function uploaded successfully!',
            data: result.data
          })
        }
      } else {
        setUploadResult({ success: false, message: result.message || 'Upload failed' })
      }
    } catch (error) {
      setUploadResult({ success: false, message: 'Network error occurred' })
    } finally {
      setUploading(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.zip') || droppedFile.name.endsWith('.tar.gz'))) {
      setFile(droppedFile)
      setUploadResult(null)
    }
  }

  return (
    <ProtectedRoute>
      <Layout title="Deploy Function">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-100">Deploy New Function</h1>
            <p className="text-gray-400 mt-2">
              Upload a function package or create a Hello World function to get started
            </p>
          </div>

          {/* Project Selection Check - for all users */}
          {!activeProject && (
            <div className="card">
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 mx-auto text-yellow-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-100 mb-2">
                  Loading Project
                </h3>
                <p className="text-gray-400">
                  Please wait while we load your project data.
                </p>
              </div>
            </div>
          )}

          {/* Show deployment form when project is loaded */}
          {activeProject && (
            <div className="card max-w-2xl">
            {/* Creation Mode Selector */}
            <div className="mb-6">
              <div className="flex space-x-1 p-1 bg-gray-800 rounded-lg w-fit">
                <button
                  onClick={() => setCreationMode('upload')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    creationMode === 'upload'
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  Upload Package
                </button>
                <button
                  onClick={() => setCreationMode('helloworld')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    creationMode === 'helloworld'
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  Create From Template
                </button>
              </div>
            </div>

            {/* Upload Mode */}
            {creationMode === 'upload' && (
              <>
                <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center">
                  <Upload className="w-5 h-5 mr-2" />
                  Function Package
                </h2>
                
                {/* Upload Area */}
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
                          {(file.size / 1024 / 1024).toFixed(2)} MB
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
                          or click to browse files
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".zip,.tar.gz"
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
              </>
            )}

            {/* Hello World Mode */}
            {creationMode === 'helloworld' && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-primary-600 rounded-lg flex items-center justify-center mr-4">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-100">Hello World Function</h3>
                    <p className="text-gray-400 text-sm">
                      Create a basic function template with example code
                    </p>
                  </div>
                </div>
                <p className="text-gray-300 text-sm">
                  This will create a simple function that returns a "Hello World" message. 
                  You can edit the code directly in the admin panel after creation.
                </p>
              </div>
            )}

            {/* Function Details Form */}
            <div className="space-y-4 mt-6">
              <div>
                <label htmlFor="functionName" className="block text-sm font-medium text-gray-300 mb-2">
                  Function Name {creationMode === 'helloworld' ? '' : '(optional)'}
                </label>
                <input
                  id="functionName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={creationMode === 'helloworld' ? 'Enter function name' : 'Leave empty to use filename'}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this function does..."
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center space-x-3">
                <input
                  id="requiresApiKey"
                  type="checkbox"
                  checked={requiresApiKey}
                  onChange={(e) => setRequiresApiKey(e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500 focus:ring-2"
                />
                <label htmlFor="requiresApiKey" className="text-sm text-gray-300">
                  Require API key for execution
                </label>
              </div>

              {/* API Key field - shows when API key is required */}
              {requiresApiKey && (
                <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                  <div className="flex items-center mb-3">
                    <Key className="w-4 h-4 text-primary-500 mr-2" />
                    <span className="text-sm font-medium text-gray-300">API Key</span>
                  </div>
                  
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 font-mono text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
                      placeholder="API key will be auto-generated..."
                    />
                    <button
                      type="button"
                      onClick={() => setApiKey(generateApiKey())}
                      className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors flex items-center"
                      title="Generate new API key"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(apiKey)}
                      className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors flex items-center"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <p className="text-xs text-gray-500 mt-2">
                    This key will be required to execute your function. Include it as: Authorization: Bearer &lt;key&gt; or ?api_key=&lt;key&gt;
                  </p>
                </div>
              )}
            </div>

            {/* Action Button */}
            <div className="flex justify-end mt-6">
              {creationMode === 'upload' ? (
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    !file || uploading
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'btn-primary'
                  }`}
                >
                  {uploading ? 'Uploading...' : 'Upload Function'}
                </button>
              ) : (
                <button
                  onClick={handleCreateHelloWorld}
                  disabled={!name.trim() || uploading}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    !name.trim() || uploading
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'btn-primary'
                  }`}
                >
                  {uploading ? 'Creating...' : 'Create Function'}
                </button>
              )}
            </div>

            {/* Result Message */}
            {uploadResult && (
              <div className={`mt-4 p-4 rounded-lg ${uploadResult.success 
                  ? 'bg-green-900/50 text-green-400 border border-green-800'
                  : 'bg-red-900/50 text-red-400 border border-red-800'
              }`}>
                <div className="flex items-start">
                  {uploadResult.success ? (
                    <CheckCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{uploadResult.message}</p>
                    {uploadResult.success && uploadResult.data && (
                      <div className="mt-2 text-sm space-y-1">
                        <p><strong>Function ID:</strong> {uploadResult.data.id}</p>
                        <p><strong>Execution URL:</strong> <code className="bg-gray-800 px-2 py-1 rounded">{functionBaseUrl}/{uploadResult.data.id}</code></p>
                        <p className="text-green-300">Your function is now ready to execute!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="mt-6 p-4 bg-gray-800 rounded-lg">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Package Requirements:</h3>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• Package must be a .zip or .tar.gz file</li>
                <li>• Must contain an <code className="bg-gray-700 px-1 rounded">index.js</code> file as entry point</li>
                <li>• Function should export a single function compatible with Express: <code className="bg-gray-700 px-1 rounded">{`(req, res) => {}`}</code></li>
                <li>• Maximum file size: 50MB</li>
                <li>• Access your function via <code className="bg-gray-700 px-1 rounded">{functionBaseUrl}/&lt;function-id&gt;</code></li>
              </ul>
            </div>
            </div>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  )
}