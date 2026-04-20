import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import NetworkPolicyEditor from '@/components/NetworkPolicyEditor';
import PageHeader from '@/components/PageHeader';
import { Shield, CheckCircle2, XCircle, Loader } from 'lucide-react';
import { authenticatedFetch } from '@/lib/frontend-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
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
  const { user } = useAuth();
  const router = useRouter();
  const { lockProject, unlockProject, userProjects } = useProject();
  const hasLockedProject = useRef(false);
  const [rules, setRules] = useState<NetworkPolicyRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testHost, setTestHost] = useState('');
  const [testResult, setTestResult] = useState<{ allowed: boolean; reason: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const isAdmin = user?.isAdmin || false;

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

  useEffect(() => {
    if (user && !user.isAdmin) {
      router.replace('/admin');
    }
  }, [user, router]);

  useEffect(() => {
    loadSecurityPolicies();
  }, []);

  const loadSecurityPolicies = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/admin/global/security');

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
      const response = await authenticatedFetch('/api/admin/global/security', {
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
    if (!testHost.trim()) return;

    setTesting(true);
    setTestResult(null);

    try {
      const response = await authenticatedFetch('/api/admin/global/security/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: testHost }),
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
            subtitle="Manage system-wide network policies applied to all function executions"
            icon={<Shield className="w-8 h-8 text-primary" />}
          />

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

          <NetworkPolicyEditor
            rules={rules}
            onChange={setRules}
            onSave={handleSave}
            saving={saving}
            readOnly={!isAdmin}
          />
        </div>
      </Layout>
    </ProtectedRoute>
  );
}

