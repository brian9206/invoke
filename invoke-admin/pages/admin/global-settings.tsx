import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Settings, AlertCircle, CheckCircle, Loader, Plus, Trash2 } from 'lucide-react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import { authenticatedFetch } from '@/lib/frontend-utils';
import { useProject } from '@/contexts/ProjectContext';
import { useSetFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { clearFunctionBaseUrlCache } from '@/lib/frontend-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

export default function GlobalSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionType, setRetentionType] = useState<'time' | 'count' | 'none'>('none');
  const [retentionValue, setRetentionValue] = useState('');
  const [functionBaseUrl, setFunctionBaseUrl] = useState('');
  const [kvStorageLimitGB, setKvStorageLimitGB] = useState('');
  const [apiGatewayEnabled, setApiGatewayEnabled] = useState(false);
  const [apiGatewayDomain, setApiGatewayDomain] = useState('');
  const [apiGatewayDomainProtocol, setApiGatewayDomainProtocol] = useState<'http' | 'https'>('https');

  const { lockProject, unlockProject, userProjects } = useProject();
  const hasLockedProject = useRef(false);
  const setFeatureFlags = useSetFeatureFlags();

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

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const res = await authenticatedFetch('/api/admin/global-settings');
      if (res.ok) {
        const data = await res.json();
        const s = data.data;

        const readSetting = (key: string): string => {
          const value = s?.[key]
          if (value && typeof value === 'object' && 'value' in value) {
            return String((value as { value: unknown }).value ?? '')
          }
          return String(value ?? '')
        }

        const retentionEnabledValue = readSetting('enabled')
        setRetentionEnabled(retentionEnabledValue === 'true')
        setRetentionType((readSetting('type') || 'none') as 'time' | 'count' | 'none')
        setRetentionValue(readSetting('value'))
        setFunctionBaseUrl(readSetting('function_base_url'))

        const kvBytesRaw = readSetting('kv_storage_limit_bytes')
        if (kvBytesRaw) {
          const kvBytes = Number(kvBytesRaw)
          setKvStorageLimitGB(Number.isFinite(kvBytes) ? String(kvBytes / (1024 ** 3)) : '')
        } else {
          setKvStorageLimitGB('')
        }

        const gatewayDomain = readSetting('api_gateway_domain')
        if (gatewayDomain) {
          const hasProtocol = /^https?:\/\//i.test(gatewayDomain)
          if (hasProtocol) {
            setApiGatewayDomainProtocol(gatewayDomain.toLowerCase().startsWith('http://') ? 'http' : 'https')
            setApiGatewayDomain(gatewayDomain.replace(/^https?:\/\//i, ''))
          } else {
            setApiGatewayDomain(gatewayDomain)
            setApiGatewayDomainProtocol('https')
          }
          setApiGatewayEnabled(true)
        } else {
          setApiGatewayDomain('')
          setApiGatewayDomainProtocol('https')
          setApiGatewayEnabled(false)
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (apiGatewayEnabled && !apiGatewayDomain.trim()) {
      toast.error('API Gateway domain is required when the gateway is enabled.');
      return;
    }
    setSaving(true);
    try {
      const res = await authenticatedFetch('/api/admin/global-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: retentionEnabled,
          type: retentionType,
          value: retentionValue !== '' ? Number(retentionValue) : null,
          function_base_url: functionBaseUrl,
          kv_storage_limit_bytes: kvStorageLimitGB !== '' ? Math.round(Number(kvStorageLimitGB) * (1024 ** 3)) : null,
          api_gateway_domain: apiGatewayEnabled ? `${apiGatewayDomainProtocol}://${apiGatewayDomain}` : '',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        clearFunctionBaseUrlCache();
        if (data.featureFlags) setFeatureFlags(data.featureFlags);
        toast.success('Settings saved successfully.');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save settings.');
      }
    } catch {
      toast.error('An error occurred while saving settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    setCleanupResult(null);
    try {
      const res = await authenticatedFetch('/api/admin/cleanup-logs', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCleanupResult(data.message || 'Cleanup completed successfully.');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Cleanup failed.');
      }
    } catch {
      toast.error('An error occurred during cleanup.');
    } finally {
      setCleaning(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Global Settings">
          <div className="flex items-center justify-center h-64">
            <Loader className="w-8 h-8 text-primary animate-spin" />
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout title="Global Settings">
        <div className="space-y-6">
          <PageHeader
            title="Global Settings"
            subtitle="Configure system-wide platform settings"
            icon={<Settings className="w-8 h-8 text-primary" />}
          />

          <Card>
            <CardContent className="pt-6 space-y-8">
              {/* Log Retention */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Log Retention</h3>
                  <p className="text-sm text-muted-foreground mt-1">Configure automatic cleanup of execution logs.</p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch id="retentionEnabled" checked={retentionEnabled} onCheckedChange={setRetentionEnabled} />
                  <Label htmlFor="retentionEnabled" className="cursor-pointer">Enable log retention policy</Label>
                </div>
                {retentionEnabled && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pl-2">
                    <div className="space-y-1.5">
                      <Label>Retention Type</Label>
                      <Select value={retentionType} onValueChange={(v) => setRetentionType(v as 'time' | 'count' | 'none')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="time">Time-based (days)</SelectItem>
                          <SelectItem value="count">Count-based (max entries)</SelectItem>
                          <SelectItem value="none">No limit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {retentionType !== 'none' && (
                      <div className="space-y-1.5">
                        <Label>{retentionType === 'time' ? 'Days to retain' : 'Max log entries'}</Label>
                        <Input
                          type="number"
                          min={1}
                          value={retentionValue}
                          onChange={(e) => setRetentionValue(e.target.value)}
                          placeholder={retentionType === 'time' ? 'e.g. 30' : 'e.g. 10000'}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Function URL Settings */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Function URL Settings</h3>
                  <p className="text-sm text-muted-foreground mt-1">The base URL used when invoking functions.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Base URL</Label>
                  <Input
                    type="url"
                    value={functionBaseUrl}
                    onChange={(e) => setFunctionBaseUrl(e.target.value)}
                    placeholder="https://functions.example.com"
                  />
                </div>
              </div>

              <Separator />

              {/* KV Storage Settings */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">KV Storage Settings</h3>
                  <p className="text-sm text-muted-foreground mt-1">Limit the total key-value store size per project.</p>
                </div>
                <div className="space-y-1.5 max-w-xs">
                  <Label>Storage Limit (GB)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={kvStorageLimitGB}
                    onChange={(e) => setKvStorageLimitGB(e.target.value)}
                    placeholder="e.g. 1"
                  />
                </div>
              </div>

              <Separator />

              {/* API Gateway Settings */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">API Gateway Settings</h3>
                  <p className="text-sm text-muted-foreground mt-1">Configure the API Gateway for routing HTTP traffic to functions.</p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch id="apiGatewayEnabled" checked={apiGatewayEnabled} onCheckedChange={setApiGatewayEnabled} />
                  <Label htmlFor="apiGatewayEnabled" className="cursor-pointer">Enable API Gateway</Label>
                </div>
                {apiGatewayEnabled && (
                  <div className="space-y-1.5">
                    <Label>Gateway Domain</Label>
                    <div className="flex gap-2">
                      <Select value={apiGatewayDomainProtocol} onValueChange={(v) => setApiGatewayDomainProtocol(v as 'http' | 'https')}>
                        <SelectTrigger className="w-[110px] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="https">https://</SelectItem>
                          <SelectItem value="http">http://</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="text"
                        value={apiGatewayDomain}
                        onChange={(e) => setApiGatewayDomain(e.target.value)}
                        placeholder="gateway.example.com"
                        className="flex-1"
                      />
                    </div>
                    {apiGatewayEnabled && !apiGatewayDomain.trim() && (
                      <p className="text-sm text-destructive flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Domain is required when the gateway is enabled.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  onClick={handleSave}
                  disabled={saving || (apiGatewayEnabled && !apiGatewayDomain.trim())}
                >
                  {saving ? <><Loader className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save Settings'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleCleanup}
                  disabled={cleaning || !retentionEnabled}
                >
                  {cleaning ? <><Loader className="w-4 h-4 mr-2 animate-spin" /> Running…</> : 'Run Cleanup Now'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {cleanupResult && (
            <Card className="border-green-800/50">
              <CardContent className="pt-5 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                <p className="text-sm text-green-300">{cleanupResult}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
