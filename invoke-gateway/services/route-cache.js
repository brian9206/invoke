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
    // Fetch domain setting and routes in parallel
    const [domainResult, routesResult] = await Promise.all([
      database.query(`SELECT setting_value FROM global_settings WHERE setting_key = 'api_gateway_domain'`),
      database.query(`
      SELECT
        gc.id            AS config_id,
        gc.project_id,
        gc.custom_domain,
        gc.enabled,
        p.name           AS project_name,
        COALESCE(p.slug, lower(regexp_replace(p.name, '[^a-zA-Z0-9]+', '-', 'g'))) AS project_slug,
        gr.id            AS route_id,
        gr.route_path,
        gr.function_id,
        gr.allowed_methods,
        gr.sort_order,
        gr.is_active,
        gs.cors_enabled,
        gs.cors_allowed_origins,
        gs.cors_allowed_headers,
        gs.cors_expose_headers,
        gs.cors_max_age,
        gs.cors_allow_credentials,
        COALESCE(
          json_agg(
            json_build_object('type', am.type, 'config', am.config)
          ) FILTER (WHERE am.id IS NOT NULL),
          '[]'
        ) AS auth_methods
      FROM api_gateway_configs gc
      JOIN projects p ON p.id = gc.project_id
      LEFT JOIN api_gateway_routes gr ON gr.gateway_config_id = gc.id AND gr.is_active = true
      LEFT JOIN api_gateway_route_settings gs ON gs.route_id = gr.id
      LEFT JOIN api_gateway_route_auth_methods ram ON ram.route_id = gr.id
      LEFT JOIN api_gateway_auth_methods am ON am.id = ram.auth_method_id
      WHERE gc.enabled = true
      GROUP BY gc.id, gc.project_id, gc.custom_domain, gc.enabled,
               p.name, p.slug,
               gr.id, gr.route_path, gr.function_id, gr.allowed_methods,
               gr.sort_order, gr.is_active,
               gs.cors_enabled, gs.cors_allowed_origins, gs.cors_allowed_headers,
               gs.cors_expose_headers, gs.cors_max_age, gs.cors_allow_credentials
      ORDER BY gc.id, gr.sort_order ASC, gr.created_at ASC
    `),
    ]);

    // Update default gateway domain from DB (overrides env var)
    if (domainResult.rows.length > 0 && domainResult.rows[0].setting_value) {
      defaultGatewayDomain = domainResult.rows[0].setting_value;
    }

    const result = routesResult;

    const newCustomDomainMap = {};
    const newProjectSlugMap = {};

    for (const row of result.rows) {
      const projectSlug = row.project_slug;
      const customDomain = row.custom_domain;

      // Ensure project entry exists in slug map
      if (!newProjectSlugMap[projectSlug]) {
        newProjectSlugMap[projectSlug] = {
          projectId: row.project_id,
          projectSlug,
          configId: row.config_id,
          routes: [],
        };
      }

      // Ensure project entry exists in custom domain map (if domain is set)
      if (customDomain) {
        const domainKey = normalizeHostname(customDomain);
        if (!newCustomDomainMap[domainKey]) {
          newCustomDomainMap[domainKey] = {
            projectId: row.project_id,
            projectSlug,
            configId: row.config_id,
            routes: [],
          };
        }
      }

      // Add route (if this row has a route)
      if (row.route_id) {
        const routeEntry = {
          id: row.route_id,
          routePath: row.route_path,
          functionId: row.function_id,
          allowedMethods: row.allowed_methods || ['GET', 'POST'],
          sortOrder: row.sort_order,
          matchFn: compilePattern(row.route_path),
          corsSettings: {
            enabled: row.cors_enabled || false,
            allowedOrigins: row.cors_allowed_origins || [],
            allowedHeaders: row.cors_allowed_headers || [],
            exposeHeaders: row.cors_expose_headers || [],
            maxAge: row.cors_max_age || 86400,
            allowCredentials: row.cors_allow_credentials || false,
          },
          authMethods: Array.isArray(row.auth_methods) ? row.auth_methods : [],
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
