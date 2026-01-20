import React from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'
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
  User,
  ChevronDown,
  Folder,
  Server
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
  const [projectDropdownOpen, setProjectDropdownOpen] = React.useState(false)

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

  // Pages where project selector should be hidden
  const hideProjectSelector = ['/admin/projects', '/admin/users', '/admin/global-settings'].includes(router.pathname)

  // Pages where project selector should show "System" and be locked
  const isSystemPage = ['/admin/projects', '/admin/users', '/admin/global-settings'].includes(router.pathname)
  
  const systemProject = {
    id: 'system',
    name: 'System',
    description: 'System-wide administration',
    role: 'admin'
  }

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
          {loading && !isSystemPage ? (
            <div className="animate-pulse">
              <div className="h-10 bg-gray-700 rounded"></div>
            </div>
          ) : isSystemPage ? (
            <div className="relative">
              <button
                className="w-full flex items-center justify-between p-2 rounded-lg bg-gray-600/30 cursor-not-allowed transition-colors min-w-0"
                disabled={true}
              >
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <Server className="w-4 h-4 text-primary-400 flex-shrink-0" />
                  <div className="text-left min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">
                      {systemProject.name}
                    </div>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            </div>
          ) : userProjects.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-2">
              {user.isAdmin ? 'No projects found' : 'No projects assigned'}
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => !isProjectLocked && setProjectDropdownOpen(!projectDropdownOpen)}
                className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors min-w-0 ${
                  isProjectLocked 
                    ? 'bg-gray-600/30 cursor-not-allowed' 
                    : 'bg-gray-700/50 hover:bg-gray-700'
                }`}
                disabled={isProjectLocked}
              >
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  {activeProject?.id === 'system' ? (
                    <Server className="w-4 h-4 text-primary-400 flex-shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-primary-400 flex-shrink-0" />
                  )}
                  <div className="text-left min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">
                      {activeProject ? activeProject.name : 'Select Project'}
                    </div>
                    {activeProject && activeProject.role && activeProject.role !== 'locked' && activeProject.id !== 'system' && (
                      <div className="text-xs text-gray-400 truncate">
                        Role: {activeProject.role}
                      </div>
                    )}
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transform transition-transform flex-shrink-0 ${
                  projectDropdownOpen ? 'rotate-180' : ''
                }`} />
              </button>

              {projectDropdownOpen && !isProjectLocked && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setProjectDropdownOpen(false)}
                  />
                  {/* Dropdown */}
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                    {userProjects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => {
                          setActiveProject(project);
                          setProjectDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-600 transition-colors flex items-center min-w-0 ${
                          activeProject?.id === project.id ? 'bg-gray-600' : ''
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          {project.id === 'system' ? (
                            <Server className="w-4 h-4 text-primary-400 flex-shrink-0" />
                          ) : (
                            <Folder className="w-4 h-4 text-primary-400 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-white truncate">
                              {project.name}
                            </div>
                            {project.role && project.id !== 'system' && (
                              <div className="text-xs text-gray-500 truncate">
                                Role: {project.role}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
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