import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useProject } from '@/contexts/ProjectContext'
import { Upload, FileText, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'

export default function UpdateFunction() {
  const router = useRouter()
  const { id } = router.query
  const { lockProject, unlockProject } = useProject()
  const hasLockedProject = useRef(false)
  
  const [functionData, setFunctionData] = useState<any>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; data?: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (id) {
      fetchFunctionData()
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setUploadResult(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
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
      const response = await authenticatedFetch(`/api/functions/${id}/update`, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        // Navigate back to function details page
        router.push(`/admin/functions/${id}`)
      } else {
        setUploadResult({ success: false, message: result.message || 'Update failed' })
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
    if (droppedFile && (droppedFile.name.endsWith('.zip') || droppedFile.name.endsWith('.tar.gz') || droppedFile.name.endsWith('.tgz'))) {
      setFile(droppedFile)
      setUploadResult(null)
    }
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
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push(`/admin/functions/${id}`)}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-100">Update Function Package</h1>
              <p className="text-gray-400 mt-2">
                Update the package for <span className="text-gray-200 font-medium">{functionData.name}</span> - Current version: {functionData.version}
              </p>
            </div>
          </div>

          <div className="card max-w-2xl">
            <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center">
              <Upload className="w-5 h-5 mr-2" />
              New Package File
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
                      Drag and drop your new function package here
                    </p>
                    <p className="text-gray-400 text-sm">
                      or click to browse files
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

            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              {/* Upload Result */}
              {uploadResult && (
                <div className={`p-4 rounded-md ${
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

              {/* Submit Button */}
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={!file || uploading}
                  className="btn-primary flex items-center disabled:opacity-50"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? 'Updating...' : 'Update Package'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/admin/functions/${id}`)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}