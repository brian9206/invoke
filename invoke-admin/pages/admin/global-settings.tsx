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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MemoryInput, parseMemoryMb, formatMemoryMb } from '@/components/MemoryInput';

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

  // Execution settings
  const [execDefaultTimeout, setExecDefaultTimeout] = useState('30');
  const [execMaxTimeout, setExecMaxTimeout] = useState('60');
  const [execDefaultMemory, setExecDefaultMemory] = useState('256');
  const [execMaxMemory, setExecMaxMemory] = useState('1024');
  const [maxConcurrentBuilds, setMaxConcurrentBuilds] = useState('2');

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

        const execDefaultTimeoutVal = readSetting('execution_default_timeout_seconds')
        if (execDefaultTimeoutVal) setExecDefaultTimeout(execDefaultTimeoutVal)
        const execMaxTimeoutVal = readSetting('execution_max_timeout_seconds')
        if (execMaxTimeoutVal) setExecMaxTimeout(execMaxTimeoutVal)
        const execDefaultMemVal = readSetting('execution_default_memory_mb')
        if (execDefaultMemVal) setExecDefaultMemory(formatMemoryMb(Number(execDefaultMemVal)))
        const execMaxMemVal = readSetting('execution_max_memory_mb')
        if (execMaxMemVal) setExecMaxMemory(formatMemoryMb(Number(execMaxMemVal)))
        const maxBuildsVal = readSetting('max_concurrent_builds')
        if (maxBuildsVal) setMaxConcurrentBuilds(maxBuildsVal)
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

    // Validate execution settings
    const defTimeout = Number(execDefaultTimeout);
    const maxTimeout = Number(execMaxTimeout);
    const defMemory = parseMemoryMb(execDefaultMemory) ?? NaN;
    const maxMemory = parseMemoryMb(execMaxMemory) ?? NaN;
    if (!Number.isInteger(defTimeout) || defTimeout < 10) {
      toast.error('Default timeout must be an integer ≥ 10 seconds.'); return;
    }
    if (!Number.isInteger(maxTimeout) || maxTimeout < 10) {
      toast.error('Max timeout must be an integer ≥ 10 seconds.'); return;
    }
    if (maxTimeout < defTimeout) {
      toast.error('Max timeout must be ≥ default timeout.'); return;
    }
    const maxBuilds = Number(maxConcurrentBuilds);
    if (!Number.isInteger(maxBuilds) || maxBuilds < 1) {
      toast.error('Max concurrent builds must be an integer ≥ 1.'); return;
    }
    const isAligned = (n: number) => Number.isInteger(n) && n >= 256 && n % 256 === 0;
    if (isNaN(defMemory) || !isAligned(defMemory)) {
      toast.error('Default memory must be a multiple of 256 MB and at least 256 MB.'); return;
    }
    if (isNaN(maxMemory) || !isAligned(maxMemory)) {
      toast.error('Max memory must be a multiple of 256 MB and at least 256 MB.'); return;
    }
    if (maxMemory < defMemory) {
      toast.error('Max memory must be ≥ default memory.'); return;
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
          execution_default_timeout_seconds: Number(execDefaultTimeout),
          execution_max_timeout_seconds: Number(execMaxTimeout),
          execution_default_memory_mb: parseMemoryMb(execDefaultMemory) ?? 256,
          execution_max_memory_mb: parseMemoryMb(execMaxMemory) ?? 1024,
          max_concurrent_builds: Number(maxConcurrentBuilds),
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

          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="execution">Execution</TabsTrigger>
              <TabsTrigger value="log-retention">Log Retention</TabsTrigger>
              <TabsTrigger value="api-gateway">API Gateway</TabsTrigger>
            </TabsList>

            {/* General Tab */}
            <TabsContent value="general" className="space-y-6 mt-0">
              <Card>
                <CardContent className="pt-6 space-y-8">
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

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? <><Loader className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save Settings'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Execution Tab */}
            <TabsContent value="execution" className="space-y-6 mt-0">
              <Card>
                <CardContent className="pt-6 space-y-8">
                  {/* Timeout Settings */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">Timeout Settings</h3>
                      <p className="text-sm text-muted-foreground mt-1">Control how long functions are allowed to execute.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Default Timeout (seconds)</Label>
                        <Input
                          type="number"
                          min={10}
                          step={1}
                          value={execDefaultTimeout}
                          onChange={(e) => setExecDefaultTimeout(e.target.value)}
                          placeholder="e.g. 30"
                        />
                        <p className="text-xs text-muted-foreground">Used when a function has no custom timeout. Minimum: 10s.</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Maximum Timeout (seconds)</Label>
                        <Input
                          type="number"
                          min={10}
                          step={1}
                          value={execMaxTimeout}
                          onChange={(e) => setExecMaxTimeout(e.target.value)}
                          placeholder="e.g. 60"
                        />
                        <p className="text-xs text-muted-foreground">Upper bound for per-function custom timeouts. Must be ≥ default.</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Memory Limit Settings */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">Memory Limit Settings</h3>
                      <p className="text-sm text-muted-foreground mt-1">Control the isolate memory budget per function. Values must be multiples of 256 MB (256, 512, 768, 1024, …).</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Default Memory Limit</Label>
                        <MemoryInput
                          value={execDefaultMemory}
                          onChange={setExecDefaultMemory}
                          placeholder="e.g. 256M or 1G"
                        />
                        <p className="text-xs text-muted-foreground">Used when a function has no custom memory limit. Minimum: 256 MB.</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Maximum Memory Limit</Label>
                        <MemoryInput
                          value={execMaxMemory}
                          onChange={setExecMaxMemory}
                          placeholder="e.g. 1G or 2G"
                        />
                        <p className="text-xs text-muted-foreground">Upper bound for per-function custom memory limits. Must be ≥ default.</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Build Settings */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">Build Settings</h3>
                      <p className="text-sm text-muted-foreground mt-1">Control the build pipeline for function versions.</p>
                    </div>
                    <div className="max-w-xs space-y-1.5">
                      <Label>Max Concurrent Builds</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={maxConcurrentBuilds}
                        onChange={(e) => setMaxConcurrentBuilds(e.target.value)}
                        placeholder="e.g. 2"
                      />
                      <p className="text-xs text-muted-foreground">Maximum number of builds that can run simultaneously. Minimum: 1.</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? <><Loader className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save Settings'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Log Retention Tab */}
            <TabsContent value="log-retention" className="space-y-6 mt-0">              <Card>
                <CardContent className="pt-6 space-y-8">
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

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button onClick={handleSave} disabled={saving}>
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
            </TabsContent>

            {/* API Gateway Tab */}
            <TabsContent value="api-gateway" className="space-y-6 mt-0">
              <Card>
                <CardContent className="pt-6 space-y-8">
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

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      onClick={handleSave}
                      disabled={saving || (apiGatewayEnabled && !apiGatewayDomain.trim())}
                    >
                      {saving ? <><Loader className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save Settings'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
