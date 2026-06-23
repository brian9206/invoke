import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import { FunctionGroupList, FunctionGroup } from '@/components/FunctionGroupList'
import { FunctionItem } from '@/components/FunctionCard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Package, Loader, AlertCircle, Settings, Plus, Minus, Save, Edit, X } from 'lucide-react'
import { getFunctionUrl, authenticatedFetch } from '@/lib/frontend-utils'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'

interface ProjectEnvVar {
  id?: number
  variable_name: string
  variable_value: string
  description?: string
}

export default function Functions() {
  const { user } = useAuth()
  const { activeProject } = useProject()
  const [functions, setFunctions] = useState<FunctionItem[]>([])
  const [groups, setGroups] = useState<FunctionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [projectIsActive, setProjectIsActive] = useState<boolean | null>(null)
  const [functionUrls, setFunctionUrls] = useState<Record<string, string>>({})
  const [dialogState, setDialogState] = useState<{
    type: 'alert' | 'confirm' | null
    title: string
    message: string
    onConfirm?: () => void
  }>({ type: null, title: '', message: '' })

  const [projectEnvVars, setProjectEnvVars] = useState<ProjectEnvVar[]>([])
  const [envVarsLoading, setEnvVarsLoading] = useState(false)
  const [envVarsSaving, setEnvVarsSaving] = useState(false)
  const [editingEnvVars, setEditingEnvVars] = useState(false)
  const [tempEnvVars, setTempEnvVars] = useState<ProjectEnvVar[]>([])

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  useEffect(() => {
    if (user && activeProject) {
      fetchAll()
    } else {
      setFunctions([])
      setGroups([])
      setLoading(false)
    }
  }, [activeProject, user])

  useEffect(() => {
    if (activeProject?.id && UUID_RE.test(activeProject.id)) {
      setProjectIsActive(null)
      authenticatedFetch(`/api/admin/projects/${activeProject.id}`)
        .then(r => r.json())
        .then(d => {
          if (d.success) setProjectIsActive(d.data.is_active)
        })
        .catch(() => {})
    } else {
      setProjectIsActive(null)
    }
  }, [activeProject?.id])

  useEffect(() => {
    if (activeProject?.id && UUID_RE.test(activeProject.id)) {
      fetchProjectEnvVars()
    } else {
      setProjectEnvVars([])
    }
  }, [activeProject?.id])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const projectId = activeProject!.id
      const isSystem = projectId === 'system'

      const [funcRes, maybeGroupRes] = await Promise.all([
        authenticatedFetch(`/api/functions?projectId=${projectId}`),
        isSystem
          ? authenticatedFetch('/api/function-groups/all-projects')
          : authenticatedFetch(`/api/function-groups?projectId=${projectId}`)
      ])
      const funcData = await funcRes.json()
      const groupData = await maybeGroupRes.json()

      if (funcData.success) {
        setFunctions(funcData.data)
        const urls: Record<string, string> = {}
        await Promise.all(
          funcData.data.map(async (func: FunctionItem) => {
            urls[func.id] = await getFunctionUrl(func.id)
          })
        )
        setFunctionUrls(urls)
      }

      if (groupData.success) {
        if (isSystem) {
          const rawGroups: (FunctionGroup & { project_name: string })[] = groupData.data
          const projectMap = new Map<string, string>()
          if (funcData.success) {
            funcData.data.forEach((f: FunctionItem) => {
              if (f.project_id && f.project_name) projectMap.set(f.project_id, f.project_name)
            })
          }
          rawGroups.forEach(g => {
            if (g.project_id && g.project_name) projectMap.set(g.project_id, g.project_name)
          })
          const fakeRoots: FunctionGroup[] = Array.from(projectMap.entries()).map(([pid, pname], i) => ({
            id: `project:${pid}`,
            name: pname,
            project_id: pid,
            sort_order: i
          }))
          const prefixedGroups: FunctionGroup[] = rawGroups.map(g => ({
            id: g.id,
            name: `${g.project_name}/${g.name}`,
            project_id: g.project_id,
            sort_order: g.sort_order
          }))
          setGroups([...fakeRoots, ...prefixedGroups])
        } else {
          setGroups(groupData.data)
        }
      }
    } catch (error) {
      console.error('Error fetching functions:', error)
    } finally {
      setLoading(false)
    }
  }

  const refreshGroups = async () => {
    try {
      const projectId = activeProject!.id
      const isSystem = projectId === 'system'
      const res = isSystem
        ? await authenticatedFetch('/api/function-groups/all-projects')
        : await authenticatedFetch(`/api/function-groups?projectId=${projectId}`)
      const data = await res.json()
      if (data.success) {
        if (isSystem) {
          const rawGroups: (FunctionGroup & { project_name: string })[] = data.data
          const projectMap = new Map<string, string>()
          rawGroups.forEach(g => {
            if (g.project_id && g.project_name) projectMap.set(g.project_id, g.project_name)
          })
          const fakeRoots: FunctionGroup[] = Array.from(projectMap.entries()).map(([pid, pname], i) => ({
            id: `project:${pid}`,
            name: pname,
            project_id: pid,
            sort_order: i
          }))
          const prefixedGroups: FunctionGroup[] = rawGroups.map(g => ({
            id: g.id,
            name: `${g.project_name}/${g.name}`,
            project_id: g.project_id,
            sort_order: g.sort_order
          }))
          setGroups([...fakeRoots, ...prefixedGroups])
        } else {
          setGroups(data.data)
        }
      }
    } catch (error) {
      console.error('Error refreshing groups:', error)
    }
  }

  const fetchProjectEnvVars = async () => {
    setEnvVarsLoading(true)
    try {
      const r = await authenticatedFetch(`/api/projects/${activeProject!.id}/environment-variables`)
      const d = await r.json()
      if (d.success) setProjectEnvVars(d.data)
    } catch (error) {
      console.error('Error fetching project environment variables:', error)
    } finally {
      setEnvVarsLoading(false)
    }
  }

  const addProjectEnvVar = () => {
    setTempEnvVars(prev => [...prev, { variable_name: '', variable_value: '', description: '' }])
  }

  const removeProjectEnvVar = (index: number) => {
    setTempEnvVars(prev => prev.filter((_, i) => i !== index))
  }

  const updateProjectEnvVar = (index: number, field: keyof ProjectEnvVar, value: string) => {
    setTempEnvVars(prev => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)))
  }

  const saveProjectEnvVars = async () => {
    setEnvVarsSaving(true)
    try {
      const r = await authenticatedFetch(`/api/projects/${activeProject!.id}/environment-variables`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: tempEnvVars })
      })
      const d = await r.json()
      if (d.success) {
        setProjectEnvVars([...tempEnvVars])
        setEditingEnvVars(false)
      } else {
        setDialogState({ type: 'alert', title: 'Error', message: 'Failed to save: ' + (d.message || 'Unknown') })
      }
    } catch {
      setDialogState({ type: 'alert', title: 'Error', message: 'Error saving environment variables' })
    } finally {
      setEnvVarsSaving(false)
    }
  }

  const toggleFunction = async (id: string, isActive: boolean) => {
    try {
      const response = await authenticatedFetch(`/api/functions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive })
      })
      if (response.ok) {
        setFunctions(prev => prev.map(f => (f.id === id ? { ...f, is_active: !isActive } : f)))
      }
    } catch (error) {
      console.error('Error toggling function:', error)
    }
  }

  const deleteFunction = async (id: string) => {
    setDialogState({
      type: 'confirm',
      title: 'Delete Function',
      message: 'Are you sure you want to delete this function?',
      onConfirm: async () => {
        try {
          const response = await authenticatedFetch(`/api/functions/${id}`, { method: 'DELETE' })
          if (response.ok) {
            setFunctions(prev => prev.filter(f => f.id !== id))
            setDialogState({ type: null, title: '', message: '' })
          }
        } catch (error) {
          console.error('Error deleting function:', error)
        }
      }
    })
  }

  const canDeploy =
    !activeProject || user?.isAdmin || activeProject.role === 'developer' || activeProject.role === 'owner'

  const isSystemProject = activeProject?.id === 'system'
  const canWrite = Boolean(
    !isSystemProject && (user?.isAdmin || activeProject?.role === 'developer' || activeProject?.role === 'owner')
  )

  const functionListContent = (
    <>
      {!activeProject ? (
        <Card>
          <CardContent className='py-12 text-center'>
            <Package className='w-16 h-16 mx-auto text-muted-foreground mb-4' />
            <h2 className='text-xl font-semibold text-foreground mb-2'>Loading Project</h2>
            <p className='text-muted-foreground'>Please wait while we load your project</p>
          </CardContent>
        </Card>
      ) : functions.length === 0 && groups.length === 0 ? (
        <Card>
          <CardContent className='py-12 text-center'>
            <Package className='w-16 h-16 mx-auto text-muted-foreground mb-4' />
            <h2 className='text-xl font-semibold text-foreground mb-2'>No Functions Deployed</h2>
            <p className='text-muted-foreground mb-6'>Deploy your first serverless function to get started</p>
            {canDeploy ? (
              <Button asChild>
                <Link href='/admin/deploy'>Deploy Function</Link>
              </Button>
            ) : (
              <Button disabled>Deploy Function</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <FunctionGroupList
          functions={functions}
          groups={groups}
          projectId={activeProject.id}
          functionUrls={functionUrls}
          canWrite={canWrite}
          onFunctionsChange={setFunctions}
          onGroupsChange={setGroups}
          onGroupsRefresh={refreshGroups}
          onToggleFunction={toggleFunction}
          onDeleteFunction={deleteFunction}
        />
      )}
    </>
  )

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title='Functions'>
          <div className='flex justify-center items-center h-64'>
            <div className='flex flex-col items-center gap-3'>
              <Loader className='w-8 h-8 text-primary animate-spin' />
              <div className='text-muted-foreground animate-pulse'>Loading functions...</div>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Layout title='Functions'>
        <div className='space-y-6'>
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
            cancelText='Cancel'
            confirmText='Delete'
            confirmVariant='danger'
          />

          {projectIsActive === false && (
            <div className='flex items-center gap-3 rounded-lg border border-yellow-600/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400'>
              <AlertCircle className='w-4 h-4 shrink-0' />
              <span>
                The project <strong>{activeProject?.name}</strong> is currently inactive. Functions in this project
                cannot be executed until the project is reactivated.
              </span>
            </div>
          )}

          <PageHeader title='Functions' subtitle='Manage your deployed serverless functions'>
            {canDeploy ? (
              <Button asChild>
                <Link href='/admin/deploy'>Deploy Function</Link>
              </Button>
            ) : (
              <Button disabled>Deploy Function</Button>
            )}
          </PageHeader>

          {isSystemProject ? (
            functionListContent
          ) : (
            <Tabs defaultValue='functions'>
              <TabsList>
                <TabsTrigger value='functions'>Functions</TabsTrigger>
                <TabsTrigger value='environment'>Environment</TabsTrigger>
              </TabsList>

              <TabsContent value='functions' className='mt-0'>
                {functionListContent}
              </TabsContent>

              <TabsContent value='environment' className='mt-0'>
                <Card>
                  <CardContent className='pt-6 space-y-4'>
                    <div className='flex items-center justify-between'>
                      <h3 className='text-base font-semibold flex items-center gap-2 text-foreground'>
                        <Settings className='w-5 h-5' />
                        Project Environment Variables
                      </h3>
                      {!editingEnvVars && (
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            setEditingEnvVars(true)
                            setTempEnvVars([...projectEnvVars])
                          }}
                        >
                          <Edit className='w-4 h-4 mr-1' />
                          Edit
                        </Button>
                      )}
                    </div>
                    {envVarsLoading ? (
                      <div className='space-y-2'>
                        <Skeleton className='h-10 w-full' />
                        <Skeleton className='h-10 w-full' />
                        <Skeleton className='h-10 w-3/4' />
                      </div>
                    ) : editingEnvVars ? (
                      <div className='space-y-4'>
                        {tempEnvVars.length === 0 ? (
                          <div className='text-center py-8 border-2 border-dashed border-border rounded-lg text-muted-foreground'>
                            <Settings className='w-12 h-12 mx-auto mb-3 opacity-30' />
                            <p>No environment variables defined</p>
                          </div>
                        ) : (
                          <div className='space-y-3'>
                            {tempEnvVars.map((envVar, index) => (
                              <div
                                key={index}
                                className='flex flex-col gap-2 rounded-lg border border-border bg-muted p-3 sm:flex-row sm:items-center'
                              >
                                <Input
                                  placeholder='VARIABLE_NAME'
                                  value={envVar.variable_name}
                                  onChange={e =>
                                    updateProjectEnvVar(
                                      index,
                                      'variable_name',
                                      e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '')
                                    )
                                  }
                                  className='font-mono text-sm sm:w-40'
                                />
                                <span className='text-muted-foreground'>=</span>
                                <Input
                                  placeholder='Value'
                                  value={envVar.variable_value}
                                  onChange={e => updateProjectEnvVar(index, 'variable_value', e.target.value)}
                                  className='min-w-0 flex-1 text-sm'
                                />
                                <Input
                                  placeholder='Description (optional)'
                                  value={envVar.description || ''}
                                  onChange={e => updateProjectEnvVar(index, 'description', e.target.value)}
                                  className='min-w-0 flex-1 text-sm'
                                />
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant='ghost'
                                      size='icon'
                                      onClick={() => removeProjectEnvVar(index)}
                                      className='text-destructive hover:text-destructive shrink-0'
                                    >
                                      <Minus className='w-4 h-4' />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Remove variable</TooltipContent>
                                </Tooltip>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className='flex gap-2'>
                          <Button variant='outline' size='sm' onClick={addProjectEnvVar}>
                            <Plus className='w-4 h-4 mr-1' />
                            Add Variable
                          </Button>
                          <Button size='sm' onClick={saveProjectEnvVars} disabled={envVarsSaving}>
                            {envVarsSaving ? (
                              <>
                                <Loader className='w-4 h-4 mr-1 animate-spin' />
                                Saving…
                              </>
                            ) : (
                              <>
                                <Save className='w-4 h-4 mr-1' />
                                Save Variables
                              </>
                            )}
                          </Button>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => {
                              setEditingEnvVars(false)
                              setTempEnvVars([...projectEnvVars])
                            }}
                          >
                            <X className='w-4 h-4 mr-1' />
                            Cancel
                          </Button>
                        </div>
                        <div className='bg-blue-900/20 border border-blue-700 rounded-lg p-3'>
                          <p className='text-blue-300 text-sm'>
                            <strong>Note:</strong> Project environment variables are available to all functions in this
                            project. A function-level environment variable with the same name takes priority.
                          </p>
                        </div>
                      </div>
                    ) : projectEnvVars.length === 0 ? (
                      <div className='text-center py-8 border-2 border-dashed border-border rounded-lg text-muted-foreground'>
                        <Settings className='w-12 h-12 mx-auto mb-3 opacity-30' />
                        <p>No environment variables defined</p>
                        <p className='text-sm mt-1'>Project environment variables are shared across all functions</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className='font-mono'>Variable Name</TableHead>
                            <TableHead>Description</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {projectEnvVars.map((envVar, index) => (
                            <TableRow key={envVar.id || index}>
                              <TableCell className='text-blue-300 font-mono text-sm'>{envVar.variable_name}</TableCell>
                              <TableCell className='text-muted-foreground text-sm'>
                                {envVar.description || '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
