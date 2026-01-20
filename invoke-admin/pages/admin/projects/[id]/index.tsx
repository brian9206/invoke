import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ArrowLeft, Users, Package, Settings, Calendar, Eye } from 'lucide-react';
import Link from 'next/link';
import { authenticatedFetch } from '@/lib/frontend-utils';

interface Project {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
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

export default function ProjectDetailPage() {
  const router = useRouter();
  const { id: projectId } = router.query;
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      loadProject();
      loadProjectStats();
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
        <div className="max-w-6xl mx-auto p-6">
          {/* Header */}
          <div className="flex items-center mb-6">
            <Link
              href="/admin/projects"
              className="mr-4 p-2 hover:bg-gray-700 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <div className="flex items-center">
                <h1 className="text-3xl font-bold text-gray-100">{project.name}</h1>
                <span className={`ml-3 px-3 py-1 text-sm font-semibold rounded-full ${
                  project.is_active 
                    ? 'bg-green-900/30 text-green-400 border border-green-800' 
                    : 'bg-red-900/30 text-red-400 border border-red-800'
                }`}>
                  {project.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {project.description && (
                <p className="text-gray-600 mt-2">{project.description}</p>
              )}
              <p className="text-gray-500 text-sm mt-1">
                Created by {project.created_by} on {new Date(project.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex space-x-3">
              <Link
                href={`/admin/projects/${project.id}/members`}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center"
              >
                <Users className="w-4 h-4 mr-2" />
                Manage Members
              </Link>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="card overflow-hidden">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Users className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-400 truncate">
                        Total Members
                      </dt>
                      <dd className="text-lg font-medium text-gray-100">
                        {stats?.memberCount || 0}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Package className="h-6 w-6 text-green-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-400 truncate">
                          Total Functions
                        </dt>
                        <dd className="text-lg font-medium text-gray-100">
                          {stats?.functionCount || 0}
                        </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Calendar className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-400 truncate">
                          Created
                        </dt>
                        <dd className="text-lg font-medium text-gray-100">
                          {new Date(project.created_at).toLocaleDateString()}
                        </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Eye className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-400 truncate">
                          Status
                        </dt>
                        <dd className="text-lg font-medium text-gray-100">
                          {project.is_active ? 'Active' : 'Inactive'}
                        </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Members */}
            <div className="card">
              <div className="px-6 py-4 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-100">Recent Members</h3>
                  <Link
                    href={`/admin/projects/${project.id}/members`}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    View All
                  </Link>
                </div>
              </div>
              <div className="p-6">
                {stats?.recentMembers && stats.recentMembers.length > 0 ? (
                  <div className="space-y-4">
                    {stats.recentMembers.map((member, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{member.username}</p>
                          <p className="text-xs text-gray-500">
                            Added {new Date(member.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Users className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-gray-500 text-sm">No members yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Functions */}
            <div className="card">
              <div className="px-6 py-4 border-b border-gray-700">
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
              <div className="p-6">
                {stats?.recentFunctions && stats.recentFunctions.length > 0 ? (
                  <div className="space-y-4">
                    {stats.recentFunctions.map((func) => (
                      <div key={func.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-100">{func.name}</p>
                          <p className="text-xs text-gray-400">
                            Created {new Date(func.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          func.is_active 
                            ? 'bg-green-900/30 text-green-400 border border-green-800' 
                            : 'bg-red-900/30 text-red-400 border border-red-800'
                        }`}>
                          {func.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Package className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-gray-500 text-sm">No functions yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}