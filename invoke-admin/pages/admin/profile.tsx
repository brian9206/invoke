import React, { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { Key, Save, Eye, EyeOff, Mail, User } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ProfileSettings() {
  const { user, setUser } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const [emailForm, setEmailForm] = useState({
    email: user?.email || ''
  })
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

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

    if (passwordForm.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long')
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

          {/* User Info Card */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">Account Information</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">Username</label>
                <p className="text-gray-100 font-medium">{user?.username}</p>
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

          {/* Change Email Card */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
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
                  <Save className="w-4 h-4" />
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
                {passwordForm.newPassword && passwordForm.newPassword.length < 8 && (
                  <p className="text-xs text-yellow-400 mt-1">
                    Password must be at least 8 characters long
                  </p>
                )}
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
                  disabled={loading || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword || passwordForm.newPassword !== passwordForm.confirmPassword || passwordForm.newPassword.length < 8}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Changing Password...' : 'Change Password'}
                </button>
              </div>

              {/* Password Requirements */}
              <div className="mt-4 p-4 bg-gray-900 rounded-lg">
                <p className="text-sm font-medium text-gray-300 mb-2">Password Requirements:</p>
                <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                  <li>At least 8 characters long</li>
                  <li>Must match confirmation password</li>
                </ul>
              </div>
            </form>
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}
