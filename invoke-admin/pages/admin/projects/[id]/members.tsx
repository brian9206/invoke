import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ArrowLeft, UserPlus, Crown, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { authenticatedFetch } from '@/lib/frontend-utils';

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

interface Project {
  id: string;
  name: string;
  description: string;
}

export default function ProjectMembersPage() {
  const router = useRouter();
  const { id: projectId } = router.query;
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('viewer');

  useEffect(() => {
    if (projectId) {
      loadProjectData();
      loadMembers();
      loadAvailableUsers();
    }
  }, [projectId]);

  const loadProjectData = async () => {
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

  const loadMembers = async () => {
    try {
      const response = await authenticatedFetch(`/api/admin/project-members?projectId=${projectId}`);

      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
      }
    } catch (error) {
      console.error('Error loading members:', error);
    } finally {
      setLoading(false);
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
      alert('Please select a user');
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
        setShowAddModal(false);
        setSelectedUserId('');
        setSelectedRole('viewer');
        loadMembers();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to add member');
      }
    } catch (error) {
      console.error('Error adding member:', error);
      alert('Error adding member');
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
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
        setSelectedRole('viewer');
        loadMembers();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update role');
      }
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Error updating role');
    }
  };

  const handleRemoveMember = async (member: Member) => {
    if (!confirm(`Are you sure you want to remove ${member.username} from this project?`)) {
      return;
    }

    try {
      const response = await authenticatedFetch('/api/admin/project-members', {
        method: 'DELETE',
        body: JSON.stringify({ membershipId: member.id }),
      });

      if (response.ok) {
        loadMembers();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Error removing member');
    }
  };

  const openEditModal = (member: Member) => {
    setEditingMember(member);
    setSelectedRole(member.role);
  };

  const closeModals = () => {
    setShowAddModal(false);
    setEditingMember(null);
    setSelectedUserId('');
    setSelectedRole('viewer');
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

  // Filter out users who are already members
  const nonMemberUsers = availableUsers.filter(
    user => !members.some(member => member.user_id === user.id)
  );

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Project Members">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500"></div>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  if (!project) {
    return (
      <ProtectedRoute>
        <Layout title="Project Not Found">
          <div className="card text-center py-12">
            <p className="text-red-400 text-lg mb-4">Project not found.</p>
            <Link href="/admin/projects" className="btn-primary">
              Back to Projects
            </Link>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout>
        <div className="max-w-6xl mx-auto p-6">
          <div className="flex items-center mb-6">
            <Link
              href="/admin/projects"
              className="mr-4 p-2 hover:bg-gray-700 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-100">Project Members</h1>
              <p className="text-gray-400 mt-1">
                Manage members for "{project.name}"
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add Member
            </button>
          </div>

          {members.length === 0 ? (
            <div className="card text-center py-12">
              <UserPlus className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-100 mb-2">No members yet</h3>
              <p className="text-gray-400 mb-6">Add users to this project to get started</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-primary"
              >
                Add First Member
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {members.map((member) => (
                <div key={member.id} className="card">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center">
                        <h3 className="text-lg font-medium text-gray-100">
                          {member.username}
                        </h3>
                        <div className="ml-3 flex items-center">
                          {getRoleIcon(member.role)}
                          <span className={`ml-1 px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(member.role)}`}>
                            {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-gray-400">{member.email}</p>
                      <div className="mt-2 flex items-center text-sm text-gray-400">
                        <span>
                          Added {new Date(member.created_at).toLocaleDateString()}
                          {member.added_by && ` by ${member.added_by}`}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4 flex items-center space-x-2">
                      <button
                        onClick={() => openEditModal(member)}
                        className="p-2 rounded-lg bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 transition-colors"
                        title="Change Role"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveMember(member)}
                        className="p-2 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors"
                        title="Remove Member"
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

        {/* Add Member Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4">
              <div className="mt-0">
                <h3 className="text-lg font-medium text-gray-100 mb-4">Add Member</h3>
                <form onSubmit={handleAddMember}>
                  <div className="mb-4">
                    <label className="form-label">
                      Select User
                    </label>
                    <select
                      required
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="form-input"
                    >
                      <option value="">Choose a user...</option>
                      {nonMemberUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.username} ({user.email})
                          {user.is_admin && ' - Admin'}
                        </option>
                      ))}
                    </select>
                    {nonMemberUsers.length === 0 && (
                      <p className="text-sm text-gray-400 mt-1">All users are already members</p>
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
                      <option value="viewer">Viewer (read-only)</option>
                      <option value="owner">Owner (full access)</option>
                    </select>
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={closeModals}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!selectedUserId || nonMemberUsers.length === 0}
                      className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add Member
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Edit Role Modal */}
        {editingMember && (
          <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4">
              <div className="mt-0">
                <h3 className="text-lg font-medium text-gray-100 mb-4">
                  Change Role for {editingMember.username}
                </h3>
                <form onSubmit={handleUpdateRole}>
                  <div className="mb-4">
                    <label className="form-label">
                      Role
                    </label>
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="form-input"
                    >
                      <option value="viewer">Viewer (read-only)</option>
                      <option value="owner">Owner (full access)</option>
                    </select>
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={closeModals}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                    >
                      Update Role
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}