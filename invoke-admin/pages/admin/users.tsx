import { useState, useEffect, useRef } from 'react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import { Edit, Trash2, Users, UserCircle, Loader, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import ProtectedRoute from '@/components/ProtectedRoute';
import { authenticatedFetch } from '@/lib/frontend-utils';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  last_login: string;
  project_count: number;
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  function formatLastSeen(lastLogin: string | null): { label: string; isRecent: boolean } {
    if (!lastLogin) return { label: 'Never', isRecent: false };
    const diff = Date.now() - new Date(lastLogin).getTime();
    if (diff < 15 * 60 * 1000) return { label: 'Recent', isRecent: true };
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return { label: `${mins}m ago`, isRecent: false };
    const hours = Math.floor(mins / 60);
    if (hours < 24) return { label: `${hours}h ago`, isRecent: false };
    const days = Math.floor(hours / 24);
    if (days < 30) return { label: `${days}d ago`, isRecent: false };
    return { label: new Date(lastLogin).toLocaleDateString(), isRecent: false };
  }
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordScore, setPasswordScore] = useState(0);
  const [formData, setFormData] = useState({ username: '', email: '', password: '', is_admin: false });
  const [dialogState, setDialogState] = useState<{
    type: 'alert' | 'confirm' | null;
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({ type: null, title: '', message: '' });
  const { lockProject, unlockProject, userProjects } = useProject();
  const hasLockedProject = useRef(false);

  useEffect(() => { loadUsers(); }, []);

  useEffect(() => {
    const systemProject = userProjects.find((p) => p.id === 'system');
    if (systemProject && !hasLockedProject.current) {
      hasLockedProject.current = true;
      lockProject(systemProject);
    }
    return () => {
      if (hasLockedProject.current) {
        hasLockedProject.current = false;
        unlockProject();
      }
    };
  }, [userProjects]);

  const loadUsers = async () => {
    try {
      const response = await authenticatedFetch('/api/admin/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordScore < 3) {
      setDialogState({ type: 'alert', title: 'Weak Password', message: 'Password is not strong enough. Please use a stronger password with a score of at least 3.' });
      return;
    }
    try {
      const response = await authenticatedFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(formData) });
      if (response.ok) {
        setShowCreateModal(false);
        setFormData({ username: '', email: '', password: '', is_admin: false });
        loadUsers();
      } else {
        const data = await response.json();
        setDialogState({ type: 'alert', title: 'Error', message: data.error || 'Failed to create user' });
      }
    } catch {
      setDialogState({ type: 'alert', title: 'Error', message: 'Error creating user' });
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (formData.password && passwordScore < 3) {
      setDialogState({ type: 'alert', title: 'Weak Password', message: 'Password is not strong enough.' });
      return;
    }
    const updateData: any = { id: editingUser.id, username: formData.username, email: formData.email, is_admin: formData.is_admin };
    if (formData.password) updateData.password = formData.password;
    try {
      const response = await authenticatedFetch('/api/admin/users', { method: 'PUT', body: JSON.stringify(updateData) });
      if (response.ok) {
        setEditingUser(null);
        setFormData({ username: '', email: '', password: '', is_admin: false });
        loadUsers();
      } else {
        const data = await response.json();
        setDialogState({ type: 'alert', title: 'Error', message: data.error || 'Failed to update user' });
      }
    } catch {
      setDialogState({ type: 'alert', title: 'Error', message: 'Error updating user' });
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (currentUser && user.id === currentUser.id) {
      setDialogState({ type: 'alert', title: 'Cannot Delete', message: 'You cannot delete your own account. Please use another admin account to delete this user.' });
      return;
    }
    setDialogState({
      type: 'confirm',
      title: 'Delete User',
      message: `Are you sure you want to delete the user "${user.username}"?`,
      onConfirm: async () => {
        try {
          const response = await authenticatedFetch('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ id: user.id }) });
          if (response.ok) {
            loadUsers();
            setDialogState({ type: null, title: '', message: '' });
          } else {
            const data = await response.json();
            setDialogState({ type: 'alert', title: 'Error', message: data.error || 'Failed to delete user' });
          }
        } catch {
          setDialogState({ type: 'alert', title: 'Error', message: 'Error deleting user' });
        }
      },
    });
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({ username: user.username, email: user.email, password: '', is_admin: user.is_admin });
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setEditingUser(null);
    setFormData({ username: '', email: '', password: '', is_admin: false });
    setPasswordScore(0);
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Users">
          <div className="flex items-center justify-center h-64">
            <Loader className="w-8 h-8 text-primary animate-spin" />
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout title="Users">
        <div className="space-y-6">
          <PageHeader
            title="User Management"
            subtitle="Manage system users and their permissions"
            icon={<Users className="w-8 h-8 text-primary" />}
          >
            <Button onClick={() => setShowCreateModal(true)}>Create User</Button>
          </PageHeader>

          {users.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">No users found.</CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {users.map((user) => (
                <Card key={user.id} className="hover:bg-card/80 transition-colors">
                  <CardContent className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-1.5 rounded shrink-0 ${
                          user.is_admin
                            ? 'bg-purple-900/30 text-purple-400'
                            : 'bg-green-900/30 text-green-400'
                        }`}
                      >
                        <UserCircle className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className="text-sm font-semibold text-foreground truncate">{user.username}</span>
                          {user.is_admin && <Badge variant="purple" className="text-xs px-1.5 py-0">Admin</Badge>}
                        </div>
                        <p className="text-muted-foreground text-xs mt-0.5 truncate">{user.email}</p>
                        {(() => {
                          const { label, isRecent } = formatLastSeen(user.last_login);
                          return (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                              {isRecent ? (
                                <Badge variant="default" className="text-xs px-1.5 py-0 bg-green-900/30 text-green-400 border-green-800/50">Recent</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">{label}</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-blue-400 hover:bg-blue-900/20"
                              onClick={() => openEditModal(user)}
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit User</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-400 hover:bg-red-900/20 disabled:opacity-50"
                              onClick={() => handleDeleteUser(user)}
                              disabled={!!currentUser && user.id === currentUser.id}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete User</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Modal
          isOpen={dialogState.type !== null}
          title={dialogState.title}
          description={dialogState.message}
          onCancel={() => setDialogState({ type: null, title: '', message: '' })}
          onConfirm={async () => {
            if (dialogState.onConfirm) await dialogState.onConfirm();
            else setDialogState({ type: null, title: '', message: '' });
          }}
          cancelText={dialogState.type === 'alert' ? 'OK' : 'Cancel'}
          confirmText={dialogState.type === 'alert' ? undefined : 'Delete'}
          confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
        />

        {showCreateModal && (
          <Modal
            isOpen={showCreateModal}
            title="Create New User"
            onCancel={closeModals}
            onConfirm={() => {
              const form = document.querySelector('form[data-create-user]') as HTMLFormElement;
              form?.dispatchEvent(new Event('submit', { bubbles: true }));
            }}
            cancelText="Cancel"
            confirmText="Create User"
            confirmDisabled={passwordScore < 3}
          >
            <form onSubmit={handleCreateUser} data-create-user className="space-y-4">
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input required value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="Enter username" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="Enter email address" />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" required value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Enter password" />
                <PasswordStrengthMeter password={formData.password} onScoreChange={setPasswordScore} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="createIsAdmin"
                  checked={formData.is_admin}
                  onCheckedChange={(v) => setFormData({ ...formData, is_admin: v === true })}
                />
                <Label htmlFor="createIsAdmin" className="cursor-pointer">Admin User</Label>
              </div>
            </form>
          </Modal>
        )}

        {editingUser && (
          <Modal
            isOpen={!!editingUser}
            title="Edit User"
            onCancel={closeModals}
            onConfirm={() => {
              const form = document.querySelector('form[data-edit-user]') as HTMLFormElement;
              form?.dispatchEvent(new Event('submit', { bubbles: true }));
            }}
            cancelText="Cancel"
            confirmText="Update User"
            confirmDisabled={formData.password !== '' && passwordScore < 3}
          >
            <form onSubmit={handleUpdateUser} data-edit-user className="space-y-4">
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input required value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>New Password (leave blank to keep current)</Label>
                {currentUser && editingUser && currentUser.id === editingUser.id ? (
                  <div className="bg-muted border border-border rounded-lg p-3">
                    <p className="text-sm text-muted-foreground">
                      You cannot change your own password here. Please use the Profile Settings page.
                    </p>
                  </div>
                ) : (
                  <>
                    <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                    <PasswordStrengthMeter password={formData.password} onScoreChange={setPasswordScore} />
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="editIsAdmin"
                  checked={formData.is_admin}
                  onCheckedChange={(v) => setFormData({ ...formData, is_admin: v === true })}
                  disabled={!!currentUser && !!editingUser && currentUser.id === editingUser.id}
                />
                <Label htmlFor="editIsAdmin" className={currentUser && editingUser && currentUser.id === editingUser.id ? 'opacity-50' : 'cursor-pointer'}>
                  Admin User
                </Label>
              </div>
              {currentUser && editingUser && currentUser.id === editingUser.id && (
                <p className="text-xs text-muted-foreground">You cannot modify your own admin status</p>
              )}
            </form>
          </Modal>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
