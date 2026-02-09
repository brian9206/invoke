import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import Modal from '@/components/Modal';
import { ArrowLeft, Users, Package, Settings, Calendar, Eye, Edit, Trash2, UserPlus, Crown } from 'lucide-react';
import Link from 'next/link';
import { authenticatedFetch } from '@/lib/frontend-utils';
import { toast } from 'react-hot-toast';

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
  recentMembers: Array<{
    username: string;
    role: string;
    created_at: string;
  }>;
  recentFunctions: Array<{
    id: string;
    name: string;
    created_at: string;
    is_active: boolean;
  }>;
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
  
  // Members management state
  const [members, setMembers] = useState<Member[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('developer');

  useEffect(() => {
    if (projectId) {
      loadProject();
      loadProjectStats();
      loadMembers();
      loadAvailableUsers();
    }
  }, [projectId]);

  const loadProject = async () => {
    try {
      const response = await authenticatedFetch('/api/admin/projects');

      if (response.ok) {
        const data = await response.json();
        const currentProject = data.projects.find((p: Project) => p.id === projectId);
        setProject(currentProject || null);
      }
    } catch (error) {
      console.error('Error loading project:', error);
    }
  };

  const loadProjectStats = async () => {
    try {
      // Load members
      const membersResponse = await authenticatedFetch(`/api/admin/project-members?projectId=${projectId}`);
      
      // Load functions  
      const functionsResponse = await authenticatedFetch(`/api/functions?projectId=${projectId}`);

      if (membersResponse.ok && functionsResponse.ok) {
        const membersData = await membersResponse.json();
        const functionsData = await functionsResponse.json();

        const members = membersData.members || [];
        const functions = functionsData.success ? functionsData.data : [];

        setStats({
          memberCount: members.length,
          functionCount: functions.length,
          recentMembers: members.slice(-3).reverse(),
          recentFunctions: functions.slice(-3).reverse(),
        });
      }
    } catch (error) {
      console.error('Error loading project stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = () => {
    if (project) {
      setEditForm({
        name: project.name,
        description: project.description || '',
        kvStorageLimit: project.kv_storage_limit_bytes / (1024 * 1024 * 1024)
      });
      setShowEditModal(true);
    }
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    setEditing(true);
    try {
      const response = await authenticatedFetch('/api/admin/projects', {
        method: 'PUT',
        body: JSON.stringify({
          id: project.id,
          name: editForm.name,
          description: editForm.description,
          is_active: project.is_active,
          kv_storage_limit_bytes: editForm.kvStorageLimit * 1024 * 1024 * 1024,
        }),
      });

      if (response.ok) {
        toast.success('Project updated successfully');
        setShowEditModal(false);
        loadProject();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to update project');
      }
    } catch (error) {
      console.error('Error updating project:', error);
      toast.error('Error updating project');
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    setDialogState({
      type: 'confirm',
      title: 'Delete Project',
      message: `Are you sure you want to delete the project "${project.name}"?`,
      onConfirm: async () => {
        try {
          const response = await authenticatedFetch('/api/admin/projects', {
            method: 'DELETE',
            body: JSON.stringify({ id: project.id }),
          });

          if (response.ok) {
            toast.success('Project deleted');
            router.push('/admin/projects');
            setDialogState({ type: null, title: '', message: '' });
          } else {
            const data = await response.json();
            toast.error(data.error || 'Failed to delete project');
          }
        } catch (error) {
          console.error('Error deleting project:', error);
          toast.error('Error deleting project');
        }
      }
    });
  };

  // Members management functions
  const loadMembers = async () => {
    try {
      const response = await authenticatedFetch(`/api/admin/project-members?projectId=${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
      }
    } catch (error) {
      console.error('Error loading members:', error);
    }
  };

  const loadAvailableUsers = async () => {
    try {
      const response = await authenticatedFetch('/api/admin/users');
      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setDialogState({ type: 'alert', title: 'Error', message: 'Please select a user' });
      return;
    }

    try {
      const response = await authenticatedFetch('/api/admin/project-members', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          userId: parseInt(selectedUserId),
          role: selectedRole,
        }),
      });

      if (response.ok) {
        setShowAddMemberModal(false);
        setSelectedUserId('');
        setSelectedRole('developer');
        loadMembers();
        toast.success('Member added');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to add member');
      }
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error('Error adding member');
    }
  };

  const handleUpdateMemberRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    try {
      const response = await authenticatedFetch('/api/admin/project-members', {
        method: 'PUT',
        body: JSON.stringify({
          membershipId: editingMember.id,
          role: selectedRole,
        }),
      });

      if (response.ok) {
        setEditingMember(null);
        setSelectedRole('developer');
        loadMembers();
        toast.success('Role updated');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to update role');
      }
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Error updating role');
    }
  };

  const handleRemoveMember = async (member: Member) => {
    setDialogState({
      type: 'confirm',
      title: 'Remove Member',
      message: `Are you sure you want to remove ${member.username} from this project?`,
      onConfirm: async () => {
        try {
          const response = await authenticatedFetch('/api/admin/project-members', {
            method: 'DELETE',
            body: JSON.stringify({ membershipId: member.id }),
          });

          if (response.ok) {
            loadMembers();
            toast.success('Member removed');
            setDialogState({ type: null, title: '', message: '' });
          } else {
            const data = await response.json();
            toast.error(data.error || 'Failed to remove member');
          }
        } catch (error) {
          console.error('Error removing member:', error);
          toast.error('Error removing member');
        }
      }
    });
  };

  const openEditMemberModal = (member: Member) => {
    setEditingMember(member);
    setSelectedRole(member.role);
  };

  const closeModals = () => {
    setShowAddMemberModal(false);
    setEditingMember(null);
    setSelectedUserId('');
    setSelectedRole('developer');
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-4 h-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-yellow-900/30 text-yellow-400 border border-yellow-800';
      default:
        return 'bg-gray-700 text-gray-300 border border-gray-600';
    }
  };

  const nonMemberUsers = availableUsers.filter(
    user => !members.some(member => member.user_id === user.id)
  );

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Loading project...</div>
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-red-500 text-lg">Project not found.</p>
          <Link href="/admin/projects" className="text-blue-600 hover:underline mt-4 inline-block">
            Back to Projects
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
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
            confirmText={dialogState.type === 'alert' ? undefined : 'Remove'}
            confirmVariant={dialogState.type === 'confirm' ? 'danger' : 'default'}
          />

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/admin/projects"
              className="mr-4 p-2 hover:bg-gray-700 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <PageHeader
                title={project.name}
                subtitle={`Created by ${project.created_by} on ${new Date(project.created_at).toLocaleDateString()}`}
              >
                <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                  project.is_active 
                    ? 'bg-green-900/30 text-green-400 border border-green-800' 
                    : 'bg-red-900/30 text-red-400 border border-red-800'
                }`}>
                  {project.is_active ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={openEditModal}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md flex items-center"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </button>
                <button
                  onClick={handleDeleteProject}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </button>
              </PageHeader>
            </div>
          </div>
          {project.description && (
            <p className="text-gray-600">{project.description}</p>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm font-medium">Total Members</p>
                  <p className="text-2xl font-bold text-white mt-1">{stats?.memberCount || 0}</p>
                </div>
                <div className="bg-blue-500/10 p-3 rounded-xl">
                  <Users className="w-6 h-6 text-blue-400" />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm font-medium">Total Functions</p>
                  <p className="text-2xl font-bold text-white mt-1">{stats?.functionCount || 0}</p>
                </div>
                <div className="bg-green-500/10 p-3 rounded-xl">
                  <Package className="w-6 h-6 text-green-400" />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm font-medium">Created</p>
                  <p className="text-lg font-bold text-white mt-1">{new Date(project.created_at).toLocaleDateString()}</p>
                </div>
                <div className="bg-purple-500/10 p-3 rounded-xl">
                  <Calendar className="w-6 h-6 text-purple-400" />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm font-medium">Status</p>
                  <p className="text-lg font-bold text-white mt-1">{project.is_active ? 'Active' : 'Inactive'}</p>
                </div>
                <div className={`p-3 rounded-xl ${project.is_active ? 'bg-green-500/10' : 'bg-gray-500/10'}`}>
                  <Eye className={`w-6 h-6 ${project.is_active ? 'text-green-400' : 'text-gray-400'}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Members */}
            <div className="card lg:col-span-2">
              <div className="px-4 py-3 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-100">Members</h3>
                  <button
                    onClick={() => setShowAddMemberModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-sm flex items-center"
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Add Member
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {members && members.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left py-3 px-4 text-gray-300">Name</th>
                            <th className="text-left py-3 px-4 text-gray-300">Email</th>
                            <th className="text-left py-3 px-4 text-gray-300">Role</th>
                            <th className="text-left py-3 px-4 text-gray-300">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {members.map((member) => (
                            <tr key={member.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                              <td className="py-3 px-4 text-gray-100 font-medium">{member.username}</td>
                              <td className="py-3 px-4 text-gray-400">{member.email}</td>
                              <td className="py-3 px-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(member.role)}`}>
                                  {getRoleIcon(member.role)}
                                  <span className="ml-1">{member.role.charAt(0).toUpperCase() + member.role.slice(1)}</span>
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => openEditMemberModal(member)}
                                    className="text-blue-400 hover:text-blue-300 text-sm"
                                  >
                                    Edit
                                  </button>
                                  <span className="text-gray-600">|</span>
                                  <button
                                    onClick={() => handleRemoveMember(member)}
                                    className="text-red-400 hover:text-red-300 text-sm"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <Users className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-gray-500 text-sm">No members yet</p>
                    <button
                      onClick={() => setShowAddMemberModal(true)}
                      className="text-blue-400 hover:text-blue-300 text-sm mt-2"
                    >
                      Add the first member
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Functions */}
            <div className="card">
              <div className="px-4 py-3 border-b border-gray-700">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-100">Recent Functions</h3>
                  <Link
                    href={`/admin/functions?projectId=${project.id}`}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    View All
                  </Link>
                </div>
              </div>
              <div className="space-y-2">
                {stats?.recentFunctions && stats.recentFunctions.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left py-3 px-4 text-gray-300">Name</th>
                            <th className="text-left py-3 px-4 text-gray-300">Created</th>
                            <th className="text-left py-3 px-4 text-gray-300">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.recentFunctions.map((func) => (
                            <tr key={func.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                              <td className="py-3 px-4 text-gray-100 font-medium">{func.name}</td>
                              <td className="py-3 px-4 text-gray-400 text-xs">{new Date(func.created_at).toLocaleDateString()}</td>
                              <td className="py-3 px-4">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  func.is_active 
                                    ? 'bg-green-900/30 text-green-400 border border-green-800' 
                                    : 'bg-red-900/30 text-red-400 border border-red-800'
                                }`}>
                                  {func.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-center pb-2 pt-6">
                    <Package className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-gray-500 text-sm">No functions yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Add Member Modal */}
          {showAddMemberModal && (
            <Modal
              isOpen={showAddMemberModal}
              title="Add Member"
              onCancel={closeModals}
              onConfirm={() => {
                const form = document.querySelector('form[data-add-member]') as HTMLFormElement;
                form?.dispatchEvent(new Event('submit', { bubbles: true }));
              }}
              cancelText="Cancel"
              confirmText="Add Member"
            >
              <form onSubmit={handleAddMember} data-add-member>
                <div className="mb-4">
                  <label className="form-label">
                    User
                  </label>
                  <select
                    required
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select a user...</option>
                    {nonMemberUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.username} ({user.email})
                      </option>
                    ))}
                  </select>
                  {nonMemberUsers.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">All users are already members</p>
                  )}
                </div>
                <div className="mb-4">
                  <label className="form-label">
                    Role
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="form-input"
                  >
                    <option value="developer">Developer</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
              </form>
            </Modal>
          )}

          {/* Edit Member Role Modal */}
          {editingMember && (
            <Modal
              isOpen={!!editingMember}
              title={`Change Role for ${editingMember.username}`}
              onCancel={closeModals}
              onConfirm={() => {
                const form = document.querySelector('form[data-edit-member]') as HTMLFormElement;
                form?.dispatchEvent(new Event('submit', { bubbles: true }));
              }}
              cancelText="Cancel"
              confirmText="Update Role"
            >
              <form onSubmit={handleUpdateMemberRole} data-edit-member>
                <div className="mb-4">
                  <label className="form-label">
                    Role
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="form-input"
                  >
                    <option value="developer">Developer</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
              </form>
            </Modal>
          )}

          {/* Edit Project Modal */}
          {showEditModal && (
            <Modal
              isOpen={showEditModal}
              title="Edit Project"
              onCancel={() => setShowEditModal(false)}
              onConfirm={() => {
                const form = document.querySelector('form[data-edit-project-detail]') as HTMLFormElement;
                form?.dispatchEvent(new Event('submit', { bubbles: true }));
              }}
              cancelText="Cancel"
              confirmText={editing ? 'Updating...' : 'Update Project'}
              loading={editing}
            >
              <form onSubmit={handleUpdateProject} data-edit-project-detail>
                <div className="mb-4">
                  <label className="form-label">
                    Project Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    className="form-input"
                  />
                </div>
                <div className="mb-4">
                  <label className="form-label">
                    Description
                  </label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                    className="form-textarea"
                    rows={3}
                  />
                </div>
                <div className="mb-4">
                  <label className="form-label">
                    KV Storage Limit (GB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editForm.kvStorageLimit}
                    onChange={(e) => setEditForm({...editForm, kvStorageLimit: Number(e.target.value)})}
                    className="form-input"
                  />
                </div>
              </form>
            </Modal>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}