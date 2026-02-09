import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import PageHeader from '@/components/PageHeader';
import { authenticatedFetch } from '@/lib/frontend-utils';
import { useProject } from '@/contexts/ProjectContext';
import Modal from '@/components/Modal';
import { FolderOpen } from 'lucide-react';

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
  const [dialogState, setDialogState] = useState<{ type: 'alert' | 'confirm' | null; title: string; message: string; onConfirm?: () => void }>({ type: null, title: '', message: '' });
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
        setFormData({ name: '', description: '', kvStorageLimit: 1 });
        await refreshProjects();
        loadProjects();
      } else {
        const data = await response.json();
        setDialogState({ type: 'alert', title: 'Error', message: data.error || 'Failed to create project' });
      }
    } catch (error) {
      console.error('Error creating project:', error);
      setDialogState({ type: 'alert', title: 'Error', message: 'Error creating project' });
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
        setFormData({ name: '', description: '', kvStorageLimit: 1 });
        await refreshProjects();
        loadProjects();
      } else {
        const data = await response.json();
        setDialogState({ type: 'alert', title: 'Error', message: data.error || 'Failed to update project' });
      }
    } catch (error) {
      console.error('Error updating project:', error);
      setDialogState({ type: 'alert', title: 'Error', message: 'Error updating project' });
    }
  };

  const handleDeleteProject = async (project: Project) => {
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
            await refreshProjects();
            loadProjects();
            setDialogState({ type: null, title: '', message: '' });
          } else {
            const data = await response.json();
            setDialogState({ type: 'alert', title: 'Error', message: data.error || 'Failed to delete project' });
          }
        } catch (error) {
          console.error('Error deleting project:', error);
          setDialogState({ type: 'alert', title: 'Error', message: 'Error deleting project' });
        }
      }
    });
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
          <PageHeader
            title="Projects"
            subtitle="Manage projects and assign users"
            icon={<FolderOpen className="w-8 h-8 text-primary-500" />}
          >
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              Create Project
            </button>
          </PageHeader>

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
          <Modal
            isOpen={showCreateModal}
            title="Create New Project"
            onCancel={closeModals}
            onConfirm={() => {
              const form = document.querySelector('form[data-create-project]') as HTMLFormElement;
              form?.dispatchEvent(new Event('submit', { bubbles: true }));
            }}
            cancelText="Cancel"
            confirmText="Create Project"
          >
            <form onSubmit={handleCreateProject} data-create-project>
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
            </form>
          </Modal>
        )}

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

        {/* Edit Project Modal */}
        {editingProject && (
          <Modal
            isOpen={!!editingProject}
            title="Edit Project"
            onCancel={closeModals}
            onConfirm={() => {
              const form = document.querySelector('form[data-edit-project]') as HTMLFormElement;
              form?.dispatchEvent(new Event('submit', { bubbles: true }));
            }}
            cancelText="Cancel"
            confirmText="Update Project"
          >
            <form onSubmit={handleUpdateProject} data-edit-project>
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
            </form>
          </Modal>
        )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}