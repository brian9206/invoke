import React from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'
import { useProject } from '@/contexts/ProjectContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import ProjectSelector from '@/components/ProjectSelector'
import Modal from '@/components/Modal'
import { cn } from '@/lib/cn'
import {
  Rocket,
  BarChart3,
  Package,
  FolderOpen,
  MonitorCloud,
  Settings,
  LogOut,
  User,
  Database,
  Shield,
  Globe,
  ChevronRight,
  Hammer,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb'

interface LayoutProps {
  children: React.ReactNode
  title?: string
}

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
}

export default function Layout({ children, title }: LayoutProps) {
  const { user, logout } = useAuth()
  const { activeProject, setActiveProject, userProjects, loading, isProjectLocked } = useProject()
  const { gatewayEnabled } = useFeatureFlags()
  const router = useRouter()
  const [showSignOutModal, setShowSignOutModal] = React.useState(false)

  const mainNavItems: NavItem[] = [
    { name: 'Dashboard', href: '/admin', icon: BarChart3, active: router.pathname === '/admin' },
    { name: 'Functions', href: '/admin/functions', icon: Package, active: router.pathname.startsWith('/admin/functions') || router.pathname === '/admin/deploy' },
    { name: 'Builds', href: '/admin/builds', icon: Hammer, active: router.pathname === '/admin/builds' },
    { name: 'KV Store', href: '/admin/kv-store', icon: Database, active: router.pathname === '/admin/kv-store' },
    ...(user?.isAdmin ? [{ name: 'Network Security', href: '/admin/network-security', icon: Shield, active: router.pathname === '/admin/network-security' }] : []),
    ...(gatewayEnabled ? [{ name: 'API Gateway', href: '/admin/api-gateway', icon: Globe, active: router.pathname === '/admin/api-gateway' }] : []),
    { name: 'Monitoring', href: '/admin/logs', icon: MonitorCloud, active: router.pathname === '/admin/logs' },
  ]

  const adminNavItems: NavItem[] = [
    { name: 'Projects', href: '/admin/projects', icon: FolderOpen, active: router.pathname.startsWith('/admin/projects') },
    { name: 'Users', href: '/admin/users', icon: User, active: router.pathname === '/admin/users' },
    { name: 'Global Settings', href: '/admin/global-settings', icon: Settings, active: router.pathname === '/admin/global-settings' },
  ]

  if (!user) return null

  return (
    <>
      <Head>
        {title && <title>{title} - Invoke Admin</title>}
        <meta name="description" content="Invoke Admin Panel - Manage serverless functions" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>

      <Modal
        isOpen={showSignOutModal}
        title="Sign Out"
        description="Are you sure you want to sign out?"
        onConfirm={logout}
        onCancel={() => setShowSignOutModal(false)}
        cancelText="Cancel"
        confirmText="Sign Out"
        confirmVariant="danger"
      />

      <SidebarProvider>
        <Sidebar collapsible="icon" variant="floating">

          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link href="/admin">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 shrink-0">
                      <Rocket className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex flex-col leading-none">
                      <span className="font-semibold text-sm">Invoke</span>
                      <span className="text-xs text-muted-foreground">Admin Portal</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="px-1 group-data-[collapsible=icon]:hidden">
              <ProjectSelector
                activeProject={activeProject}
                userProjects={userProjects}
                loading={loading}
                isProjectLocked={isProjectLocked}
                user={user}
                onProjectChange={setActiveProject}
              />
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Platform</SidebarGroupLabel>
              <SidebarMenu>
                {mainNavItems.map((item) => (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild tooltip={item.name} isActive={item.active}>
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>

            {!!user?.isAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel>Administration</SidebarGroupLabel>
                <SidebarMenu>
                  {adminNavItems.map((item) => (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton asChild tooltip={item.name} isActive={item.active}>
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            )}
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col items-start leading-none min-w-0">
                        <span className="text-sm font-medium truncate">{user.username}</span>
                        <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                      </div>
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" side="top" align="start" sideOffset={4}>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium">{user.username}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin/profile" className="cursor-pointer">
                        <Settings className="h-4 w-4 mr-1" />
                        Profile Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive cursor-pointer"
                      onClick={() => setShowSignOutModal(true)}
                    >
                      <LogOut className="h-4 w-4 mr-1" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>

          <SidebarRail />
        </Sidebar>

        <SidebarInset className="min-w-0">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <main className="flex min-w-0 flex-col gap-4 overflow-x-hidden p-4 lg:gap-6 lg:p-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
