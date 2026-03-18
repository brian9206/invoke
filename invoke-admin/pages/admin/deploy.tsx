import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { toast } from 'sonner'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { Upload, FileText, AlertCircle, CheckCircle, Key, RefreshCw, Copy, Loader } from 'lucide-react'
import { getFunctionBaseUrl, authenticatedFetch } from '@/lib/frontend-utils'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'

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

  useEffect(() => {
    if (requiresApiKey && !apiKey) {
      setApiKey(generateApiKey())
    }
  }, [requiresApiKey])

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
      apiKey,
    }

    if (activeProject) {
      requestBody.projectId = activeProject.id
    }

    try {
      const response = await authenticatedFetch('/api/functions/create-from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const result = await response.json()

      if (result.success) {
        toast.success('Function deployed successfully')
        router.push(`/admin/functions/${result.data.id}`)
      } else {
        setUploadResult(result)
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
        setFile(null)
        setName('')
        setDescription('')
        setRequiresApiKey(false)
        setApiKey('')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        toast.success('Function deployed successfully')
        const functionId = result.data?.id
        if (functionId) {
          router.push(`/admin/functions/${functionId}`)
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
          {!activeProject || activeProject.id === 'system' ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <Upload className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">Please Select a Project</h2>
                <p className="text-muted-foreground">
                  Deploy is not available for the system project. Please select a regular project to deploy functions.
                </p>
              </div>
            </div>
          ) : (
            <>
              {activeProject && !user?.isAdmin && activeProject.role === 'developer' && (
                <Card>
                  <CardContent className="py-8 text-center">
                    <AlertCircle className="w-12 h-12 mx-auto text-yellow-400 mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">Insufficient Permissions</h3>
                    <p className="text-muted-foreground">
                      Your current project role does not allow deploying functions. Contact a project owner to deploy functions.
                    </p>
                  </CardContent>
                </Card>
              )}

              <PageHeader
                title="Deploy New Function"
                subtitle="Upload a function package or create a Hello World function to get started"
                icon={<Upload className="w-8 h-8 text-primary" />}
              />

              {activeProject && (
                <Card className="max-w-2xl">
                  <CardContent className="pt-6 space-y-6">
                    {/* Mode Tabs */}
                    <Tabs value={creationMode} onValueChange={(v) => setCreationMode(v as 'upload' | 'helloworld')}>
                      <TabsList>
                        <TabsTrigger value="upload">Upload Package</TabsTrigger>
                        <TabsTrigger value="helloworld">Create From Template</TabsTrigger>
                      </TabsList>

                      {/* Upload Tab */}
                      <TabsContent value="upload" className="space-y-4 mt-4">
                        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                          <Upload className="w-5 h-5" />
                          Function Package
                        </h2>

                        <div
                          className={cn(
                            'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
                            file
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-muted-foreground'
                          )}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onClick={() => !file && fileInputRef.current?.click()}
                        >
                          {file ? (
                            <div className="space-y-3">
                              <FileText className="w-12 h-12 mx-auto text-primary" />
                              <div>
                                <p className="text-foreground font-medium">{file.name}</p>
                                <p className="text-muted-foreground text-sm">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); setFile(null) }}
                              >
                                Remove file
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                              <div>
                                <p className="text-foreground">Drag and drop your function package here</p>
                                <p className="text-muted-foreground text-sm">or click to browse files</p>
                              </div>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept=".zip,.tar.gz"
                                onChange={handleFileSelect}
                                className="hidden"
                              />
                              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
                                Choose File
                              </Button>
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      {/* Hello World Tab */}
                      <TabsContent value="helloworld" className="mt-4">
                        <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg">
                          <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold text-foreground">Hello World Function</h3>
                            <p className="text-muted-foreground text-sm">
                              Create a basic function template with example code
                            </p>
                            <p className="text-muted-foreground text-sm mt-1">
                              This will create a simple function that returns a &quot;Hello World&quot; message. You can edit the code directly in the admin panel after creation.
                            </p>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>

                    {/* Form Fields */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="functionName">
                          Function Name {creationMode === 'helloworld' ? '' : '(optional)'}
                        </Label>
                        <Input
                          id="functionName"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder={creationMode === 'helloworld' ? 'Enter function name' : 'Leave empty to use filename'}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="description">Description (optional)</Label>
                        <Textarea
                          id="description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Describe what this function does..."
                          rows={3}
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="requiresApiKey"
                          checked={requiresApiKey}
                          onCheckedChange={(checked) => setRequiresApiKey(checked === true)}
                        />
                        <Label htmlFor="requiresApiKey" className="cursor-pointer">
                          Require API key for execution
                        </Label>
                      </div>

                      {requiresApiKey && (
                        <div className="p-4 bg-card border border-border rounded-lg space-y-3">
                          <div className="flex items-center gap-2">
                            <Key className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-foreground">API Key</span>
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              className="font-mono text-sm"
                              placeholder="API key will be auto-generated..."
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setApiKey(generateApiKey())}
                              title="Generate new API key"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => navigator.clipboard.writeText(apiKey)}
                              title="Copy to clipboard"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            This key will be required to execute your function. Include it as:{' '}
                            <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;key&gt;</code> or{' '}
                            <code className="bg-muted px-1 rounded">?api_key=&lt;key&gt;</code>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="flex justify-end">
                      {creationMode === 'upload' ? (
                        <Button onClick={handleUpload} disabled={!file || uploading}>
                          {uploading ? (
                            <>
                              <Loader className="w-4 h-4 animate-spin mr-2" />
                              Uploading...
                            </>
                          ) : (
                            'Upload Function'
                          )}
                        </Button>
                      ) : (
                        <Button onClick={handleCreateHelloWorld} disabled={!name.trim() || uploading}>
                          {uploading ? (
                            <>
                              <Loader className="w-4 h-4 animate-spin mr-2" />
                              Creating...
                            </>
                          ) : (
                            'Create Function'
                          )}
                        </Button>
                      )}
                    </div>

                    {/* Result Message */}
                    {uploadResult && (
                      <div
                        className={cn(
                          'p-4 rounded-lg border flex items-start gap-3',
                          uploadResult.success
                            ? 'bg-green-900/30 border-green-800 text-green-400'
                            : 'bg-red-900/30 border-red-800 text-red-400'
                        )}
                      >
                        {uploadResult.success ? (
                          <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{uploadResult.message}</p>
                          {uploadResult.success && uploadResult.data && (
                            <div className="mt-2 text-sm space-y-1">
                              <p><strong>Function ID:</strong> {uploadResult.data.id}</p>
                              <p>
                                <strong>Execution URL:</strong>{' '}
                                <code className="bg-muted px-2 py-0.5 rounded">
                                  {functionBaseUrl}/{uploadResult.data.id}
                                </code>
                              </p>
                              <p className="text-green-300">Your function is now ready to execute!</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Instructions */}
                    <div className="p-4 bg-muted/40 border border-border rounded-lg">
                      <h3 className="text-sm font-medium text-foreground mb-2">Package Requirements:</h3>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Package must be a .zip or .tar.gz file</li>
                        <li>• Must contain an <code className="bg-muted px-1 rounded">index.js</code> file as entry point</li>
                        <li>• Function should export a single function compatible with Express: <code className="bg-muted px-1 rounded">{`(req, res) => {}`}</code></li>
                        <li>• Maximum file size: 50MB</li>
                        <li>• Access your function via <code className="bg-muted px-1 rounded">{functionBaseUrl}/&lt;function-id&gt;</code></li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
