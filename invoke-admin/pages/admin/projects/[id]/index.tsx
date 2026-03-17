import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import Modal from '@/components/Modal';
import { ArrowLeft, Users, Package, Settings, Calendar, Eye, Edit, Trash2, UserPlus, Crown, Loader } from 'lucide-react';
import Link from 'next/link';
import { authenticatedFetch } from '@/lib/frontend-utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Project {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
  kv_storage_limit_bytes: number;
}

interface ProjectStats {
  memberCount: number;
  functionCount: number;
  recentMembers: Array<{ username: string; role: string; created_at: string }>;
  recentFunctions: Array<{ id: string; name: string; created_at: string; is_active: boolean }>;
}

interface Member {
  id: number;
  user_id: number;
  username: string;
  email: string;
  role: string;
  created_at: string;
  added_by: string;
}

interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const { id: projectId } = router.query;
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '', kvStorageLimit: 1 });
  const [editing, setEditing] = useState(false);
  const [dialogState, setDialogState] = useState<{ type: 'alert' | 'confirm' | null; title: string; message: string; onConfirm?: () => void }>({ type: null, title: '', message: '' });

  const [members, setMembers] = useState<Member[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('developer');

  useEffect(() => {
    if (projectId) { loadProject(); loadProjectStats(); loadMembers(); loadAvailableUsers(); }
  }, [projectId]);

  const loadProject = async () => {
    try {
      const r = await authenticatedFetch('/api/admin/projects');
      if (r.ok) { const d = await r.json(); setProject(d.projects.find((p: Project) => p.id === projectId) || null); }
    } catch { console.error('Error loading project') }
  };

  const loadProjectStats = async () => {
    try {
      const [membersRes, functionsRes] = await Promise.all([
        authenticatedFetch(`/api/admin/project-members?projectId=${projectId}`),
        authenticatedFetch(`/api/functions?projectId=${projectId}`),
      ]);
      if (membersRes.ok && functionsRes.ok) {
        const [membersData, functionsData] = await Promise.all([membersRes.json(), functionsRes.json()]);
        const mems = membersData.members || [];
        const funcs = functionsData.success ? functionsData.data : [];
        setStats({ memberCount: mems.length, functionCount: funcs.length, recentMembers: mems.slice(-3).reverse(), recentFunctions: funcs.slice(-3).reverse() });
      }
    } catch { console.error('Error loading stats') }
    finally { setLoading(false) }
  };

  const openEditModal = () => {
    if (project) { setEditForm({ name: project.name, description: project.description || '', kvStorageLimit: project.kv_storage_limit_bytes / (1024 * 1024 * 1024) }); setShowEditModal(true); }
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setEditing(true);
    try {
      const r = await authenticatedFetch('/api/admin/projects', { method: 'PUT', body: JSON.stringify({ id: project.id, name: editForm.name, description: editForm.description, is_active: project.is_active, kv_storage_limit_bytes: editForm.kvStorageLimit * 1024 * 1024 * 1024 }) });
      if (r.ok) { toast.success('Project updated successfully'); setShowEditModal(false); loadProject(); }
      else { const d = await r.json(); toast.error(d.error || 'Failed to update project'); }
    } catch { toast.error('Error updating project') }
    finally { setEditing(false) }
  };

  const handleDeleteProject = () => {
    if (!project) return;
    setDialogState({
      type: 'confirm', title: 'Delete Project', message: `Are you sure you want to delete the project "${project.name}"?`,
      onConfirm: async () => {
        try {
          const r = await authenticatedFetch('/api/admin/projects', { method: 'DELETE', body: JSON.stringify({ id: project.id }) });
          if (r.ok) { toast.success('Project deleted'); router.push('/admin/projects'); setDialogState({ type: null, title: '', message: '' }); }
          else { const d = await r.json(); toast.error(d.error || 'Failed to delete project'); }
        } catch { toast.error('Error deleting project') }
      }
    });
  };

  const loadMembers = async () => {
    try { const r = await authenticatedFetch(`/api/admin/project-members?projectId=${projectId}`); if (r.ok) { const d = await r.json(); setMembers(d.members || []); } }
    catch { console.error('Error loading members') }
  };

  const loadAvailableUsers = async () => {
    try { const r = await authenticatedFetch('/api/admin/users'); if (r.ok) { const d = await r.json(); setAvailableUsers(d.users || []); } }
    catch { console.error('Error loading users') }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) { setDialogState({ type: 'alert', title: 'Error', message: 'Please select a user' }); return; }
    try {
      const r = await authenticatedFetch('/api/admin/project-members', { method: 'POST', body: JSON.stringify({ projectId, userId: parseInt(selectedUserId), role: selectedRole }) });
      if (r.ok) { setShowAddMemberModal(false); setSelectedUserId(''); setSelectedRole('developer'); loadMembers(); toast.success('Member added'); }
      else { const d = await r.json(); toast.error(d.error || 'Failed to add member'); }
    } catch { toast.error('Error adding member') }
  };

  const handleUpdateMemberRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    try {
      const r = await authenticatedFetch('/api/admin/project-members', { method: 'PUT', body: JSON.stringify({ membershipId: editingMember.id, role: selectedRole }) });
      if (r.ok) { setEditingMember(null); setSelectedRole('developer'); loadMembers(); toast.success('Role updated'); }
      else { const d = await r.json(); toast.error(d.error || 'Failed to update role'); }
    } catch { toast.error('Error updating role') }
  };

  const handleRemoveMember = (member: Member) => {
    setDialogState({
      type: 'confirm', title: 'Remove Member', message: `Are you sure you want to remove ${member.username} from this project?`,
      onConfirm: async () => {
        try {
          const r = await authenticatedFetch('/api/admin/project-members', { method: 'DELETE', body: JSON.stringify({ membershipId: member.id }) });
          if (r.ok) { loadMembers(); toast.success('Member removed'); setDialogState({ type: null, title: '', message: '' }); }
          else { const d = await r.json(); toast.error(d.error || 'Failed to remove member'); }
        } catch { toast.error('Error removing member') }
      }
    });
  };

  const openEditMemberModal = (member: Member) => { setEditingMember(member); setSelectedRole(member.role); };
  const closeModals = () => { setShowAddMemberModal(false); setEditingMember(null); setSelectedUserId(''); setSelectedRole('developer'); };
  const nonMemberUsers = availableUsers.filter(u => !members.some(m => m.user_id === u.id));

  if (loading) return (
    <Layout><div className="flex justify-center items-center h-64"><Loader className="w-8 h-8 text-primary animate-spin" /></div></Layout>
  );
  if (!project) return (
    <Layout><div className="text-center py-12"><p className="text-destructive text-lg">Project not found.</p><Link href="/admin/projects" className="text-primary hover:underline mt-4 inline-block">Back to Projects</Link></div></Layout>
  );

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
          <Modal
            isOpen={dialogState.type !== null}
            title={dialogState.title}
            description={dialogState.message}
            onCancel={() => setDialogState({ type: null, title: '', message: '' })}
            onConfirm={async () => { if (dialogState.onConfirm) await dialogState.onConfirm(); else setDialogState({ type: null, title: '', message: '' }); }}
            cancelText={dialogState.type === 'alert' ? 'OK' : 'Cancel'}
            confirmText={dialogState.type === 'alert' ? undefined : 'Remove'}
            confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
          />

          {/* Header */}
          <div className="flex items-center gap-4">
            <Link href="/admin/projects" className="p-2 hover:bg-muted rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div className="flex-1">
              <PageHeader
                title={project.name}
                subtitle={`Created by ${project.created_by} on ${new Date(project.created_at).toLocaleDateString()}`}
              >
                <Badge variant={project.is_active ? 'success' : 'destructive'}>{project.is_active ? 'Active' : 'Inactive'}</Badge>
                <Button onClick={openEditModal} className="bg-yellow-600 hover:bg-yellow-700 text-white">
                  <Edit className="w-4 h-4 mr-2" />Edit
                </Button>
                <Button variant="destructive" onClick={handleDeleteProject}>
                  <Trash2 className="w-4 h-4 mr-2" />Delete
                </Button>
              </PageHeader>
            </div>
          </div>
          {project.description && <p className="text-muted-foreground">{project.description}</p>}

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 flex items-center justify-between">
                <div><p className="text-muted-foreground text-sm">Total Members</p><p className="text-2xl font-bold text-foreground mt-1">{stats?.memberCount || 0}</p></div>
                <div className="bg-blue-500/10 p-3 rounded-xl"><Users className="w-6 h-6 text-blue-400" /></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 flex items-center justify-between">
                <div><p className="text-muted-foreground text-sm">Total Functions</p><p className="text-2xl font-bold text-foreground mt-1">{stats?.functionCount || 0}</p></div>
                <div className="bg-green-500/10 p-3 rounded-xl"><Package className="w-6 h-6 text-green-400" /></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 flex items-center justify-between">
                <div><p className="text-muted-foreground text-sm">Created</p><p className="text-lg font-bold text-foreground mt-1">{new Date(project.created_at).toLocaleDateString()}</p></div>
                <div className="bg-purple-500/10 p-3 rounded-xl"><Calendar className="w-6 h-6 text-purple-400" /></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 flex items-center justify-between">
                <div><p className="text-muted-foreground text-sm">Status</p><p className="text-lg font-bold text-foreground mt-1">{project.is_active ? 'Active' : 'Inactive'}</p></div>
                <div className={`p-3 rounded-xl ${project.is_active ? 'bg-green-500/10' : 'bg-muted'}`}><Eye className={`w-6 h-6 ${project.is_active ? 'text-green-400' : 'text-muted-foreground'}`} /></div>
              </CardContent>
            </Card>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Members */}
            <Card className="lg:col-span-2">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-foreground">Members</h3>
                  <Button size="sm" onClick={() => setShowAddMemberModal(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />Add Member
                  </Button>
                </div>
                {members.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium text-foreground">{member.username}</TableCell>
                          <TableCell className="text-muted-foreground">{member.email}</TableCell>
                          <TableCell>
                            <Badge variant={member.role === 'owner' ? 'warning' : 'secondary'} className="flex items-center gap-1 w-fit">
                              {member.role === 'owner' && <Crown className="w-3 h-3" />}
                              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => openEditMemberModal(member)} className="text-primary h-7 px-2">Edit</Button>
                              <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(member)} className="text-destructive h-7 px-2">Remove</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No members yet</p>
                    <Button variant="ghost" size="sm" onClick={() => setShowAddMemberModal(true)} className="text-primary mt-2">Add the first member</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Functions */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-foreground">Recent Functions</h3>
                  <Link href={`/admin/functions?projectId=${project.id}`} className="text-primary hover:text-primary/80 text-sm">View All</Link>
                </div>
                {stats?.recentFunctions && stats.recentFunctions.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Created</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {stats.recentFunctions.map((func) => (
                        <TableRow key={func.id}>
                          <TableCell className="font-medium text-foreground">{func.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{new Date(func.created_at).toLocaleDateString()}</TableCell>
                          <TableCell><Badge variant={func.is_active ? 'success' : 'destructive'}>{func.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No functions yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Add Member Modal */}
          <Modal
            isOpen={showAddMemberModal}
            title="Add Member"
            onCancel={closeModals}
            onConfirm={() => { const f = document.querySelector('form[data-add-member]') as HTMLFormElement; f?.dispatchEvent(new Event('submit', { bubbles: true })); }}
            cancelText="Cancel"
            confirmText="Add Member"
          >
            <form onSubmit={handleAddMember} data-add-member className="space-y-4">
              <div className="space-y-1.5">
                <Label>User</Label>
                <Select required value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger><SelectValue placeholder="Select a user…" /></SelectTrigger>
                  <SelectContent>
                    {nonMemberUsers.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.username} ({u.email})</SelectItem>)}
                  </SelectContent>
                </Select>
                {nonMemberUsers.length === 0 && <p className="text-xs text-muted-foreground">All users are already members</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </form>
          </Modal>

          {/* Edit Member Role Modal */}
          <Modal
            isOpen={!!editingMember}
            title={`Change Role for ${editingMember?.username}`}
            onCancel={closeModals}
            onConfirm={() => { const f = document.querySelector('form[data-edit-member]') as HTMLFormElement; f?.dispatchEvent(new Event('submit', { bubbles: true })); }}
            cancelText="Cancel"
            confirmText="Update Role"
          >
            <form onSubmit={handleUpdateMemberRole} data-edit-member className="space-y-4">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </form>
          </Modal>

          {/* Edit Project Modal */}
          <Modal
            isOpen={showEditModal}
            title="Edit Project"
            onCancel={() => setShowEditModal(false)}
            onConfirm={() => { const f = document.querySelector('form[data-edit-project-detail]') as HTMLFormElement; f?.dispatchEvent(new Event('submit', { bubbles: true })); }}
            cancelText="Cancel"
            confirmText={editing ? 'Updating…' : 'Update Project'}
            loading={editing}
          >
            <form onSubmit={handleUpdateProject} data-edit-project-detail className="space-y-4">
              <div className="space-y-1.5">
                <Label>Project Name</Label>
                <Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>KV Storage Limit (GB)</Label>
                <Input type="number" min="1" value={editForm.kvStorageLimit} onChange={(e) => setEditForm({ ...editForm, kvStorageLimit: Number(e.target.value) })} />
              </div>
            </form>
          </Modal>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
