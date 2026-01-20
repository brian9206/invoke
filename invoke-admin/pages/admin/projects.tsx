import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Users, Edit, Trash2 } from 'lucide-react';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { authenticatedFetch } from '@/lib/frontend-utils';

interface Project {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
  member_count: number;
  function_count: number;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const router = useRouter();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await authenticatedFetch('/api/admin/projects');

      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      } else {
        console.error('Failed to load projects');
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await authenticatedFetch('/api/admin/projects', {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setShowCreateModal(false);
        setFormData({ name: '', description: '' });
        loadProjects();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to create project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Error creating project');
    }
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    try {
      const response = await authenticatedFetch('/api/admin/projects', {
        method: 'PUT',
        body: JSON.stringify({
          id: editingProject.id,
          name: formData.name,
          description: formData.description,
          is_active: editingProject.is_active,
        }),
      });

      if (response.ok) {
        setEditingProject(null);
        setFormData({ name: '', description: '' });
        loadProjects();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update project');
      }
    } catch (error) {
      console.error('Error updating project:', error);
      alert('Error updating project');
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!confirm(`Are you sure you want to delete the project "${project.name}"?`)) {
      return;
    }

    try {
      const response = await authenticatedFetch('/api/admin/projects', {
        method: 'DELETE',
        body: JSON.stringify({ id: project.id }),
      });

      if (response.ok) {
        loadProjects();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Error deleting project');
    }
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setFormData({ name: project.name, description: project.description || '' });
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setEditingProject(null);
    setFormData({ name: '', description: '' });
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Projects">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500"></div>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout title="Projects">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-100">Projects</h1>
              <p className="text-gray-400 mt-2">Manage projects and assign users</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              Create Project
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-gray-500 text-lg">No projects found.</div>
            </div>
          ) : (
            <div className="grid gap-6">
              {projects.map((project) => (
                <div key={project.id} className="card hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-gray-100">
                          {project.name}
                        </h3>
                        <span className={`px-2 py-1 text-xs rounded ${
                          project.is_active 
                            ? 'bg-green-900/30 text-green-400 border border-green-800'
                            : 'bg-gray-700 text-gray-400'
                        }`}>
                          {project.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      {project.description && (
                        <p className="text-gray-400 mt-1">{project.description}</p>
                      )}
                      <div className="flex items-center space-x-6 mt-3 text-sm text-gray-400">
                        <span>Members: {project.member_count}</span>
                        <span>Functions: {project.function_count}</span>
                        <span>Created: {new Date(project.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                      <div className="ml-4 flex items-center space-x-2">
                        <button
                          onClick={() => router.push(`/admin/projects/${project.id}/members`)}
                          className="p-2 rounded-lg bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 transition-colors"
                          title="Members"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(project)}
                          className="p-2 rounded-lg bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProject(project)}
                          className="p-2 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        {/* Create Project Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4">
              <div className="mt-0">
                <h3 className="text-lg font-medium text-gray-100 mb-4">Create New Project</h3>
                <form onSubmit={handleCreateProject}>
                  <div className="mb-4">
                    <label className="form-label">
                      Project Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="form-input"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="form-label">
                      Description (optional)
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="form-textarea"
                      rows={3}
                    />
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
                      Create Project
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Edit Project Modal */}
        {editingProject && (
          <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4">
              <div className="mt-0">
                <h3 className="text-lg font-medium text-gray-100 mb-4">Edit Project</h3>
                <form onSubmit={handleUpdateProject}>
                  <div className="mb-4">
                    <label className="form-label">
                      Project Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="form-input"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="form-label">
                      Description (optional)
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="form-textarea"
                      rows={3}
                    />
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
                      Update Project
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}