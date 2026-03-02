const { match } = require('path-to-regexp');
const database = require('./database');

/**
 * In-memory route cache for the API Gateway.
 *
 * Refreshes every CACHE_REFRESH_INTERVAL ms (default 30s).
 *
 * Two lookup maps are maintained:
 *   - customDomainMap[hostname]  → { projectId, projectSlug, routes[] }
 *   - projectSlugMap[slug]       → { projectId, projectSlug, routes[] }
 *
 * Each route entry includes:
 *   { id, routePath, functionId, allowedMethods, sortOrder, matchFn, corsSettings, authMethods }
 *
 * authMethods is an array of { type, config } objects (OR logic at auth time).
 *
 * Route resolution: resolveRoute(hostname, path, defaultGatewayDomain)
 *   1. Check customDomainMap[hostname]
 *   2. Strip default gateway domain prefix to find project slug
 *   3. Iterate routes sorted by sortOrder; first match wins
 */

let customDomainMap = {};
let projectSlugMap = {};
let defaultGatewayDomain = '';
let refreshTimer = null;
let lastRefreshed = null;

/**
 * Strip protocol and port from a domain/URL value so it can be used as a
 * hostname-only map key (e.g. "http://localhost:3002" → "localhost").
 */
function normalizeHostname(value) {
  return (value || '').replace(/^https?:\/\//, '').toLowerCase().split(':')[0];
}

/**
 * Compile a route path pattern to a path-to-regexp match function.
 * Returns null if the pattern is invalid.
 */
function compilePattern(routePath) {
  try {
    // end: false → treat route as a prefix so /test matches /test/abc/def
    return match(routePath, { decode: decodeURIComponent, end: false });
  } catch (err) {
    console.warn(`[RouteCache] Failed to compile pattern "${routePath}":`, err.message);
    return null;
  }
}

/**
 * Fetch all enabled gateways + routes + settings from the database and rebuild maps.
 */
async function refresh() {
  try {
    const {
      GlobalSetting,
      ApiGatewayConfig,
      ApiGatewayRoute,
      ApiGatewayRouteSettings,
      ApiGatewayAuthMethod,
      Project,
    } = database.models;

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
                required: false,
              },
            ],
          },
        ],
        order: [
          [{ model: ApiGatewayRoute }, 'sort_order', 'ASC'],
          [{ model: ApiGatewayRoute }, 'created_at', 'ASC'],
        ],
      }),
    ]);

    // Update default gateway domain from DB (overrides env var)
    if (domainSetting && domainSetting.setting_value) {
      defaultGatewayDomain = domainSetting.setting_value;
    }

    const newCustomDomainMap = {};
    const newProjectSlugMap = {};

    for (const config of configs) {
      const projectSlug = config.Project.slug; // Virtual field on Project model
      const customDomain = config.custom_domain;

      // Ensure project entry exists in slug map
      if (!newProjectSlugMap[projectSlug]) {
        newProjectSlugMap[projectSlug] = {
          projectId: config.project_id,
          projectSlug,
          configId: config.id,
          routes: [],
        };
      }

      // Ensure project entry exists in custom domain map (if domain is set)
      if (customDomain) {
        const domainKey = normalizeHostname(customDomain);
        if (!newCustomDomainMap[domainKey]) {
          newCustomDomainMap[domainKey] = {
            projectId: config.project_id,
            projectSlug,
            configId: config.id,
            routes: [],
          };
        }
      }

      // Iterate only active routes (filter in JS to avoid LEFT JOIN / WHERE ambiguity)
      const activeRoutes = (config.ApiGatewayRoutes || []).filter(r => r.is_active);

      for (const route of activeRoutes) {
        const settings = route.settings || {};

        // Auth methods are fetched via belongsToMany; sort by junction table sort_order
        const authMethods = (route.authMethods || [])
          .slice()
          .sort((a, b) => {
            const aSort = (a.ApiGatewayRouteAuthMethod && a.ApiGatewayRouteAuthMethod.sort_order) || 0;
            const bSort = (b.ApiGatewayRouteAuthMethod && b.ApiGatewayRouteAuthMethod.sort_order) || 0;
            return aSort - bSort;
          })
          .map(am => ({ type: am.type, config: am.config }));

        const routeEntry = {
          id: route.id,
          routePath: route.route_path,
          functionId: route.function_id,
          allowedMethods: route.allowed_methods || ['GET', 'POST'],
          sortOrder: route.sort_order,
          matchFn: compilePattern(route.route_path),
          corsSettings: {
            enabled: settings.cors_enabled || false,
            allowedOrigins: settings.cors_allowed_origins || [],
            allowedHeaders: settings.cors_allowed_headers || [],
            exposeHeaders: settings.cors_expose_headers || [],
            maxAge: settings.cors_max_age || 86400,
            allowCredentials: settings.cors_allow_credentials || false,
          },
          authMethods,
          authLogic: route.auth_logic || 'or',
        };

        newProjectSlugMap[projectSlug].routes.push(routeEntry);
        if (customDomain) {
          newCustomDomainMap[normalizeHostname(customDomain)].routes.push(routeEntry);
        }
      }
    }

    customDomainMap = newCustomDomainMap;
    projectSlugMap = newProjectSlugMap;
    lastRefreshed = new Date();
  } catch (err) {
    console.error('[RouteCache] Failed to refresh cache:', err.message);
    // Keep existing cache on failure
  }
}

