import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import Modal from '@/components/Modal'
import { useProject } from '@/contexts/ProjectContext'
import {
  FolderOpen, Edit, Save, X, Trash2, Loader, Users, Package,
  Calendar, HardDrive, User, UserPlus, ShieldCheck,
  Play, Check,
} from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

interface ProjectDetail {
  id: string
  name: string
  description: string | null
  is_active: boolean
  kv_storage_limit_bytes: number
  created_at: string
  created_by_username: string | null
  member_count: number
  function_count: number
}

interface Member {
  id: number
  user_id: number
  username: string
  email: string
  role: 'owner' | 'developer'
  created_at: string
  added_by: string | null
}

interface UserOption {
  id: number
  username: string
  email: string
}

export default function ProjectDetails() {
  const router = useRouter()
  const { id } = router.query
  const { refreshProjects, lockProject, unlockProject, userProjects } = useProject()
  const hasLockedProject = useRef(false)

  const [dialogState, setDialogState] = useState<{
    type: 'alert' | 'confirm' | null
    title: string
    message: string
    onConfirm?: () => void
  }>({ type: null, title: '', message: '' })

  // ── Core project data ───────────────────────────────────────────────────────
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Header editing ──────────────────────────────────────────────────────────
  const [editHeaderModalOpen, setEditHeaderModalOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [headerSaving, setHeaderSaving] = useState(false)

  // ── Members ─────────────────────────────────────────────────────────────────
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false)
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [addMemberUserId, setAddMemberUserId] = useState<string>('')
  const [addMemberRole, setAddMemberRole] = useState<'owner' | 'developer'>('developer')
  const [addMemberSaving, setAddMemberSaving] = useState(false)
  const [updatingRoleId, setUpdatingRoleId] = useState<number | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null)

  // ── KV limit inline edit ───────────────────────────────────────────────────
  const [kvLimitEditing, setKvLimitEditing] = useState(false)
  const [kvLimitDraft, setKvLimitDraft] = useState(1)
  const [kvLimitSaving, setKvLimitSaving] = useState(false)

  // ── Project locking ──────────────────────────────────────────────────────────
  useEffect(() => {
    const systemProject = userProjects.find((p) => p.id === 'system')
    if (systemProject && !hasLockedProject.current) {
      hasLockedProject.current = true
      lockProject(systemProject)
    }
    return () => {
      if (hasLockedProject.current) {
        hasLockedProject.current = false
        unlockProject()
      }
    }
  }, [userProjects])

  useEffect(() => {
    if (id) {
      fetchProject()
      fetchMembers()
    }
  }, [id])

  // ── Data fetching ─────────────────────────────────────────────────────────────
  const fetchProject = async () => {
    try {
      const r = await authenticatedFetch(`/api/admin/projects/${id}`)
      const d = await r.json()
      if (d.success) {
        setProject(d.data)
      }
    } catch (e) {
      console.error('Error fetching project:', e)
    } finally {
      setLoading(false)
    }
  }

  const fetchMembers = async () => {
    setMembersLoading(true)
    try {
      const r = await authenticatedFetch(`/api/admin/project-members?projectId=${id}`)
      const d = await r.json()
      if (d.members) setMembers(d.members)
    } catch {
      console.error('Error fetching members')
    } finally {
      setMembersLoading(false)
    }
  }

  const fetchAllUsers = async () => {
    try {
      const r = await authenticatedFetch('/api/admin/users')
      const d = await r.json()
      if (d.users) setAllUsers(d.users)
    } catch {
      console.error('Error fetching users')
    }
  }

  // ── Header save ───────────────────────────────────────────────────────────────
  const saveHeader = async () => {
    setHeaderSaving(true)
    try {
      const r = await authenticatedFetch('/api/admin/projects', {
        method: 'PUT',
        body: JSON.stringify({
          id,
          name: editName,
          description: editDescription,
          is_active: project?.is_active,
          kv_storage_limit_bytes: project?.kv_storage_limit_bytes,
        }),
      })
      if (r.ok) {
        await fetchProject()
        await refreshProjects()
        setEditHeaderModalOpen(false)
      } else {
        const d = await r.json()
        setDialogState({ type: 'alert', title: 'Error', message: d.error || 'Failed to save' })
      }
    } catch {
      setDialogState({ type: 'alert', title: 'Error', message: 'Error saving project' })
    } finally {
      setHeaderSaving(false)
    }
  }

  // ── Toggle active ─────────────────────────────────────────────────────────────
  const toggleActiveStatus = async () => {
    if (!project) return
    try {
      const r = await authenticatedFetch('/api/admin/projects', {
        method: 'PUT',
        body: JSON.stringify({
          id,
          name: project.name,
          description: project.description,
          is_active: !project.is_active,
          kv_storage_limit_bytes: project.kv_storage_limit_bytes,
        }),
      })
      if (r.ok) {
        await fetchProject()
        await refreshProjects()
      }
    } catch {
      console.error('Error updating project status')
    }
  }

  // ── Delete project ────────────────────────────────────────────────────────────
  const deleteProject = () => {
    setDialogState({
      type: 'confirm',
      title: 'Delete Project',
      message: `Are you sure you want to delete "${project?.name}"? This will permanently delete all functions and data in this project. This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const r = await authenticatedFetch('/api/admin/projects', {
            method: 'DELETE',
            body: JSON.stringify({ id }),
          })
          if (r.ok) {
            await refreshProjects()
            router.push('/admin/projects')
            setDialogState({ type: null, title: '', message: '' })
          } else {
            const d = await r.json()
            setDialogState({ type: 'alert', title: 'Error', message: d.error || 'Failed to delete project' })
          }
        } catch {
          setDialogState({ type: 'alert', title: 'Error', message: 'Error deleting project' })
        }
      },
    })
  }

  // ── Members ───────────────────────────────────────────────────────────────────
  const openAddMemberModal = async () => {
    await fetchAllUsers()
    setAddMemberUserId('')
    setAddMemberRole('developer')
    setAddMemberModalOpen(true)
  }

  const addMember = async () => {
    if (!addMemberUserId) {
      setDialogState({ type: 'alert', title: 'Error', message: 'Please select a user' })
      return
    }
    setAddMemberSaving(true)
    try {
      const r = await authenticatedFetch('/api/admin/project-members', {
        method: 'POST',
        body: JSON.stringify({ projectId: id, userId: addMemberUserId, role: addMemberRole }),
      })
      const d = await r.json()
      if (r.ok) {
        await fetchMembers()
        await fetchProject()
        setAddMemberModalOpen(false)
      } else {
        setDialogState({ type: 'alert', title: 'Error', message: d.error || 'Failed to add member' })
      }
    } catch {
      setDialogState({ type: 'alert', title: 'Error', message: 'Error adding member' })
    } finally {
      setAddMemberSaving(false)
    }
  }

  const updateMemberRole = async (membershipId: number, role: 'owner' | 'developer') => {
    setUpdatingRoleId(membershipId)
    try {
      const r = await authenticatedFetch('/api/admin/project-members', {
        method: 'PUT',
        body: JSON.stringify({ membershipId, role }),
      })
      if (r.ok) await fetchMembers()
      else {
        const d = await r.json()
        setDialogState({ type: 'alert', title: 'Error', message: d.error || 'Failed to update role' })
      }
    } catch {
      setDialogState({ type: 'alert', title: 'Error', message: 'Error updating role' })
    } finally {
      setUpdatingRoleId(null)
    }
  }

  const removeMember = (member: Member) => {
    setDialogState({
      type: 'confirm',
      title: 'Remove Member',
      message: `Remove ${member.username} from this project?`,
      onConfirm: async () => {
        setRemovingMemberId(member.id)
        setDialogState({ type: null, title: '', message: '' })
        try {
          const r = await authenticatedFetch('/api/admin/project-members', {
            method: 'DELETE',
            body: JSON.stringify({ membershipId: member.id }),
          })
          if (r.ok) {
            await fetchMembers()
            await fetchProject()
          } else {
            const d = await r.json()
            setDialogState({ type: 'alert', title: 'Error', message: d.error || 'Failed to remove member' })
          }
        } catch {
          setDialogState({ type: 'alert', title: 'Error', message: 'Error removing member' })
        } finally {
          setRemovingMemberId(null)
        }
      },
    })
  }

  // ── KV limit save ──────────────────────────────────────────────────────────
  const saveKvLimit = async () => {
    if (!project) return
    setKvLimitSaving(true)
    try {
      const r = await authenticatedFetch('/api/admin/projects', {
        method: 'PUT',
        body: JSON.stringify({
          id,
          name: project.name,
          description: project.description,
          is_active: project.is_active,
          kv_storage_limit_bytes: Math.round(kvLimitDraft * 1024 * 1024 * 1024),
        }),
      })
      if (r.ok) {
        await fetchProject()
        await refreshProjects()
        setKvLimitEditing(false)
      } else {
        const d = await r.json()
        setDialogState({ type: 'alert', title: 'Error', message: d.error || 'Failed to save' })
      }
    } catch {
      setDialogState({ type: 'alert', title: 'Error', message: 'Error saving KV limit' })
    } finally {
      setKvLimitSaving(false)
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────────────
  const formatDate = (ds: string) => new Date(ds).toLocaleString()
  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[Math.min(i, sizes.length - 1)]
  }

  const availableUsersToAdd = allUsers.filter(
    (u) => !members.some((m) => m.user_id === u.id)
  )

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Project">
          <div className="flex items-center justify-center h-64">
            <Loader className="w-8 h-8 text-primary animate-spin" />
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  if (!project) {
    return (
      <ProtectedRoute>
        <Layout title="Project">
          <div className="flex items-center justify-center h-64 text-destructive">Project not found</div>
        </Layout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <TooltipProvider>
        <Layout title={project.name}>
          <Modal
            isOpen={dialogState.type !== null}
            title={dialogState.title}
            description={dialogState.message}
            onCancel={() => setDialogState({ type: null, title: '', message: '' })}
            onConfirm={
              dialogState.type === 'alert'
                ? undefined
                : async () => {
                    if (dialogState.onConfirm) await dialogState.onConfirm()
                    else setDialogState({ type: null, title: '', message: '' })
                  }
            }
            cancelText={dialogState.type === 'alert' ? 'OK' : 'Cancel'}
            confirmText={dialogState.type === 'alert' ? undefined : 'Continue'}
            confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
          />

          <div >

            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <PageHeader
                title={project.name}
                subtitle={project.description || 'No description provided'}
                icon={<FolderOpen className="w-8 h-8 text-primary" />}
              />
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditName(project.name)
                        setEditDescription(project.description || '')
                        setEditHeaderModalOpen(true)
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={deleteProject}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete project</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* ── Tabs ─────────────────────────────────────────────────────── */}
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="members">Members</TabsTrigger>
              </TabsList>

              {/* ── Overview Tab ─────────────────────────────────────────── */}
              <TabsContent value="overview" className="space-y-6 mt-0">

                {/* Actions */}
                <Card>
                  <CardContent className="overflow-x-auto">
                    <div className="mt-6">
                      <div className="flex gap-2 whitespace-nowrap [&>*]:shrink-0">
                        {project.is_active ? (
                          <Button variant="destructive" onClick={toggleActiveStatus}>
                            <X className="w-4 h-4 mr-1" />Deactivate
                          </Button>
                        ) : (
                          <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={toggleActiveStatus}>
                            <Play className="w-4 h-4 mr-1" />Activate
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Project Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FolderOpen className="w-5 h-5" />Project Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</dt>
                        <dd>
                          <Badge variant={project.is_active ? 'success' : 'secondary'}>
                            {project.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Members</dt>
                        <dd className="flex items-center gap-1"><Users className="w-4 h-4 text-muted-foreground" />{project.member_count}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Functions</dt>
                        <dd className="flex items-center gap-1"><Package className="w-4 h-4 text-muted-foreground" />{project.function_count}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">KV Storage Limit</dt>
                        <dd className="flex items-center gap-1">
                          {kvLimitEditing ? (
                            <>
                              <HardDrive className="w-4 h-4 text-muted-foreground shrink-0" />
                              <Input
                                type="number"
                                min="0.001"
                                step="0.1"
                                autoFocus
                                value={kvLimitDraft}
                                onChange={(e) => setKvLimitDraft(parseFloat(e.target.value) || 0)}
                                className="h-7 w-28 text-sm px-2"
                                onKeyDown={(e) => { if (e.key === 'Enter') saveKvLimit(); if (e.key === 'Escape') setKvLimitEditing(false) }}
                              />
                              <span className="text-muted-foreground text-sm">GB</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveKvLimit} disabled={kvLimitSaving}>
                                    {kvLimitSaving ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 text-green-500" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Save</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setKvLimitEditing(false)} disabled={kvLimitSaving}>
                                    <X className="w-3 h-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Cancel</TooltipContent>
                              </Tooltip>
                            </>
                          ) : (
                            <>
                              <HardDrive className="w-4 h-4 text-muted-foreground" />
                              {formatBytes(project.kv_storage_limit_bytes)}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 ml-0.5"
                                    onClick={() => {
                                      setKvLimitDraft(project.kv_storage_limit_bytes / (1024 * 1024 * 1024))
                                      setKvLimitEditing(true)
                                    }}
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit KV storage limit</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                        </dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</dt>
                        <dd className="flex items-center gap-1"><Calendar className="w-4 h-4 text-muted-foreground" />{formatDate(project.created_at)}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created By</dt>
                        <dd className="flex items-center gap-1"><User className="w-4 h-4 text-muted-foreground" />{project.created_by_username || '—'}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5 sm:col-span-2">
                        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project ID</dt>
                        <dd className="break-all font-mono text-xs">{project.id}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>

              </TabsContent>

              {/* ── Members Tab ──────────────────────────────────────────── */}
              <TabsContent value="members" className="space-y-6 mt-0">

                {/* Members List */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="w-5 h-5" />Members
                        <Badge variant="secondary" className="ml-1">{members.length}</Badge>
                      </CardTitle>
                      <Button size="sm" onClick={openAddMemberModal}>
                        <UserPlus className="w-4 h-4 mr-1" />Add Member
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {membersLoading ? (
                      <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                        <Loader className="w-8 h-8 animate-spin" />Loading members…
                      </div>
                    ) : members.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>No members found</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>User</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Role</TableHead>
                              <TableHead>Added By</TableHead>
                              <TableHead>Joined</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {members.map((member) => (
                              <TableRow key={member.id}>
                                <TableCell className="font-medium text-foreground flex items-center gap-2">
                                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                                  {member.username}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                                <TableCell>
                                  <Badge variant={member.role === 'owner' ? 'default' : 'secondary'} className="flex items-center gap-1 w-fit">
                                    <ShieldCheck className="w-3 h-3" />{member.role}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">{member.added_by || '—'}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{formatDate(member.created_at)}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 text-xs"
                                          disabled={updatingRoleId === member.id}
                                          onClick={() => updateMemberRole(member.id, member.role === 'owner' ? 'developer' : 'owner')}
                                        >
                                          {updatingRoleId === member.id
                                            ? <Loader className="w-3.5 h-3.5 animate-spin" />
                                            : <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
                                          {member.role === 'owner' ? 'Make Developer' : 'Make Owner'}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Change role</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="text-destructive hover:text-destructive h-8 w-8"
                                          disabled={removingMemberId === member.id}
                                          onClick={() => removeMember(member)}
                                        >
                                          {removingMemberId === member.id
                                            ? <Loader className="w-4 h-4 animate-spin" />
                                            : <Trash2 className="w-4 h-4" />}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Remove member</TooltipContent>
                                    </Tooltip>
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

              </TabsContent>

            </Tabs>
          </div>

          {/* ── Edit Project Modal ──────────────────────────────────────────── */}
          <Modal
            isOpen={editHeaderModalOpen}
            title="Edit Project"
            onCancel={() => setEditHeaderModalOpen(false)}
            hideFooter
            className="max-w-lg"
          >
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Project name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Enter project description…"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={saveHeader} disabled={headerSaving}>
                  {headerSaving
                    ? <><Loader className="w-4 h-4 mr-1 animate-spin" />Saving…</>
                    : <><Save className="w-4 h-4 mr-1" />Save</>}
                </Button>
                <Button variant="outline" onClick={() => setEditHeaderModalOpen(false)}>
                  <X className="w-4 h-4 mr-1" />Cancel
                </Button>
              </div>
            </div>
          </Modal>

          {/* ── Add Member Modal ────────────────────────────────────────────── */}
          <Modal
            isOpen={addMemberModalOpen}
            title="Add Member"
            onCancel={() => setAddMemberModalOpen(false)}
            hideFooter
            className="max-w-md"
          >
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>User</Label>
                {availableUsersToAdd.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All users are already members of this project.</p>
                ) : (
                  <Select value={addMemberUserId} onValueChange={setAddMemberUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsersToAdd.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.username} ({u.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={addMemberRole} onValueChange={(v) => setAddMemberRole(v as 'owner' | 'developer')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={addMember}
                  disabled={addMemberSaving || availableUsersToAdd.length === 0 || !addMemberUserId}
                >
                  {addMemberSaving
                    ? <><Loader className="w-4 h-4 mr-1 animate-spin" />Adding…</>
                    : <><UserPlus className="w-4 h-4 mr-1" />Add Member</>}
                </Button>
                <Button variant="outline" onClick={() => setAddMemberModalOpen(false)}>
                  <X className="w-4 h-4 mr-1" />Cancel
                </Button>
              </div>
            </div>
          </Modal>

        </Layout>
      </TooltipProvider>
    </ProtectedRoute>
  )
}
