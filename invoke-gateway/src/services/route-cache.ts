import { match as pathMatch, MatchFunction } from 'path-to-regexp'
import database from './database'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CorsSettings {
  enabled: boolean
  allowedOrigins: string[]
  allowedHeaders: string[]
  exposeHeaders: string[]
  maxAge: number
  allowCredentials: boolean
}

export interface AuthMethodEntry {
  type: string
  config: Record<string, any>
}

export interface RouteEntry {
  id: string
  routePath: string
  functionId: string
  allowedMethods: string[]
  sortOrder: number
  matchFn: MatchFunction<Record<string, string>> | null
  corsSettings: CorsSettings
  authMethods: AuthMethodEntry[]
  authLogic: string
}

export interface RealtimeEventHandlerEntry {
  eventName: string
  functionId: string | null
}

export interface RealtimeNamespaceEntry {
  id: string
  namespacePath: string
  isActive: boolean
  authLogic: string
  eventHandlers: RealtimeEventHandlerEntry[]
  authMethods: AuthMethodEntry[]
}

export interface ProjectConfig {
  projectId: string
  projectSlug: string
  configId: string
  routes: RouteEntry[]
  realtimeNamespaces: RealtimeNamespaceEntry[]
}

export interface ResolvedRoute {
  projectConfig: ProjectConfig
  route: RouteEntry
  params: Record<string, string>
  pathSuffix: string
}

export interface CacheStatus {
  lastRefreshed: Date | null
  projectCount: number
}

// ─── State ────────────────────────────────────────────────────────────────────

let customDomainMap: Record<string, ProjectConfig> = {}
let projectSlugMap: Record<string, ProjectConfig> = {}
let defaultGatewayDomain = ''
let refreshTimer: ReturnType<typeof setInterval> | null = null
let lastRefreshed: Date | null = null

/**
 * Strip protocol and port from a domain/URL value so it can be used as a
 * hostname-only map key (e.g. "http://localhost:3002" → "localhost").
 */