/**
 * Start the periodic cache refresh.
 */
function start(intervalMs = 30000) {
  if (refreshTimer) return;
  refresh(); // Initial load
  refreshTimer = setInterval(refresh, intervalMs);
  console.log(`[RouteCache] Started with ${intervalMs}ms refresh interval`);
}

/**
 * Stop the periodic refresh.
 */
function stop() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * Force an immediate cache refresh.
 */
async function forceRefresh() {
  await refresh();
}

/**
 * Resolve an incoming request to a matched route.
 *
 * @param {string} hostname         - The request Host header (without port)
 * @param {string} requestPath      - The full request path
 * @param {string} defaultGatewayDomain - The configured default gateway domain
 * @returns {{ projectConfig, route, params } | null}
 */
function resolveRoute(hostname, requestPath, defaultGatewayDomain) {
  let projectConfig = null;
  let pathToMatch = requestPath;

  // 1. Try custom domain lookup
  const normalizedHost = normalizeHostname(hostname);
  if (customDomainMap[normalizedHost]) {
    projectConfig = customDomainMap[normalizedHost];
    pathToMatch = requestPath;
  }

  // 2. Try default gateway domain: strip /<projectSlug> prefix
  if (!projectConfig && defaultGatewayDomain) {
    const normalizedDomain = normalizeHostname(defaultGatewayDomain);
    if (normalizedHost === normalizedDomain) {
      // Path format: /<projectSlug>/<rest>
      const parts = requestPath.split('/').filter(Boolean);
      if (parts.length >= 1) {
        const slug = parts[0];
        if (projectSlugMap[slug]) {
          projectConfig = projectSlugMap[slug];
          pathToMatch = '/' + parts.slice(1).join('/');
          if (!pathToMatch) pathToMatch = '/';
        }
      }
    }
  }

  if (!projectConfig) return null;

  // 3. Match routes (already sorted by sort_order ascending)
  for (const route of projectConfig.routes) {
    if (!route.matchFn) continue;
    const result = route.matchFn(pathToMatch);
    if (result) {
      // pathSuffix = the part of the path not consumed by the route pattern
      // e.g. route "/test", request "/test/abc/def" → pathSuffix = "/abc/def"
      const pathSuffix = pathToMatch.slice(result.path.length) || '';
      return {
        projectConfig,
        route,
        params: result.params || {},
        pathSuffix,
      };
    }
  }

  return null;
}

module.exports = { start, stop, forceRefresh, resolveRoute, getDefaultDomain: () => defaultGatewayDomain, getStatus: () => ({ lastRefreshed, projectCount: Object.keys(projectSlugMap).length }) };
