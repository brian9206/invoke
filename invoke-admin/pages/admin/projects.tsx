import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import PageHeader from '@/components/PageHeader';
import { authenticatedFetch } from '@/lib/frontend-utils';
import { useProject } from '@/contexts/ProjectContext';
import Modal from '@/components/Modal';
import { FolderOpen, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
  const [dialogState, setDialogState] = useState<{
    type: 'alert' | 'confirm' | null;
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({ type: null, title: '', message: '' });
  const router = useRouter();
  const { refreshProjects, lockProject, unlockProject, userProjects } = useProject();
  const hasLockedProject = useRef(false);

  useEffect(() => {
    loadProjects();
  }, []);

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

  const loadProjects = async () => {
    try {
      const response = await authenticatedFetch('/api/admin/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
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
          setDialogState({ type: 'alert', title: 'Error', message: 'Error deleting project' });
        }
      },
    });
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
      kvStorageLimit: project.kv_storage_limit_bytes / (1024 * 1024 * 1024),
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
            <Loader className="w-8 h-8 text-primary animate-spin" />
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
            icon={<FolderOpen className="w-8 h-8 text-primary" />}
          >
            <Button onClick={() => setShowCreateModal(true)}>Create Project</Button>
          </PageHeader>

          {projects.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No projects found.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  className="cursor-pointer hover:bg-card/80 transition-colors"
                  onClick={() => router.push(`/admin/projects/${project.id}`)}
                >
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-base font-semibold text-foreground">{project.name}</h3>
                          <Badge variant={project.is_active ? 'success' : 'secondary'}>
                            {project.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        {project.description && (
                          <p className="text-muted-foreground text-sm">{project.description}</p>
                        )}
                        <div className="flex items-center gap-6 mt-2 text-sm text-muted-foreground">
                          <span>Members: {project.member_count}</span>
                          <span>Functions: {project.function_count}</span>
                          <span>Created: {new Date(project.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
              <form onSubmit={handleCreateProject} data-create-project className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Project Name</Label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
              <form onSubmit={handleUpdateProject} data-edit-project className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Project Name</Label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>KV Storage Limit (GB)</Label>
                  <Input
                    type="number"
                    min="0.001"
                    step="0.1"
                    required
                    value={formData.kvStorageLimit}
                    onChange={(e) =>
                      setFormData({ ...formData, kvStorageLimit: parseFloat(e.target.value) || 0 })
                    }
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
