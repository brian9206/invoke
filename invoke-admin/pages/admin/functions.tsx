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
import { Package, Loader } from 'lucide-react'
import { getFunctionUrl, authenticatedFetch } from '@/lib/frontend-utils'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'

export default function Functions() {
  const { user } = useAuth()
  const { activeProject } = useProject()
  const [functions, setFunctions] = useState<FunctionItem[]>([])
  const [groups, setGroups] = useState<FunctionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [functionUrls, setFunctionUrls] = useState<Record<string, string>>({})
  const [dialogState, setDialogState] = useState<{
    type: 'alert' | 'confirm' | null
    title: string
    message: string
    onConfirm?: () => void
  }>({ type: null, title: '', message: '' })

  useEffect(() => {
    if (user && activeProject) {
      fetchAll()
    } else {
      setFunctions([])
      setGroups([])
      setLoading(false)
    }
  }, [activeProject, user])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const projectId = activeProject!.id
      const isSystem = projectId === 'system'

      const [funcRes, maybeGroupRes] = await Promise.all([
        authenticatedFetch(`/api/functions?projectId=${projectId}`),
        isSystem
          ? authenticatedFetch('/api/function-groups/all-projects')
          : authenticatedFetch(`/api/function-groups?projectId=${projectId}`),
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
          // Build fake project-level root groups + prefix real group names.
          // Seed the project map from functions too, so projects with only
          // ungrouped functions still get a fake root node.
          const rawGroups: (FunctionGroup & { project_name: string })[] = groupData.data
          const projectMap = new Map<string, string>()
          if (funcData.success) {
            funcData.data.forEach((f: FunctionItem) => {
              if (f.project_id && f.project_name) projectMap.set(f.project_id, f.project_name)
            })
          }
          rawGroups.forEach((g) => {
            if (g.project_id && g.project_name) projectMap.set(g.project_id, g.project_name)
          })
          const fakeRoots: FunctionGroup[] = Array.from(projectMap.entries()).map(
            ([pid, pname], i) => ({
              id: `project:${pid}`,
              name: pname,
              project_id: pid,
              sort_order: i,
            })
          )
          const prefixedGroups: FunctionGroup[] = rawGroups.map((g) => ({
            id: g.id,
            name: `${g.project_name}/${g.name}`,
            project_id: g.project_id,
            sort_order: g.sort_order,
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
          rawGroups.forEach((g) => {
            if (g.project_id && g.project_name) projectMap.set(g.project_id, g.project_name)
          })
          const fakeRoots: FunctionGroup[] = Array.from(projectMap.entries()).map(
            ([pid, pname], i) => ({
              id: `project:${pid}`,
              name: pname,
              project_id: pid,
              sort_order: i,
            })
          )
          const prefixedGroups: FunctionGroup[] = rawGroups.map((g) => ({
            id: g.id,
            name: `${g.project_name}/${g.name}`,
            project_id: g.project_id,
            sort_order: g.sort_order,
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

  const toggleFunction = async (id: string, isActive: boolean) => {
    try {
      const response = await authenticatedFetch(`/api/functions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      })
      if (response.ok) {
        setFunctions((prev) =>
          prev.map((f) => (f.id === id ? { ...f, is_active: !isActive } : f))
        )
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
            setFunctions((prev) => prev.filter((f) => f.id !== id))
            setDialogState({ type: null, title: '', message: '' })
          }
        } catch (error) {
          console.error('Error deleting function:', error)
        }
      },
    })
  }

  const canDeploy =
    !activeProject ||
    user?.isAdmin ||
    activeProject.role === 'developer' ||
    activeProject.role === 'owner'

  const isSystemProject = activeProject?.id === 'system'
  const canWrite = Boolean(
    !isSystemProject &&
      (user?.isAdmin ||
        activeProject?.role === 'developer' ||
        activeProject?.role === 'owner')
  )

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Functions">
          <div className="flex justify-center items-center h-64">
            <div className="flex flex-col items-center gap-3">
              <Loader className="w-8 h-8 text-primary animate-spin" />
              <div className="text-muted-foreground animate-pulse">Loading functions...</div>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Layout title="Functions">
        <div className="space-y-6">
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
            cancelText="Cancel"
            confirmText="Delete"
            confirmVariant="danger"
          />

          <PageHeader title="Functions" subtitle="Manage your deployed serverless functions">
            {canDeploy ? (
              <Button asChild>
                <Link href="/admin/deploy">Deploy Function</Link>
              </Button>
            ) : (
              <Button disabled>Deploy Function</Button>
            )}
          </PageHeader>

          {!activeProject ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">Loading Project</h2>
                <p className="text-muted-foreground">Please wait while we load your project</p>
              </CardContent>
            </Card>
          ) : functions.length === 0 && groups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">No Functions Deployed</h2>
                <p className="text-muted-foreground mb-6">
                  Deploy your first serverless function to get started
                </p>
                {canDeploy ? (
                  <Button asChild>
                    <Link href="/admin/deploy">Deploy Function</Link>
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
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
