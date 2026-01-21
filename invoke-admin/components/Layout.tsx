import React from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'
import ProjectSelector from '@/components/ProjectSelector'
import {
  Menu,
  X,
  Rocket,
  BarChart3,
  Package,
  Upload,
  FileText,
  Settings,
  LogOut,
  User
} from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
  title?: string
}

export default function Layout({ children, title }: LayoutProps) {
  const { user, logout } = useAuth()
  const { activeProject, setActiveProject, userProjects, loading, isProjectLocked } = useProject()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: BarChart3, active: router.pathname === '/admin' },
    { name: 'Functions', href: '/admin/functions', icon: Package, active: router.pathname.startsWith('/admin/functions') || router.pathname === '/admin/deploy' },
    { name: 'Projects', href: '/admin/projects', icon: Upload, active: router.pathname.startsWith('/admin/projects'), adminOnly: true },
    { name: 'Users', href: '/admin/users', icon: User, active: router.pathname === '/admin/users', adminOnly: true },
    { name: 'Logs', href: '/admin/logs', icon: FileText, active: router.pathname === '/admin/logs' },
    { name: 'Global Settings', href: '/admin/global-settings', icon: Settings, active: router.pathname === '/admin/global-settings', adminOnly: true },
  ]

  // Helper to check admin status (used when filtering nav items)
  const reqUserIsAdmin = () => !!user?.isAdmin

  if (!user) {
    return null // Let the auth check handle redirects
  }

  return (
    <>
      <Head>
        {title && <title>{title} - Invoke Admin</title>}
        <meta name="description" content="Invoke Admin Panel - Manage serverless functions" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen bg-gray-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-800 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform duration-300 ease-in-out`}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-700">
          <div className="flex items-center">
            <Rocket className="w-8 h-8 text-primary-500" />
            <span className="ml-2 text-xl font-bold text-white">Invoke</span>
          </div>
          <button
            className="lg:hidden text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Project Selector - for all users */}
        <div className="px-4 py-3 border-b border-gray-700">
          <ProjectSelector
            activeProject={activeProject}
            userProjects={userProjects}
            loading={loading}
            isProjectLocked={isProjectLocked}
            user={user}
            onProjectChange={setActiveProject}
          />
        </div>

        <nav className="mt-2">
          {navigation
            .filter(item => !item.adminOnly || reqUserIsAdmin())
            .map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`sidebar-link ${item.active ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-700">
          <div className="flex items-center mb-4">
            <User className="w-8 h-8 text-gray-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-white">{user.username}</p>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center w-full text-gray-300 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar */}
        <div className="flex items-center justify-between h-16 px-6 bg-gray-800 border-b border-gray-700 lg:px-8">
          <button
            className="lg:hidden text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          <div className="hidden lg:block">
            {/* Additional header content can go here */}
          </div>
        </div>

        {/* Page content */}
        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
    </>
  )
}