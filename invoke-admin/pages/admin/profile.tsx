import React, { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter'
import Modal from '@/components/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { authenticatedFetch } from '@/lib/frontend-utils'
import {
  Key, Save, Eye, EyeOff, User, Loader, Plus, Copy, Trash2, Shield,
  Pencil, X, Terminal, Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface ApiKey {
  id: number
  name: string
  created_at: string
  last_used: string | null
  usage_count: number
  is_active: boolean
}

export default function ProfileSettings() {
  const { user, setUser } = useAuth()

  // ── password form ──────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordScore, setPasswordScore] = useState(0)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  // ── email inline edit ──────────────────────────────────────────
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailValue, setEmailValue] = useState(user?.email || '')
  const [emailLoading, setEmailLoading] = useState(false)

  // ── API keys ───────────────────────────────────────────────────
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [apiKeysLoading, setApiKeysLoading] = useState(false)
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)

  // ── CLI setup dialog ───────────────────────────────────────────
  const [showCliDialog, setShowCliDialog] = useState(false)
  const [createdKey, setCreatedKey] = useState('')
  const [executionUrl, setExecutionUrl] = useState('')

  // ── sync email field when user loads ──────────────────────────
  useEffect(() => {
    if (user?.email) setEmailValue(user.email)
  }, [user?.email])

  useEffect(() => {
    fetchApiKeys()
    fetchExecutionUrl()
  }, [])

  const fetchApiKeys = async () => {
    setApiKeysLoading(true)
    try {
      const res = await authenticatedFetch('/api/auth/api-keys')
      const data = await res.json()
      if (data.success) setApiKeys(data.data)
      else toast.error('Failed to load API keys')
    } catch {
      toast.error('Failed to load API keys')
    } finally {
      setApiKeysLoading(false)
    }
  }

  const fetchExecutionUrl = async () => {
    try {
      const res = await authenticatedFetch('/api/admin/global-settings')
      const data = await res.json()
      if (data.success) {
        const rawValue = data.data?.function_base_url
        const value = rawValue && typeof rawValue === 'object' && 'value' in rawValue
          ? String((rawValue as { value: unknown }).value ?? '')
          : String(rawValue ?? '')
        setExecutionUrl(value)
      }
    } catch {
      // non-critical — leave empty
    }
  }

  // ── handlers ───────────────────────────────────────────────────

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailValue) { toast.error('Email is required'); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailValue)) { toast.error('Invalid email format'); return }
    if (emailValue === user?.email) { setEditingEmail(false); return }
    setEmailLoading(true)
    try {
      const res = await authenticatedFetch('/api/auth/change-email', {
        method: 'PUT',
        body: JSON.stringify({ email: emailValue }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Email updated successfully!')
        if (user) setUser({ ...user, email: data.data.email })
        setEditingEmail(false)
      } else {
        toast.error(data.message || 'Failed to update email')
      }
    } catch {
      toast.error('Failed to update email')
    } finally {
      setEmailLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('All fields are required'); return
    }
    if (passwordScore < 3) { toast.error('Password is not strong enough.'); return }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match'); return
    }
    setLoading(true)
    try {
      const res = await authenticatedFetch('/api/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Password changed successfully!')
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      } else {
        toast.error(data.message || 'Failed to change password')
      }
    } catch {
      toast.error('Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName.trim()) { toast.error('API key name is required'); return }
    setCreatingKey(true)
    try {
      const res = await authenticatedFetch('/api/auth/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setCreatedKey(data.data.api_key)
        setShowCreateKeyModal(false)
        setNewKeyName('')
        setShowCliDialog(true)
        await fetchApiKeys()
        toast.success('API key created successfully!')
      } else {
        toast.error(data.message || 'Failed to create API key')
      }
    } catch {
      toast.error('Failed to create API key')
    } finally {
      setCreatingKey(false)
    }
  }

  const handleDeleteApiKey = async (keyId: number, keyName: string) => {
    if (!confirm(`Are you sure you want to revoke the API key "${keyName}"? This action cannot be undone.`)) return
    try {
      const res = await authenticatedFetch(`/api/auth/api-keys/${keyId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('API key revoked successfully')
        await fetchApiKeys()
      } else {
        toast.error(data.message || 'Failed to revoke API key')
      }
    } catch {
      toast.error('Failed to revoke API key')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard!')
  }

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString() : 'Never'

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const cliCommand = [
    'npm install -g invoke-cli',
    '',
    'invoke config:set \\',
    `   --api-key ${createdKey || '<api-key>'} \\`,
    `   --base-url ${baseUrl} \\`,
    `   --execution-url ${executionUrl || '<execution-url>'}`,
  ].join('\n')

  return (
    <ProtectedRoute>
      <Layout title="Profile Settings">
        <div className="space-y-6">
          <PageHeader
            title="Profile Settings"
            subtitle="Manage your account settings and preferences"
            icon={<User className="w-8 h-8 text-primary" />}
          />

          <Tabs defaultValue="general" className="space-y-4">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="api-key">API Key</TabsTrigger>
            </TabsList>

            {/* ── GENERAL TAB ─────────────────────────────────── */}
            <TabsContent value="general" className="space-y-6">

              {/* Account Information */}
              <Card>
                <CardContent className="pt-6 space-y-5">
                  <h2 className="text-base font-semibold">Account Information</h2>

                  {/* Username */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Username</Label>
                    <p className="font-medium">{user?.username}</p>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    {editingEmail ? (
                      <form onSubmit={handleEmailChange} className="flex items-center gap-2">
                        <Input
                          type="email"
                          value={emailValue}
                          onChange={(e) => setEmailValue(e.target.value)}
                          placeholder="Enter new email"
                          disabled={emailLoading}
                          className="max-w-sm"
                          autoFocus
                        />
                        <Button type="submit" size="sm" disabled={emailLoading || !emailValue}>
                          {emailLoading
                            ? <Loader className="w-4 h-4 animate-spin" />
                            : <Check className="w-4 h-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditingEmail(false); setEmailValue(user?.email || '') }}
                          disabled={emailLoading}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{user?.email}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingEmail(true)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Role */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Role</Label>
                    <div>
                      {user?.isAdmin
                        ? <Badge variant="purple">Administrator</Badge>
                        : <Badge variant="secondary">User</Badge>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Change Password */}
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-blue-400" />
                    <h2 className="text-base font-semibold">Change Password</h2>
                  </div>
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Current Password</Label>
                      <div className="relative max-w-sm">
                        <Input
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                          placeholder="Enter current password"
                          disabled={loading}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>New Password</Label>
                      <div className="relative max-w-sm">
                        <Input
                          type={showNewPassword ? 'text' : 'password'}
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                          placeholder="Enter new password"
                          disabled={loading}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <PasswordStrengthMeter password={passwordForm.newPassword} onScoreChange={setPasswordScore} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Confirm New Password</Label>
                      <div className="relative max-w-sm">
                        <Input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                          placeholder="Confirm new password"
                          disabled={loading}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                        <p className="text-xs text-destructive">Passwords do not match</p>
                      )}
                    </div>
                    <div className="rounded-lg bg-muted px-4 py-3 max-w-sm">
                      <p className="text-sm font-medium mb-1">Password Requirements</p>
                      <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                        <li>Strength score of at least 3 (Strong)</li>
                        <li>Must match confirmation password</li>
                      </ul>
                    </div>
                    <Button
                      type="submit"
                      disabled={
                        loading ||
                        !passwordForm.currentPassword ||
                        !passwordForm.newPassword ||
                        !passwordForm.confirmPassword ||
                        passwordForm.newPassword !== passwordForm.confirmPassword ||
                        passwordScore < 3
                      }
                    >
                      {loading
                        ? <><Loader className="w-4 h-4 mr-2 animate-spin" /> Changing…</>
                        : <><Save className="w-4 h-4 mr-2" /> Change Password</>}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── API KEY TAB ──────────────────────────────────── */}
            <TabsContent value="api-key" className="space-y-6">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-yellow-400" />
                      <h2 className="text-base font-semibold">API Keys</h2>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setShowCreateKeyModal(true)}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Generate New Key
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    API keys have the same permissions as your user account. Use them to authenticate CLI tools and automated scripts.
                  </p>

                  {apiKeysLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : apiKeys.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shield className="w-12 h-12 mx-auto mb-3 opacity-40" />
                      <p>No API keys created yet</p>
                      <p className="text-sm mt-1">Create one to get started with the CLI</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {apiKeys.map((key) => (
                        <div key={key.id} className="flex items-center justify-between p-4 bg-muted rounded-lg border border-border">
                          <div className="flex-1">
                            <h3 className="font-medium">{key.name}</h3>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                              <span>Created: {formatDate(key.created_at)}</span>
                              <span>Last used: {formatDate(key.last_used)}</span>
                              <span>Uses: {key.usage_count}</span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteApiKey(key.id, key.name)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Create API Key Modal ─────────────────────────── */}
        <Modal
          isOpen={showCreateKeyModal}
          title="Generate New API Key"
          onCancel={() => { setShowCreateKeyModal(false); setNewKeyName('') }}
          onConfirm={() => {
            const form = document.querySelector('form[data-create-key]') as HTMLFormElement
            form?.dispatchEvent(new Event('submit', { bubbles: true }))
          }}
          cancelText="Cancel"
          confirmText={creatingKey ? 'Generating…' : 'Generate API Key'}
          confirmDisabled={creatingKey || !newKeyName.trim()}
        >
          <form onSubmit={handleCreateApiKey} data-create-key className="space-y-3">
            <div className="space-y-1.5">
              <Label>API Key Name</Label>
              <Input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., CLI Access, CI/CD Pipeline"
                disabled={creatingKey}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Choose a descriptive name to identify where this key is used</p>
            </div>
          </form>
        </Modal>

        {/* ── CLI Setup Dialog (after key created) ─────────── */}
        <Dialog open={showCliDialog} onOpenChange={(open) => { if (!open) { setShowCliDialog(false); setCreatedKey('') } }}>
          <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Terminal className="w-5 h-5" />
                API Key Created — Configure CLI
              </DialogTitle>
              <DialogDescription>
                Your new API key has been generated. Save it now — it won't be shown again.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Warning */}
              <div className="p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                <p className="text-sm text-yellow-200 font-medium">⚠️ Save your API key now</p>
                <p className="text-xs text-yellow-300/80 mt-0.5">You won't be able to view it again. If you lose it, generate a new one.</p>
              </div>

              {/* Key value */}
              <div className="space-y-1.5">
                <Label>Your API Key</Label>
                <div className="flex min-w-0 gap-2">
                  <div
                    className="flex-1 w-0 min-w-0 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm overflow-hidden text-ellipsis whitespace-nowrap"
                    title={createdKey}
                  >
                    {createdKey}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(createdKey)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* CLI setup */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  Configure Invoke CLI
                </Label>
                <div className="relative min-w-0 rounded-lg bg-zinc-900 border border-border overflow-hidden">
                  <pre className="p-4 pr-10 text-xs font-mono text-zinc-200 whitespace-pre-wrap break-all leading-relaxed">
                    {cliCommand}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(cliCommand)}
                    className="absolute top-2 right-2 p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white transition-colors"
                    title="Copy command"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => { setShowCliDialog(false); setCreatedKey('') }}>
                  Done
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Layout>
    </ProtectedRoute>
  )
}
