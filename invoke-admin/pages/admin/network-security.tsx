import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import NetworkPolicyEditor from '@/components/NetworkPolicyEditor';
import PageHeader from '@/components/PageHeader';
import { Shield, AlertCircle, CheckCircle2, XCircle, Loader } from 'lucide-react';
import { authenticatedFetch } from '@/lib/frontend-utils';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';

interface NetworkPolicyRule {
  action: 'allow' | 'deny';
  target_type: 'ip' | 'cidr' | 'domain';
  target_value: string;
  description?: string;
  priority: number;
}

export default function NetworkSecurityPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const [rules, setRules] = useState<NetworkPolicyRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testHost, setTestHost] = useState('');
  const [testResult, setTestResult] = useState<{ allowed: boolean; reason: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const isAdmin = user?.isAdmin || false;
  const isProjectOwner = activeProject?.role === 'owner';

  useEffect(() => {
    if (activeProject?.id) {
      loadSecurityPolicies();
    }
  }, [activeProject?.id]);

  const loadSecurityPolicies = async () => {
    if (!activeProject?.id || loading) return;

    setLoading(true);
    try {
      const endpoint =
        activeProject.id === 'system'
          ? '/api/admin/global/security'
          : `/api/admin/projects/${activeProject.id}/security`;

      const response = await authenticatedFetch(endpoint);

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
    if (!activeProject?.id) {
      toast.error('No project selected');
      return;
    }

    if (rules.length === 0) {
      toast.error('At least one policy rule is required');
      return;
    }

    setSaving(true);
    try {
      const endpoint =
        activeProject.id === 'system'
          ? '/api/admin/global/security'
          : `/api/admin/projects/${activeProject.id}/security`;

      const response = await authenticatedFetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });

      if (response.ok) {
        toast.success('Security policies saved successfully');
        loadSecurityPolicies();
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

  const handleTestConnection = async () => {
    if (!activeProject?.id || !testHost.trim()) return;

    setTesting(true);
    setTestResult(null);

    try {
      const endpoint =
        activeProject.id === 'system'
          ? '/api/admin/global/security/test'
          : `/api/admin/projects/${activeProject.id}/security/test`;

      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: testHost, rules }),
      });

      if (response.ok) {
        const data = await response.json();
        setTestResult(data);
      } else {
        const error = await response.json();
        setTestResult({ allowed: false, reason: error.error || 'Test failed' });
      }
    } catch (error) {
      setTestResult({
        allowed: false,
        reason: 'Test failed: ' + (error instanceof Error ? error.message : String(error)),
      });
    } finally {
      setTesting(false);
    }
  };

  if (!activeProject) {
    return (
      <ProtectedRoute>
        <Layout title="Network Security">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Please Select a Project</h2>
              <p className="text-muted-foreground">Select a project to manage network policies.</p>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Network Security">
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader className="w-5 h-5 text-primary animate-spin" />
              <span className="animate-pulse">Loading...</span>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout title="Network Security">
        <div className="space-y-6">
          <PageHeader
            title="Network Security"
            subtitle={`Manage network policies for ${activeProject.name}`}
            icon={<Shield className="w-8 h-8 text-primary" />}
          />

          {activeProject.id === 'system' && (
            <Card className="border-purple-800 bg-purple-900/10">
              <CardContent className="pt-4">
                <h3 className="text-purple-400 font-medium mb-2">Global Security Policies</h3>
                <p className="text-muted-foreground text-sm">
                  You are editing global security policies that are evaluated before all project-specific policies.
                  These rules apply to all projects and are checked first during network policy evaluation.
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="border-blue-800 bg-blue-900/10">
            <CardContent className="pt-4">
              <h3 className="text-blue-400 font-medium mb-2">About Network Security Policies</h3>
              <ul className="text-muted-foreground text-sm space-y-1 list-disc list-inside">
                <li>Control which IPs, CIDR blocks, and domains functions can connect to</li>
                <li>Rules are evaluated in priority order (first match wins)</li>
                <li>At least one rule is required - without rules, all connections are blocked</li>
                <li>Drag and drop rules to reorder their priority</li>
                <li>Domain patterns support wildcards (e.g., *.example.com)</li>
              </ul>
            </CardContent>
          </Card>

          {/* Test Connection */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-base font-semibold text-foreground mb-4">Test Connection</h3>
              <div className="flex gap-3">
                <Input
                  value={testHost}
                  onChange={(e) => setTestHost(e.target.value)}
                  placeholder="Enter hostname or IP (e.g., example.com, 8.8.8.8)"
                  onKeyPress={(e) => e.key === 'Enter' && handleTestConnection()}
                />
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testing || !testHost.trim()}
                >
                  {testing ? 'Testing...' : 'Test'}
                </Button>
              </div>
              {testResult && (
                <div
                  className={cn(
                    'mt-3 p-3 rounded-lg flex items-start gap-2 border',
                    testResult.allowed
                      ? 'bg-green-900/20 border-green-800'
                      : 'bg-red-900/20 border-red-800'
                  )}
                >
                  {testResult.allowed ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="text-sm">
                    <p className={testResult.allowed ? 'text-green-400' : 'text-red-400'}>
                      <span className="font-medium">
                        {testResult.allowed ? 'Connection Allowed' : 'Connection Blocked'}
                      </span>
                    </p>
                    <p className="text-muted-foreground mt-1">{testResult.reason}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {!isAdmin && !isProjectOwner && (
            <Card className="border-yellow-800 bg-yellow-900/10">
              <CardContent className="pt-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-yellow-400 font-medium">Read-Only Mode</p>
                  <p className="text-yellow-300 mt-1">
                    You are viewing network policies in read-only mode. Only administrators and project owners can modify network security policies.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <NetworkPolicyEditor
            rules={rules}
            onChange={setRules}
            onSave={handleSave}
            saving={saving}
            readOnly={!isAdmin && !isProjectOwner}
          />
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
