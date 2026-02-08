import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import NetworkPolicyEditor from '@/components/NetworkPolicyEditor';
import { ArrowLeft, Shield } from 'lucide-react';
import Link from 'next/link';
import { authenticatedFetch } from '@/lib/frontend-utils';
import toast from 'react-hot-toast';

interface NetworkPolicyRule {
  action: 'allow' | 'deny';
  target_type: 'ip' | 'cidr' | 'domain';
  target_value: string;
  description?: string;
  priority: number;
}

interface Project {
  id: string;
  name: string;
  description: string;
}

export default function ProjectSecurityPage() {
  const router = useRouter();
  const { id: projectId } = router.query;
  const [project, setProject] = useState<Project | null>(null);
  const [rules, setRules] = useState<NetworkPolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadProjectData();
      loadSecurityPolicies();
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
      toast.error('Failed to load project data');
    }
  };

  const loadSecurityPolicies = async () => {
    try {
      const response = await authenticatedFetch(`/api/admin/projects/${projectId}/security`);

      if (response.ok) {
        const data = await response.json();
        setRules(data.rules || []);
      } else {
        toast.error('Failed to load security policies');
      }
    } catch (error) {
      console.error('Error loading security policies:', error);
      toast.error('Failed to load security policies');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (rules.length === 0) {
      toast.error('At least one policy rule is required');
      return;
    }

    setSaving(true);
    try {
      const response = await authenticatedFetch(
        `/api/admin/projects/${projectId}/security`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ rules }),
        }
      );

      if (response.ok) {
        toast.success('Security policies saved successfully');
        loadSecurityPolicies(); // Reload to get any server-side updates
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save security policies');
      }
    } catch (error) {
      console.error('Error saving security policies:', error);
      toast.error('Failed to save security policies');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (host: string): Promise<{ allowed: boolean; reason: string }> => {
    try {
      const response = await authenticatedFetch(
        `/api/admin/projects/${projectId}/security/test`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ host, rules }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        const error = await response.json();
        return {
          allowed: false,
          reason: error.error || 'Test failed'
        };
      }
    } catch (error) {
      return {
        allowed: false,
        reason: 'Test failed: ' + (error instanceof Error ? error.message : String(error))
      };
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout>
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">Loading...</div>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center mb-6">
            <Link
              href={`/admin/projects/${projectId}`}
              className="mr-4 p-2 hover:bg-gray-700 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <Shield className="w-8 h-8 text-blue-400" />
                <div>
                  <h1 className="text-3xl font-bold text-gray-100">Network Security</h1>
                  {project && (
                    <p className="text-gray-400 mt-1">
                      Configure network policies for {project.name}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Info Card */}
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mb-6">
            <h3 className="text-blue-400 font-medium mb-2">About Network Security Policies</h3>
            <ul className="text-gray-300 text-sm space-y-1 list-disc list-inside">
              <li>Control which IPs, CIDR blocks, and domains functions can connect to</li>
              <li>Rules are evaluated in priority order (first match wins)</li>
              <li>At least one rule is required - without rules, all connections are blocked</li>
              <li>Drag and drop rules to reorder their priority</li>
              <li>Domain patterns support wildcards (e.g., *.example.com)</li>
            </ul>
          </div>

          {/* Network Policy Editor */}
          <NetworkPolicyEditor
            rules={rules}
            onChange={setRules}
            onSave={handleSave}
            saving={saving}
            onTestConnection={handleTestConnection}
          />
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
