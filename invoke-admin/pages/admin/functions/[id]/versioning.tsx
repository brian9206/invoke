import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import { useProject } from '@/contexts/ProjectContext'
import { Upload, FileText, AlertCircle, CheckCircle, ArrowLeft, History, Play, Pause, Calendar, HardDrive, Hash, User, Trash2, Code2, GitBranch, Download, Loader } from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/cn'

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
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (id) { fetchFunctionData(); fetchVersions() } }, [id])

  useEffect(() => {
    if (functionData?.project_id && functionData?.project_name && !hasLockedProject.current) {
      hasLockedProject.current = true
      lockProject({ id: functionData.project_id, name: functionData.project_name, description: '', role: 'locked' })
    }
    return () => { if (hasLockedProject.current) { hasLockedProject.current = false; unlockProject() } }
  }, [functionData?.project_id, functionData?.project_name])

  const fetchFunctionData = async () => {
    try { const r = await authenticatedFetch(`/api/functions/${id}`); const d = await r.json(); if (d.success) setFunctionData(d.data) }
    catch { console.error('Error fetching function') }
    finally { setLoading(false) }
  }
  const fetchVersions = async () => {
    try { const r = await authenticatedFetch(`/api/functions/${id}/versions`); const d = await r.json(); if (d.success) setVersions(d.data) }
    catch { console.error('Error fetching versions') }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) { setFile(f); setUploadResult(null) } }

  const handleUploadNewVersion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { setUploadResult({ success: false, message: 'Please select a file to upload' }); return }
    setUploading(true); setUploadResult(null)
    const formData = new FormData(); formData.append('file', file)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/versions`, { method: 'POST', body: formData })
      const result = await r.json()
      if (result.success) { setUploadResult({ success: true, message: 'New version uploaded successfully!' }); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; fetchVersions() }
      else setUploadResult({ success: false, message: result.message || 'Upload failed' })
    } catch { setUploadResult({ success: false, message: 'Network error occurred' }) }
    finally { setUploading(false) }
  }

  const handleSwitchVersion = async (versionId: string, version: string) => {
    setDialogState({ type: 'confirm', title: 'Switch Version', message: `Are you sure you want to switch to version ${version}?`,
      onConfirm: async () => {
        setSwitchingVersion(versionId)
        try {
          const r = await authenticatedFetch(`/api/functions/${id}/switch-version`, { method: 'POST', body: JSON.stringify({ versionId }) })
          const result = await r.json()
          if (result.success) { setUploadResult({ success: true, message: `Switched to version ${version}` }); fetchVersions(); fetchFunctionData(); setDialogState({ type: null, title: '', message: '' }) }
          else setUploadResult({ success: false, message: result.message || 'Version switch failed' })
        } catch { setUploadResult({ success: false, message: 'Network error occurred' }) }
        finally { setSwitchingVersion(null) }
      }
    })
  }

  const handleDeleteVersion = async (versionId: string, versionNumber: number) => {
    setDialogState({ type: 'confirm', title: 'Delete Version', message: `Are you sure you want to delete version ${versionNumber}? This action cannot be undone.`,
      onConfirm: async () => {
        setDeletingVersion(versionId)
        try {
          const r = await authenticatedFetch(`/api/functions/${id}/versions?version=${versionNumber}`, { method: 'DELETE' })
          const result = await r.json()
          if (result.success) { setUploadResult({ success: true, message: `Version ${versionNumber} deleted successfully` }); fetchVersions(); setDialogState({ type: null, title: '', message: '' }) }
          else setUploadResult({ success: false, message: result.message || 'Failed to delete version' })
        } catch { setUploadResult({ success: false, message: 'Network error occurred' }) }
        finally { setDeletingVersion(null) }
      }
    })
  }

  const handleDownloadVersion = async (versionId: string, version: string) => {
    setDownloadingVersion(versionId)
    try {
      const r = await authenticatedFetch(`/api/functions/${id}/versions/${versionId}/download`)
      if (r.ok) {
        const blob = await r.blob(); const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `${functionData?.name || 'function'}-v${version}.zip`
        document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url)
      }
    } catch { console.error('Error downloading version') }
    finally { setDownloadingVersion(null) }
  }

  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith('.zip') || f.name.endsWith('.tar.gz') || f.name.endsWith('.tgz'))) { setFile(f); setUploadResult(null) }
  }

  const formatDate = (ds: string) => new Date(ds).toLocaleString()
  const formatBytes = (bytes: number) => {
    if (bytes == null || isNaN(bytes)) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  if (loading) return (
    <ProtectedRoute><Layout><div className="flex items-center justify-center h-64"><Loader className="w-8 h-8 text-primary animate-spin" /></div></Layout></ProtectedRoute>
  )
  if (!functionData) return (
    <ProtectedRoute><Layout><div className="flex items-center justify-center h-64 text-destructive">Function not found</div></Layout></ProtectedRoute>
  )

  const activeVersion = versions.find(v => v.is_active)

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
          <Modal
            isOpen={dialogState.type !== null}
            title={dialogState.title}
            description={dialogState.message}
            onCancel={() => setDialogState({ type: null, title: '', message: '' })}
            onConfirm={async () => { if (dialogState.onConfirm) await dialogState.onConfirm(); else setDialogState({ type: null, title: '', message: '' }) }}
            cancelText={dialogState.type === 'alert' ? 'OK' : 'Cancel'}
            confirmText={dialogState.type === 'alert' ? undefined : 'Continue'}
            confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
          />

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/functions/${id}`)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <PageHeader
                title="Function Versioning"
                subtitle={`Manage versions for ${functionData.name}${activeVersion ? ` — Active: v${activeVersion.version}` : ''}`}
                icon={<GitBranch className="w-8 h-8 text-primary" />}
              />
            </div>
          </div>

          {/* Upload New Version */}
          <Card className="max-w-2xl">
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-base font-semibold flex items-center gap-2 text-foreground"><Upload className="w-5 h-5" />Upload New Version</h2>
              <div
                className={cn('border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer', file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => !file && fileInputRef.current?.click()}
              >
                {file ? (
                  <div className="space-y-3">
                    <FileText className="w-12 h-12 mx-auto text-primary" />
                    <div><p className="font-medium text-foreground">{file.name}</p><p className="text-muted-foreground text-sm">{formatBytes(file.size)}</p></div>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setFile(null) }} className="text-muted-foreground">Remove file</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                    <div><p className="text-foreground">Drag and drop your function package here</p><p className="text-muted-foreground text-sm">or click to browse (.zip, .tar.gz, .tgz)</p></div>
                    <input ref={fileInputRef} type="file" accept=".zip,.tar.gz,.tgz" onChange={handleFileSelect} className="hidden" />
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>Choose File</Button>
                  </div>
                )}
              </div>
              <form onSubmit={handleUploadNewVersion} className="space-y-3">
                <Button type="submit" disabled={!file || uploading}>
                  {uploading ? <><Loader className="w-4 h-4 mr-2 animate-spin" />Uploading…</> : <><Upload className="w-4 h-4 mr-2" />Upload New Version</>}
                </Button>
                <p className="text-sm text-muted-foreground">New version will be uploaded but not activated automatically</p>
              </form>
            </CardContent>
          </Card>

          {/* Upload Result */}
          {uploadResult && (
            <Card className={cn('max-w-2xl', uploadResult.success ? 'border-green-700' : 'border-red-700')}>
              <CardContent className="pt-4 pb-4 flex items-center gap-2">
                {uploadResult.success ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
                <span className={uploadResult.success ? 'text-green-300' : 'text-red-300'}>{uploadResult.message}</span>
              </CardContent>
            </Card>
          )}

          {/* Versions Table */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-base font-semibold flex items-center gap-2 text-foreground">
                <History className="w-5 h-5" />Versions
                <Badge variant="secondary">{versions.length} versions</Badge>
              </h2>
              {versions.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No versions found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Hash</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...versions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((version) => (
                        <TableRow key={version.id}>
                          <TableCell className="font-medium text-foreground">v{version.version}</TableCell>
                          <TableCell>
                            {version.is_active
                              ? <Badge variant="success" className="flex items-center gap-1 w-fit"><Play className="w-3 h-3" />Active</Badge>
                              : <Badge variant="secondary" className="flex items-center gap-1 w-fit"><Pause className="w-3 h-3" />Inactive</Badge>
                            }
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground"><span className="flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" />{formatBytes(version.file_size)}</span></TableCell>
                          <TableCell className="text-sm text-muted-foreground font-mono"><span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{version.package_hash.substring(0, 8)}…</span></TableCell>
                          <TableCell className="text-sm text-muted-foreground"><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(version.created_at)}</span></TableCell>
                          <TableCell className="text-sm text-muted-foreground"><span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{version.created_by_name || 'Unknown'}</span></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/functions/${id}/versions/${version.id}/edit`)} className="text-blue-400 hover:text-blue-300 h-8 w-8" title="View/Edit code"><Code2 className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDownloadVersion(version.id, version.version)} disabled={downloadingVersion === version.id} className="text-primary hover:text-primary/80 h-8 w-8" title="Download">
                                {downloadingVersion === version.id ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                              </Button>
                              {!version.is_active && (
                                <>
                                  <Button variant="ghost" size="icon" onClick={() => handleSwitchVersion(version.id, version.version)} disabled={switchingVersion === version.id} className="text-green-400 hover:text-green-300 h-8 w-8" title="Activate">
                                    {switchingVersion === version.id ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteVersion(version.id, parseInt(version.version))} disabled={deletingVersion === version.id} className="text-destructive hover:text-destructive/80 h-8 w-8" title="Delete">
                                    {deletingVersion === version.id ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
