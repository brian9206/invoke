import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter'
import Modal from '@/components/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { Key, Save, Eye, EyeOff, Mail, User, Loader, Plus, Copy, Trash2, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

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
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordScore, setPasswordScore] = useState(0)
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [apiKeysLoading, setApiKeysLoading] = useState(false)
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  
  const [emailForm, setEmailForm] = useState({
    email: user?.email || ''
  })
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  // Load API keys on mount
  useEffect(() => {
    fetchApiKeys()
  }, [])

  const fetchApiKeys = async () => {
    setApiKeysLoading(true)
    try {
      const response = await authenticatedFetch('/api/auth/api-keys')
      const data = await response.json()
      
      if (data.success) {
        setApiKeys(data.data)
      } else {
        toast.error('Failed to load API keys')
      }
    } catch (error) {
      console.error('Failed to fetch API keys:', error)
      toast.error('Failed to load API keys')
    } finally {
      setApiKeysLoading(false)
    }
  }

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newKeyName.trim()) {
      toast.error('API key name is required')
      return
    }

    setCreatingKey(true)

    try {
      const response = await authenticatedFetch('/api/auth/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName.trim() })
      })

      const data = await response.json()

      if (data.success) {
        setCreatedKey(data.data.api_key)
        setShowKeyModal(true)
        setShowCreateKeyModal(false)
        setNewKeyName('')
        await fetchApiKeys()
        toast.success('API key created successfully!')
      } else {
        toast.error(data.message || 'Failed to create API key')
      }
    } catch (error) {
      console.error('Failed to create API key:', error)
      toast.error('Failed to create API key')
    } finally {
      setCreatingKey(false)
    }
  }

  const handleDeleteApiKey = async (keyId: number, keyName: string) => {
    if (!confirm(`Are you sure you want to revoke the API key "${keyName}"? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await authenticatedFetch(`/api/auth/api-keys/${keyId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        toast.success('API key revoked successfully')
        await fetchApiKeys()
      } else {
        toast.error(data.message || 'Failed to revoke API key')
      }
    } catch (error) {
      console.error('Failed to delete API key:', error)
      toast.error('Failed to revoke API key')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard!')
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleString()
  }

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validation
    if (!emailForm.email) {
      toast.error('Email is required')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailForm.email)) {
      toast.error('Invalid email format')
      return
    }

    if (emailForm.email === user?.email) {
      toast.error('New email is the same as current email')
      return
    }

    setEmailLoading(true)

    try {
      const response = await authenticatedFetch('/api/auth/change-email', {
        method: 'PUT',
        body: JSON.stringify({
          email: emailForm.email
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Email updated successfully!')
        // Update user context
        if (user) {
          setUser({ ...user, email: data.data.email })
        }
      } else {
        toast.error(data.message || 'Failed to update email')
      }
    } catch (error: any) {
      console.error('Email change error:', error)
      toast.error(error.message || 'Failed to update email')
    } finally {
      setEmailLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validation
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('All fields are required')
      return
    }

    if (passwordScore < 3) {
      toast.error('Password is not strong enough. Please use a stronger password.')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    setLoading(true)

    try {
      const response = await authenticatedFetch('/api/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Password changed successfully!')
        // Reset form
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        })
      } else {
        toast.error(data.message || 'Failed to change password')
      }
    } catch (error: any) {
      console.error('Password change error:', error)
      toast.error(error.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute>
      <Layout title="Profile Settings">
        <div className="space-y-6">
          {/* Header */}
          <PageHeader
            title="Profile Settings"
            subtitle="Manage your account settings and preferences"
            icon={<User className="w-8 h-8 text-primary-500" />}
          />

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Account Information - Left Column */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-100 mb-4">Account Information</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-400">Username</label>
                  <p className="text-gray-100 font-medium">{user?.username}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Email</label>
                  <p className="text-gray-100 font-medium">{user?.email}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Role</label>
                  <p className="text-gray-100 font-medium">
                    {user?.isAdmin ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-purple-900 text-purple-200">
                        Administrator
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-blue-900 text-blue-200">
                        User
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Settings - Right Column (2 columns wide) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Change Email Card */}
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Mail className="w-5 h-5 text-green-400" />
                  <h2 className="text-xl font-semibold text-gray-100">Change Email</h2>
                </div>
                
                <form onSubmit={handleEmailChange} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={emailForm.email}
                      onChange={(e) => setEmailForm({ email: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Enter new email address"
                      disabled={emailLoading}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Current: {user?.email}
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={emailLoading || !emailForm.email || emailForm.email === user?.email}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    >
                      {emailLoading ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {emailLoading ? 'Updating Email...' : 'Update Email'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Change Password Card */}
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Key className="w-5 h-5 text-blue-400" />
                  <h2 className="text-xl font-semibold text-gray-100">Change Password</h2>
                </div>
            
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  {/* Current Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                        className="w-full px-3 py-2 pr-10 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter current password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        className="w-full px-3 py-2 pr-10 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter new password (min 8 characters)"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <PasswordStrengthMeter 
                      password={passwordForm.newPassword} 
                      onScoreChange={setPasswordScore}
                    />
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                        className="w-full px-3 py-2 pr-10 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Confirm new password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                      <p className="text-xs text-red-400 mt-1">
                        Passwords do not match
                      </p>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={loading || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword || passwordForm.newPassword !== passwordForm.confirmPassword || passwordScore < 3}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    >
                      {loading ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {loading ? 'Changing Password...' : 'Change Password'}
                    </button>
                  </div>

                  {/* Password Requirements */}
                  <div className="mt-4 p-4 bg-gray-900 rounded-lg">
                    <p className="text-sm font-medium text-gray-300 mb-2">Password Requirements:</p>
                    <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                      <li>Must have a strength score of at least 3 (Strong)</li>
                      <li>Must match confirmation password</li>
                    </ul>
                  </div>
                </form>
              </div>

              {/* API Keys Card */}
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-yellow-400" />
                    <h2 className="text-xl font-semibold text-gray-100">API Keys</h2>
                  </div>
                  <button
                    onClick={() => setShowCreateKeyModal(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Generate New Key
                  </button>
                </div>

                <p className="text-sm text-gray-400 mb-4">
                  API keys have the same permissions as your user account. Use them to authenticate CLI tools and automated scripts.
                </p>

                {apiKeysLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No API keys created yet</p>
                    <p className="text-sm mt-1">Create one to get started with the CLI</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between p-4 bg-gray-900 border border-gray-700 rounded-lg"
                      >
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-100">{key.name}</h3>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                            <span>Created: {formatDate(key.created_at)}</span>
                            <span>Last used: {formatDate(key.last_used)}</span>
                            <span>Uses: {key.usage_count}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteApiKey(key.id, key.name)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                          title="Revoke API key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Create API Key Modal */}
          <Modal
            isOpen={showCreateKeyModal}
            onClose={() => {
              setShowCreateKeyModal(false)
              setNewKeyName('')
            }}
            title="Generate New API Key"
          >
            <form onSubmit={handleCreateApiKey} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  API Key Name
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder="e.g., CLI Access, CI/CD Pipeline"
                  disabled={creatingKey}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">
                  Choose a descriptive name to identify where this key is used
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creatingKey || !newKeyName.trim()}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {creatingKey ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Generate API Key
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateKeyModal(false)
                    setNewKeyName('')
                  }}
                  disabled={creatingKey}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          {/* Show Created API Key Modal */}
          <Modal
            isOpen={showKeyModal}
            onClose={() => {
              setShowKeyModal(false)
              setCreatedKey('')
            }}
            title="API Key Created"
          >
            <div className="space-y-4">
              <div className="p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                <p className="text-sm text-yellow-200 font-medium">
                  ⚠️ Important: Save this API key now!
                </p>
                <p className="text-xs text-yellow-300 mt-1">
                  You won't be able to see it again. If you lose it, you'll need to generate a new one.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Your API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={createdKey}
                    readOnly
                    className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 font-mono text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(createdKey)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    setShowKeyModal(false)
                    setCreatedKey('')
                  }}
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                >
                  I've Saved My Key
                </button>
              </div>
            </div>
          </Modal>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
