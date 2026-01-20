import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Package, Play, Pause, Trash2, Edit, ExternalLink, Eye } from 'lucide-react'
import { getFunctionUrl, authenticatedFetch } from '@/lib/frontend-utils'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'

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
  project_name: string
  user_role?: string
}

export default function Functions() {
  const { user } = useAuth()
  const { activeProject } = useProject()
  const [functions, setFunctions] = useState<Function[]>([])
  const [loading, setLoading] = useState(true)
  const [functionUrls, setFunctionUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    // Always fetch functions when user changes or active project changes
    if (user && activeProject) {
      fetchFunctions()
    } else {
      setFunctions([])
      setLoading(false)
    }
  }, [activeProject, user])

  const fetchFunctions = async () => {
    try {
      let url = '/api/functions'
      // Always add project filter since we always have a project selected
      if (activeProject) {
        url += `?projectId=${activeProject.id}`
      }
      
      const response = await authenticatedFetch(url)
      const result = await response.json()
      
      if (result.success) {
        setFunctions(result.data)
        
        // Generate URLs for all functions
        const urls: Record<string, string> = {}
        for (const func of result.data) {
          urls[func.id] = await getFunctionUrl(func.id)
        }
        setFunctionUrls(urls)
      }
    } catch (error) {
      console.error('Error fetching functions:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleFunction = async (id: string, isActive: boolean) => {
    try {
      const response = await authenticatedFetch(`/api/functions/${id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: !isActive }),
      })

      if (response.ok) {
        fetchFunctions()
      }
    } catch (error) {
      console.error('Error toggling function:', error)
    }
  }

  const deleteFunction = async (id: string) => {
    if (!confirm('Are you sure you want to delete this function?')) return

    try {
      const response = await authenticatedFetch(`/api/functions/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchFunctions()
      }
    } catch (error) {
      console.error('Error deleting function:', error)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Functions">
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-400">Loading functions...</div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Layout title="Functions">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-100">Functions</h1>
              <p className="text-gray-400 mt-2">
                Manage your deployed serverless functions
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {(!activeProject || user?.isAdmin || activeProject.role !== 'viewer') ? (
                <Link href="/admin/deploy" className="btn-primary">
                  Deploy Function
                </Link>
              ) : (
                <button className="px-4 py-2 rounded-lg bg-gray-700 text-gray-400 cursor-not-allowed" title="Insufficient permissions to deploy">
                  Deploy Function
                </button>
              )}
            </div>
          </div>

          {!activeProject ? (
            <div className="card text-center py-12">
              <Package className="w-16 h-16 mx-auto text-gray-500 mb-4" />
              <h2 className="text-xl font-semibold text-gray-300 mb-2">
                Loading Project
              </h2>
              <p className="text-gray-400 mb-6">
                Please wait while we load your project
              </p>
            </div>
          ) : functions.length === 0 ? (
            <div className="card text-center py-12">
              <Package className="w-16 h-16 mx-auto text-gray-500 mb-4" />
              <h2 className="text-xl font-semibold text-gray-300 mb-2">
                No Functions Deployed
              </h2>
              <p className="text-gray-400 mb-6">
                Deploy your first serverless function to get started
              </p>
              {(!activeProject || user?.isAdmin || activeProject.role !== 'viewer') ? (
                <Link href="/admin/deploy" className="btn-primary">
                  Deploy Function
                </Link>
              ) : (
                <button className="px-4 py-2 rounded-lg bg-gray-700 text-gray-400 cursor-not-allowed" title="Insufficient permissions to deploy">
                  Deploy Function
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-6">
              {functions.map((func) => (
                <div key={func.id} className="card hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <Link 
                      href={`/admin/functions/${func.id}`}
                      className="flex items-start space-x-4 flex-1 hover:cursor-pointer"
                    >
                      <div className={`p-3 rounded-lg ${
                        func.is_active ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'
                      }`}>
                        <Package className="w-6 h-6" />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-lg font-semibold text-gray-100">
                            {func.name}
                          </h3>
                          <span className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300">
                            v{func.version || '1'}
                          </span>
                          {func.requires_api_key && (
                            <span className="px-2 py-1 text-xs rounded bg-yellow-900/30 text-yellow-400 border border-yellow-800">
                              API Key Required
                            </span>
                          )}
                          <span className={`px-2 py-1 text-xs rounded ${
                            func.is_active 
                              ? 'bg-green-900/30 text-green-400 border border-green-800'
                              : 'bg-gray-700 text-gray-400'
                          }`}>
                            {func.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        
                        <p className="text-gray-400 mt-1">
                          {func.description || 'No description provided'}
                        </p>
                        
                        <div className="flex items-center space-x-6 mt-3 text-sm text-gray-400">
                          <span>Executions: {func.execution_count}</span>
                          <span>Created: {formatDate(func.created_at)}</span>
                          {func.last_executed && (
                            <span>Last executed: {formatDate(func.last_executed)}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                    
                    <div className="flex items-center space-x-2 ml-4" onClick={(e) => e.stopPropagation()}>
                      
                      <button
                        onClick={() => toggleFunction(func.id, func.is_active)}
                        className={`p-2 rounded-lg transition-colors ${
                          func.is_active
                            ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50'
                            : 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
                        }`}
                        title={func.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {func.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      
                      <a
                        href={functionUrls[func.id] || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 transition-colors"
                        title="Execute Function"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      
                      <button
                        onClick={() => deleteFunction(func.id)}
                        className="p-2 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors"
                        title="Delete Function"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  )
}