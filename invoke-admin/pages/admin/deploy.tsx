import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/router'
import { toast } from 'sonner'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { Upload, FileText, AlertCircle, Loader, ChevronDown, Code } from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/cn'
import runtimeMap from '@/config/function-runtime-map.json'
import displayNames from '@/config/function-display-names.json'

const languages = Object.keys(runtimeMap) as Array<keyof typeof runtimeMap>

function Section({
  title,
  open,
  onToggle,
  children
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle} className='rounded-lg border border-border bg-muted/30'>
      <CollapsibleTrigger asChild>
        <button
          type='button'
          className='flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:text-primary transition-colors'
        >
          {title}
          <ChevronDown
            className={cn('w-4 h-4 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Separator />
        <div className='p-4 space-y-4'>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function DeployFunction() {
  const router = useRouter()
  const { activeProject, setActiveProject, userProjects } = useProject()

  // Section open state — both open by default
  const [basicOpen, setBasicOpen] = useState(true)
  const [codeOpen, setCodeOpen] = useState(true)

  // Basic info fields
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    activeProject && activeProject.id !== 'system' ? activeProject.id : ''
  )
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Code fields
  const [language, setLanguage] = useState<string>(languages[0])
  const [selectedRuntime, setSelectedRuntime] = useState<string>(
    (runtimeMap as Record<string, string[]>)[languages[0]][0]
  )
  const [manualUpload, setManualUpload] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectableProjects = useMemo(() => userProjects.filter(p => p.id !== 'system'), [userProjects])

  const availableRuntimes = useMemo(() => (runtimeMap as Record<string, string[]>)[language] ?? [], [language])

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    const rts = (runtimeMap as Record<string, string[]>)[lang] ?? []
    setSelectedRuntime(rts[0] ?? '')
  }

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId)
    const project = selectableProjects.find(p => p.id === projectId)
    if (project) setActiveProject(project)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setError(null)
    }
  }
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith('.zip') || f.name.endsWith('.tar.gz') || f.name.endsWith('.tgz'))) {
      setFile(f)
      setError(null)
    }
  }

  const canSubmit = !!name.trim() && !!selectedProjectId && !!selectedRuntime && (!manualUpload || !!file)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    const formData = new FormData()
    formData.append('name', name.trim())
    formData.append('description', description.trim())
    formData.append('projectId', selectedProjectId)
    formData.append('language', language)
    formData.append('runtime', selectedRuntime)
    formData.append('mode', manualUpload && file ? 'upload' : 'template')
    if (manualUpload && file) formData.append('file', file)

    try {
      const response = await authenticatedFetch('/api/functions/deploy', { method: 'POST', body: formData })
      const result = await response.json()
      if (result.success) {
        toast.success('Function deployed successfully')
        router.push(`/admin/functions/${result.data.id}`)
      } else {
        setError(result.message || 'Deployment failed')
      }
    } catch {
      setError('Network error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  const selectClass =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

  return (
    <ProtectedRoute>
      <Layout title='Deploy Function'>
        <div className='space-y-6'>
          <PageHeader
            title='Deploy New Function'
            subtitle='Set up a new serverless function for your project'
            icon={<Upload className='w-8 h-8 text-primary' />}
          />

          <div className='max-w-2xl space-y-3'>
            {/* ── Section 1: Basic Information ───────────────────── */}
            <Section title='Basic Information' open={basicOpen} onToggle={() => setBasicOpen(v => !v)}>
              <div className='space-y-1.5'>
                <Label htmlFor='project'>Project</Label>
                <select
                  id='project'
                  value={selectedProjectId}
                  onChange={e => handleProjectChange(e.target.value)}
                  className={selectClass}
                >
                  <option value=''>Select a project...</option>
                  {selectableProjects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {!selectedProjectId && (
                  <p className='text-xs text-yellow-500 flex items-center gap-1'>
                    <AlertCircle className='w-3 h-3' />
                    Please select a project
                  </p>
                )}
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='functionName'>Function Name</Label>
                <Input
                  id='functionName'
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder='my-function'
                />
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='description'>
                  Description <span className='text-muted-foreground font-normal'>(optional)</span>
                </Label>
                <Textarea
                  id='description'
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder='Describe what this function does...'
                  rows={3}
                />
              </div>
            </Section>

            {/* ── Section 2: Code ─────────────────────────────────── */}
            <Section title='Code' open={codeOpen} onToggle={() => setCodeOpen(v => !v)}>
              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-1.5'>
                  <Label htmlFor='language'>Language</Label>
                  <select
                    id='language'
                    value={language}
                    onChange={e => handleLanguageChange(e.target.value)}
                    className={selectClass}
                  >
                    {languages.map(lang => (
                      <option key={lang} value={lang}>
                        {(displayNames.languages as Record<string, string>)[lang] ?? lang}
                      </option>
                    ))}
                  </select>
                </div>

                <div className='space-y-1.5'>
                  <Label htmlFor='runtime'>Runtime</Label>
                  <select
                    id='runtime'
                    value={selectedRuntime}
                    onChange={e => setSelectedRuntime(e.target.value)}
                    className={selectClass}
                  >
                    {availableRuntimes.map(rt => (
                      <option key={rt} value={rt}>
                        {(displayNames.runtimes as Record<string, string>)[rt] ?? rt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className='flex items-center gap-3'>
                <Checkbox
                  id='manualUpload'
                  checked={manualUpload}
                  onCheckedChange={checked => {
                    setManualUpload(checked === true)
                    if (!checked) setFile(null)
                  }}
                />
                <Label htmlFor='manualUpload' className='cursor-pointer'>
                  Upload package manually
                </Label>
              </div>

              {!manualUpload && (
                <div className='flex items-center gap-3 p-3 bg-muted/40 border border-border rounded-lg'>
                  <Code className='w-4 h-4 text-primary flex-shrink-0' />
                  <p className='text-sm text-muted-foreground'>
                    The{' '}
                    <span className='text-foreground font-medium'>
                      {(displayNames.languages as Record<string, string>)[language] ?? language}
                    </span>{' '}
                    starter template will be used automatically.
                  </p>
                </div>
              )}

              {manualUpload && (
                <div
                  className={cn(
                    'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
                    file ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
                  )}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => !file && fileInputRef.current?.click()}
                >
                  {file ? (
                    <div className='space-y-2'>
                      <FileText className='w-10 h-10 mx-auto text-primary' />
                      <p className='text-foreground font-medium text-sm'>{file.name}</p>
                      <p className='text-muted-foreground text-xs'>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={e => {
                          e.stopPropagation()
                          setFile(null)
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className='space-y-2'>
                      <Upload className='w-10 h-10 mx-auto text-muted-foreground' />
                      <p className='text-foreground text-sm'>Drag and drop or click to browse</p>
                      <p className='text-muted-foreground text-xs'>.zip or .tar.gz, max 50 MB</p>
                      <input
                        ref={fileInputRef}
                        type='file'
                        accept='.zip,.tar.gz,.tgz'
                        onChange={handleFileSelect}
                        className='hidden'
                      />
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={e => {
                          e.stopPropagation()
                          fileInputRef.current?.click()
                        }}
                      >
                        Choose File
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* ── Footer ──────────────────────────────────────────── */}
            <div className='pt-4 space-y-3'>
              {error && (
                <div className='p-3 rounded-lg border bg-red-900/30 border-red-800 text-red-400 flex items-start gap-2'>
                  <AlertCircle className='w-4 h-4 mt-0.5 flex-shrink-0' />
                  <p className='text-sm'>{error}</p>
                </div>
              )}
              <div className='flex justify-end'>
                <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
                  {submitting ? (
                    <>
                      <Loader className='w-4 h-4 animate-spin mr-2' />
                      Deploying...
                    </>
                  ) : (
                    'Deploy Function'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
