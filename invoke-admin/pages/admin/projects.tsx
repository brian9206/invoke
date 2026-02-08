import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { authenticatedFetch } from '@/lib/frontend-utils';
import { useProject } from '@/contexts/ProjectContext';

interface Project {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  kv_storage_limit_bytes: number;
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
  const [formData, setFormData] = useState({ name: '', description: '', kvStorageLimit: 1 });
  const router = useRouter();
  const { refreshProjects, lockProject, unlockProject, userProjects } = useProject();
  const hasLockedProject = useRef(false);

  useEffect(() => {
    loadProjects();
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
        await refreshProjects();
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
          kv_storage_limit_bytes: formData.kvStorageLimit * 1024 * 1024 * 1024,
        }),
      });

      if (response.ok) {
        setEditingProject(null);
        setFormData({ name: '', description: '' });
        await refreshProjects();
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
        await refreshProjects();
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
    setFormData({ 
      name: project.name, 
      description: project.description || '',
      kvStorageLimit: project.kv_storage_limit_bytes / (1024 * 1024 * 1024)
    });
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setEditingProject(null);
    setFormData({ name: '', description: '', kvStorageLimit: 1 });
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
                <button
                  key={project.id}
                  onClick={() => router.push(`/admin/projects/${project.id}`)}
                  className="card hover:bg-gray-800/50 transition-colors text-left"
                >
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
                  </div>
                </button>
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
                  <div className="mb-4">
                    <label className="form-label">
                      KV Storage Limit (GB)
                    </label>
                    <input
                      type="number"
                      min="0.001"
                      step="0.1"
                      required
                      value={formData.kvStorageLimit}
                      onChange={(e) => setFormData({...formData, kvStorageLimit: parseFloat(e.target.value) || 0})}
                      className="form-input"
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