function normalizeHostname(value: string): string {
  return (value || '')
    .replace(/^https?:\/\//, '')
    .toLowerCase()
    .split(':')[0]
}

/**
 * Compile a route path pattern to a path-to-regexp match function.
 * Returns null if the pattern is invalid.
 */
function compilePattern(routePath: string): MatchFunction<Record<string, string>> | null {
  try {
    // end: false → treat route as a prefix so /test matches /test/abc/def
    return pathMatch<Record<string, string>>(routePath, {
      decode: decodeURIComponent,
      end: false
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[RouteCache] Failed to compile pattern "${routePath}":`, message)
    return null
  }
}

/**
 * Fetch all enabled gateways + routes + settings from the database and rebuild maps.
 */
async function refresh(): Promise<void> {
  try {
    const {
      GlobalSetting,
      ApiGatewayConfig,
      ApiGatewayRoute,
      ApiGatewayRouteSettings,
      ApiGatewayAuthMethod,
      RealtimeNamespace,
      RealtimeEventHandler,
      Project
    } = database.models

    const [domainSetting, configs] = await Promise.all([
      GlobalSetting.findOne({ where: { setting_key: 'api_gateway_domain' } }),
      ApiGatewayConfig.findAll({
        where: { enabled: true },
        include: [
          { model: Project },
          {
            model: ApiGatewayRoute,
            required: false,
            include: [
              { model: ApiGatewayRouteSettings, as: 'settings', required: false },
              {
                model: ApiGatewayAuthMethod,
                as: 'authMethods',
                through: { attributes: ['sort_order'] },
                required: false
              }
            ]
          },
          {
            model: RealtimeNamespace,
            as: 'realtimeNamespaces',
            required: false,
            include: [
              { model: RealtimeEventHandler, as: 'eventHandlers', required: false },
              {
                model: ApiGatewayAuthMethod,
                as: 'authMethods',
                through: { attributes: ['sort_order'] },
                required: false
              }
            ]
          }
        ],
        order: [
          [{ model: ApiGatewayRoute }, 'sort_order', 'ASC'],
          [{ model: ApiGatewayRoute }, 'created_at', 'ASC']
        ]
      })
    ])

    // Update default gateway domain from DB (overrides env var)
    if (domainSetting && domainSetting.setting_value) {
      defaultGatewayDomain = domainSetting.setting_value as string
    }

    const newCustomDomainMap: Record<string, ProjectConfig> = {}
    const newProjectSlugMap: Record<string, ProjectConfig> = {}

    for (const config of configs) {
      // Skip gateways whose project has been deactivated
      if (!config.Project.is_active) continue

      const projectSlug = config.Project.slug as string // Virtual field on Project model
      const customDomain = config.custom_domain as string | undefined

      // Ensure project entry exists in slug map
      // Build realtime namespace entries for this config
      const activeNamespaces = ((config as any).realtimeNamespaces || []).filter((ns: any) => ns.is_active) as any[]

      const realtimeNamespaces: RealtimeNamespaceEntry[] = activeNamespaces.map((ns: any) => {
        const nsAuthMethods: AuthMethodEntry[] = ((ns.authMethods as any[]) || [])
          .slice()
          .sort((a: any, b: any) => {
            const aSort = (a.RealtimeNamespaceAuthMethod?.sort_order as number) || 0
            const bSort = (b.RealtimeNamespaceAuthMethod?.sort_order as number) || 0
            return aSort - bSort
          })
          .map((am: any) => ({ type: am.type as string, config: am.config as Record<string, any> }))

        const eventHandlers: RealtimeEventHandlerEntry[] = ((ns.eventHandlers as any[]) || []).map((eh: any) => ({
          eventName: eh.event_name as string,
          functionId: eh.function_id as string | null
        }))

        return {
          id: ns.id as string,
          namespacePath: ns.namespace_path as string,
          isActive: ns.is_active as boolean,
          authLogic: (ns.auth_logic as string) || 'or',
          eventHandlers,
          authMethods: nsAuthMethods
        }
      })

      if (!newProjectSlugMap[projectSlug]) {
        newProjectSlugMap[projectSlug] = {
          projectId: config.project_id as string,
          projectSlug,
          configId: config.id as string,
          routes: [],
          realtimeNamespaces
        }
      } else {
        newProjectSlugMap[projectSlug].realtimeNamespaces = realtimeNamespaces
      }

      // Ensure project entry exists in custom domain map (if domain is set)
      if (customDomain) {
        const domainKey = normalizeHostname(customDomain)
        if (!newCustomDomainMap[domainKey]) {
          newCustomDomainMap[domainKey] = {
            projectId: config.project_id as string,
            projectSlug,
            configId: config.id as string,
            routes: [],
            realtimeNamespaces
          }
        } else {
          newCustomDomainMap[domainKey].realtimeNamespaces = realtimeNamespaces
        }
      }

      // Iterate only active routes (filter in JS to avoid LEFT JOIN / WHERE ambiguity)
      const activeRoutes = ((config.ApiGatewayRoutes as any[]) || []).filter((r: any) => r.is_active)

      for (const route of activeRoutes) {
        const settings = (route.settings as Record<string, any>) || {}

        // Auth methods are fetched via belongsToMany; sort by junction table sort_order
        const authMethods: AuthMethodEntry[] = ((route.authMethods as any[]) || [])
          .slice()
          .sort((a: any, b: any) => {
            const aSort = (a.ApiGatewayRouteAuthMethod?.sort_order as number) || 0
            const bSort = (b.ApiGatewayRouteAuthMethod?.sort_order as number) || 0
            return aSort - bSort
          })
          .map((am: any) => ({ type: am.type as string, config: am.config as Record<string, any> }))

        const routeEntry: RouteEntry = {
          id: route.id as string,
          routePath: route.route_path as string,
          functionId: route.function_id as string,
          allowedMethods: (route.allowed_methods as string[]) || ['GET', 'POST'],
          sortOrder: route.sort_order as number,
          matchFn: compilePattern(route.route_path as string),
          corsSettings: {
            enabled: (settings.cors_enabled as boolean) || false,
            allowedOrigins: (settings.cors_allowed_origins as string[]) || [],
            allowedHeaders: (settings.cors_allowed_headers as string[]) || [],
            exposeHeaders: (settings.cors_expose_headers as string[]) || [],
            maxAge: (settings.cors_max_age as number) || 86400,
            allowCredentials: (settings.cors_allow_credentials as boolean) || false
          },
          authMethods,
          authLogic: (route.auth_logic as string) || 'or'
        }

        newProjectSlugMap[projectSlug].routes.push(routeEntry)
        if (customDomain) {
          newCustomDomainMap[normalizeHostname(customDomain)].routes.push(routeEntry)
        }
      }
    }

    customDomainMap = newCustomDomainMap
    projectSlugMap = newProjectSlugMap
    lastRefreshed = new Date()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[RouteCache] Failed to refresh cache:', message)
    // Keep existing cache on failure
  }
}

/**
 * Start the periodic cache refresh.
 */
function start(intervalMs = 30000): void {
  if (refreshTimer) return
  void refresh() // Initial load
  refreshTimer = setInterval(() => void refresh(), intervalMs)
  console.log(`[RouteCache] Started with ${intervalMs}ms refresh interval`)
}

/**
 * Stop the periodic refresh.
 */
function stop(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

/**
 * Force an immediate cache refresh.
 */
async function forceRefresh(): Promise<void> {
  await refresh()
}

/**
 * Resolve an incoming request to a matched route.
 *
 * @param hostname         - The request Host header (without port)
 * @param requestPath      - The full request path
 * @param gatewayDomain    - The configured default gateway domain
 */
function resolveRoute(hostname: string, requestPath: string, gatewayDomain: string): ResolvedRoute | null {
  let projectConfig: ProjectConfig | null = null
  let pathToMatch = requestPath

  // 1. Try custom domain lookup
  const normalizedHost = normalizeHostname(hostname)
  if (customDomainMap[normalizedHost]) {
    projectConfig = customDomainMap[normalizedHost]
    pathToMatch = requestPath
  }

  // 2. Try default gateway domain: strip /<projectSlug> prefix
  if (!projectConfig && gatewayDomain) {
    const normalizedDomain = normalizeHostname(gatewayDomain)
    if (normalizedHost === normalizedDomain) {
      const parts = requestPath.split('/').filter(Boolean)
      if (parts.length >= 1) {
        const slug = parts[0]
        if (projectSlugMap[slug]) {
          projectConfig = projectSlugMap[slug]
          pathToMatch = '/' + parts.slice(1).join('/')
          if (!pathToMatch) pathToMatch = '/'
        }
      }
    }
  }

  if (!projectConfig) return null

  // 3. Match routes (already sorted by sort_order ascending)
  for (const route of projectConfig.routes) {
    if (!route.matchFn) continue
    const result = route.matchFn(pathToMatch)
    if (result) {
      const pathSuffix = pathToMatch.slice(result.path.length) || ''
      return {
        projectConfig,
        route,
        params: result.params,
        pathSuffix
      }
    }
  }

  return null
}

/**
 * Resolve a Socket.IO namespace path to a namespace entry for a given hostname.
 *
 * @param hostname      - The request Host header (without port)
 * @param namespacePath - The full Socket.IO namespace path (e.g. "/myproject/chat")
 * @param gatewayDomain - The configured default gateway domain
 */
function resolveRealtimeNamespace(
  hostname: string,
  namespacePath: string,
  gatewayDomain: string
): { projectConfig: ProjectConfig; namespace: RealtimeNamespaceEntry } | null {
  let projectConfig: ProjectConfig | null = null

  const normalizedHost = normalizeHostname(hostname)

  // Try custom domain lookup — namespace path is absolute (e.g. "/chat")
  if (customDomainMap[normalizedHost]) {
    projectConfig = customDomainMap[normalizedHost]
  }

  // Try default gateway domain — namespace path starts with /<slug>/...
  if (!projectConfig && gatewayDomain) {
    const normalizedDomain = normalizeHostname(gatewayDomain)
    if (normalizedHost === normalizedDomain) {
      const parts = namespacePath.split('/').filter(Boolean)
      if (parts.length >= 1) {
        const slug = parts[0]
        if (projectSlugMap[slug]) {
          projectConfig = projectSlugMap[slug]
        }
      }
    }
  }

  if (!projectConfig) return null

  for (const ns of projectConfig.realtimeNamespaces) {
    // Full path for slug-based: /<slug>/<ns.namespacePath stripped leading slash>
    const expectedPath = gatewayDomain
      ? `/${projectConfig.projectSlug}/${ns.namespacePath.replace(/^\//, '')}`
      : ns.namespacePath
    if (namespacePath === expectedPath || namespacePath === ns.namespacePath) {
      return { projectConfig, namespace: ns }
    }
  }

  return null
}

function getDefaultDomain(): string {
  return defaultGatewayDomain
}

function getStatus(): CacheStatus {
  return {
    lastRefreshed,
    projectCount: Object.keys(projectSlugMap).length
  }
}

const routeCache = { start, stop, forceRefresh, resolveRoute, resolveRealtimeNamespace, getDefaultDomain, getStatus }
export default routeCache
