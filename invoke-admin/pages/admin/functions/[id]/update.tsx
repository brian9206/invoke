import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { Upload, FileText, AlertCircle, CheckCircle, ArrowLeft, Loader } from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/cn'

export default function UpdateFunction() {
  const router = useRouter()
  const { id } = router.query
  const { lockProject, unlockProject } = useProject()
  const hasLockedProject = useRef(false)

  const [functionData, setFunctionData] = useState<any>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (id) fetchFunctionData() }, [id])

  useEffect(() => {
    if (functionData?.project_id && functionData?.project_name && !hasLockedProject.current) {
      hasLockedProject.current = true
      lockProject({ id: functionData.project_id, name: functionData.project_name, description: '', role: 'locked' })
    }
    return () => { if (hasLockedProject.current) { hasLockedProject.current = false; unlockProject() } }
  }, [functionData?.project_id, functionData?.project_name])

  const fetchFunctionData = async () => {
    try {
      const response = await authenticatedFetch(`/api/functions/${id}`)
      const result = await response.json()
      if (result.success) setFunctionData(result.data)
    } catch { console.error('Error fetching function') }
    finally { setLoading(false) }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setUploadResult(null) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { setUploadResult({ success: false, message: 'Please select a file to upload' }); return }
    setUploading(true)
    setUploadResult(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const response = await authenticatedFetch(`/api/functions/${id}/update`, { method: 'POST', body: formData })
      const result = await response.json()
      if (result.success) router.push(`/admin/functions/${id}`)
      else setUploadResult({ success: false, message: result.message || 'Update failed' })
    } catch { setUploadResult({ success: false, message: 'Network error occurred' }) }
    finally { setUploading(false) }
  }

  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.zip') || droppedFile.name.endsWith('.tar.gz') || droppedFile.name.endsWith('.tgz'))) {
      setFile(droppedFile)
      setUploadResult(null)
    }
  }

  if (loading) return (
    <ProtectedRoute><Layout><div className="flex items-center justify-center h-64"><Loader className="w-8 h-8 text-primary animate-spin" /></div></Layout></ProtectedRoute>
  )
  if (!functionData) return (
    <ProtectedRoute><Layout><div className="flex items-center justify-center h-64 text-destructive">Function not found</div></Layout></ProtectedRoute>
  )

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/functions/${id}`)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <PageHeader
              title="Update Function Package"
              subtitle={`Update the package for ${functionData.name} — Current version: ${functionData.version}`}
              icon={<Upload className="w-8 h-8 text-primary" />}
            />
          </div>

          <Card className="max-w-2xl">
            <CardContent className="pt-6 space-y-6">
              <h2 className="text-base font-semibold flex items-center gap-2 text-foreground"><Upload className="w-5 h-5" />New Package File</h2>

              <div
                className={cn('border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer', file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => !file && fileInputRef.current?.click()}
              >
                {file ? (
                  <div className="space-y-3">
                    <FileText className="w-12 h-12 mx-auto text-primary" />
                    <div>
                      <p className="font-medium text-foreground">{file.name}</p>
                      <p className="text-muted-foreground text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setFile(null) }} className="text-muted-foreground">Remove file</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                    <div>
                      <p className="text-foreground">Drag and drop your new function package here</p>
                      <p className="text-muted-foreground text-sm">or click to browse files (.zip, .tar.gz, .tgz)</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".zip,.tar.gz,.tgz" onChange={handleFileSelect} className="hidden" />
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>Choose File</Button>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {uploadResult && (
                  <div className={cn('p-4 rounded-lg flex items-center gap-2', uploadResult.success ? 'bg-green-900/20 border border-green-700' : 'bg-red-900/20 border border-red-700')}>
                    {uploadResult.success ? <CheckCircle className="w-5 h-5 text-green-400 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
                    <span className={uploadResult.success ? 'text-green-300' : 'text-red-300'}>{uploadResult.message}</span>
                  </div>
                )}
                <div className="flex gap-3">
                  <Button type="submit" disabled={!file || uploading}>
                    {uploading ? <><Loader className="w-4 h-4 mr-2 animate-spin" />Updating…</> : <><Upload className="w-4 h-4 mr-2" />Update Package</>}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.push(`/admin/functions/${id}`)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
