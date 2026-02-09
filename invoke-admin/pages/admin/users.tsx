import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import { Edit, Trash2, Users } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { authenticatedFetch } from '@/lib/frontend-utils';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';

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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    is_admin: false
  });
  const [dialogState, setDialogState] = useState<{ type: 'alert' | 'confirm' | null; title: string; message: string; onConfirm?: () => void }>({ type: null, title: '', message: '' });
  const router = useRouter();
  const { lockProject, unlockProject, userProjects } = useProject();
  const hasLockedProject = useRef(false);

  useEffect(() => {
    loadUsers();
  }, []);

  // Lock project to System when on this page
  useEffect(() => {
    const systemProject = userProjects.find(p => p.id === 'system');
    
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
      } else {
        console.error('Failed to load users');
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await authenticatedFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setShowCreateModal(false);
        setFormData({ username: '', email: '', password: '', is_admin: false });
        loadUsers();
      } else {
        const data = await response.json();
        setDialogState({ type: 'alert', title: 'Error', message: data.error || 'Failed to create user' });
      }
    } catch (error) {
      console.error('Error creating user:', error);
      setDialogState({ type: 'alert', title: 'Error', message: 'Error creating user' });
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const updateData: any = {
      id: editingUser.id,
      username: formData.username,
      email: formData.email,
      is_admin: formData.is_admin,
    };

    if (formData.password) {
      updateData.password = formData.password;
    }

    try {
      const response = await authenticatedFetch('/api/admin/users', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        setEditingUser(null);
        setFormData({ username: '', email: '', password: '', is_admin: false });
        loadUsers();
      } else {
        const data = await response.json();
        setDialogState({ type: 'alert', title: 'Error', message: data.error || 'Failed to update user' });
      }
    } catch (error) {
      console.error('Error updating user:', error);
      setDialogState({ type: 'alert', title: 'Error', message: 'Error updating user' });
    }
  };

  const handleDeleteUser = async (user: User) => {
    // Prevent deleting current user
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
          const response = await authenticatedFetch('/api/admin/users', {
            method: 'DELETE',
            body: JSON.stringify({ id: user.id }),
          });

          if (response.ok) {
            loadUsers();
            setDialogState({ type: null, title: '', message: '' });
          } else {
            const data = await response.json();
            setDialogState({ type: 'alert', title: 'Error', message: data.error || 'Failed to delete user' });
          }
        } catch (error) {
          console.error('Error deleting user:', error);
          setDialogState({ type: 'alert', title: 'Error', message: 'Error deleting user' });
        }
      }
    });
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      is_admin: user.is_admin
    });
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setEditingUser(null);
    setFormData({ username: '', email: '', password: '', is_admin: false });
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Users">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500"></div>
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
            icon={<Users className="w-8 h-8 text-primary-500" />}
          >
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              Create User
            </button>
          </PageHeader>

          {users.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-gray-500 text-lg">No users found.</div>
            </div>
          ) : (
            <div className="grid gap-6">
              {users.map((user) => (
                <div key={user.id} className="card hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-gray-100">
                          {user.username}
                        </h3>
                        {user.is_admin && (
                          <span className="px-2 py-1 text-xs rounded bg-purple-900/30 text-purple-400 border border-purple-800">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 mt-1">{user.email}</p>
                      <div className="flex items-center space-x-6 mt-3 text-sm text-gray-400">
                        <span>Projects: {user.project_count}</span>
                        <span>Created: {new Date(user.created_at).toLocaleDateString()}</span>
                        {user.last_login && (
                          <span>Last login: {new Date(user.last_login).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 rounded-lg bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 transition-colors"
                        title="Edit User"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        disabled={currentUser && user.id === currentUser.id}
                        className="p-2 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={currentUser && user.id === currentUser.id ? "Cannot delete yourself" : "Delete User"}
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

        {/* Dialog Modal */}
        <Modal
          isOpen={dialogState.type !== null}
          title={dialogState.title}
          description={dialogState.message}
          onCancel={() => setDialogState({ type: null, title: '', message: '' })}
          onConfirm={async () => {
            if (dialogState.onConfirm) {
              await dialogState.onConfirm();
            } else {
              setDialogState({ type: null, title: '', message: '' });
            }
          }}
          cancelText={dialogState.type === 'alert' ? 'OK' : 'Cancel'}
          confirmText={dialogState.type === 'alert' ? undefined : 'Delete'}
          confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
        />

        {/* Create User Modal */}
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
          >
            <form onSubmit={handleCreateUser} data-create-user className="space-y-4">
              <div>
                <label className="form-label">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  className="form-input"
                  placeholder="Enter username"
                />
              </div>
              <div>
                <label className="form-label">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="form-input"
                  placeholder="Enter email address"
                />
              </div>
              <div>
                <label className="form-label">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="form-input"
                  placeholder="Enter password"
                />
              </div>
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.is_admin}
                    onChange={(e) => setFormData({...formData, is_admin: e.target.checked})}
                    className="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-300">Admin User</span>
                </label>
              </div>
            </form>
          </Modal>
        )}

        {/* Edit User Modal */}
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
          >
            <form onSubmit={handleUpdateUser} data-edit-user>
              <div className="mb-4">
                <label className="form-label">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  className="form-input"
                />
              </div>
              <div className="mb-4">
                <label className="form-label">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="form-input"
                />
              </div>
              <div className="mb-4">
                <label className="form-label">
                  New Password (leave blank to keep current)
                </label>
                {currentUser && editingUser && currentUser.id === editingUser.id ? (
                  <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                    <p className="text-sm text-gray-400">
                      ℹ️ You cannot change your own password here. Please use the Profile Settings page.
                    </p>
                  </div>
                ) : (
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="form-input"
                  />
                )}
              </div>
              <div className="mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_admin}
                    onChange={(e) => setFormData({...formData, is_admin: e.target.checked})}
                    disabled={currentUser && editingUser && currentUser.id === editingUser.id}
                    className="mr-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-sm font-medium text-gray-200">Admin User</span>
                </label>
                {currentUser && editingUser && currentUser.id === editingUser.id && (
                  <p className="text-xs text-gray-400 mt-1">
                    ℹ️ You cannot modify your own admin status
                  </p>
                )}
              </div>
            </form>
          </Modal>
        )}
      </Layout>
    </ProtectedRoute>
  );
}