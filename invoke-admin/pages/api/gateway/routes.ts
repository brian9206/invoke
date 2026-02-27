import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: any) {
  const projectId = req.query.projectId as string

  if (!projectId) {
    return res.status(400).json(createResponse(false, null, 'projectId query parameter is required', 400))
  }

  const userId = req.user!.id
  const isAdmin = req.user!.isAdmin

  // Check project access
  const access = await checkProjectAccess(userId, projectId, isAdmin)
  if (!access.allowed) {
    return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
  }

  if (req.method === 'GET') {
    const result = await database.query(
      `SELECT
         gr.id,
         gr.route_path,
         gr.function_id,
         gr.allowed_methods,
         gr.sort_order,
         gr.is_active,
         gr.auth_logic,
         gr.created_at,
         gr.updated_at,
         f.name AS function_name,
         gs.cors_enabled,
         gs.cors_allowed_origins,
         gs.cors_allowed_headers,
         gs.cors_expose_headers,
         gs.cors_max_age,
         gs.cors_allow_credentials,
         COALESCE(
           json_agg(
             json_build_object('id', am.id, 'name', am.name, 'type', am.type)
             ORDER BY ram.sort_order ASC, am.name ASC
           ) FILTER (WHERE am.id IS NOT NULL),
           '[]'
         ) AS auth_methods
       FROM api_gateway_configs gc
       JOIN api_gateway_routes gr ON gr.gateway_config_id = gc.id
       LEFT JOIN api_gateway_route_settings gs ON gs.route_id = gr.id
       LEFT JOIN functions f ON f.id = gr.function_id
       LEFT JOIN api_gateway_route_auth_methods ram ON ram.route_id = gr.id
       LEFT JOIN api_gateway_auth_methods am ON am.id = ram.auth_method_id
       WHERE gc.project_id = $1
       GROUP BY gr.id, f.name, gs.cors_enabled, gs.cors_allowed_origins,
                gs.cors_allowed_headers, gs.cors_expose_headers, gs.cors_max_age, gs.cors_allow_credentials,
                gr.auth_logic
       ORDER BY gr.sort_order ASC, gr.created_at ASC`,
      [projectId]
    )

    const routes = result.rows.map((row: any) => ({
      id: row.id,
      routePath: row.route_path,
      functionId: row.function_id,
      functionName: row.function_name,
      allowedMethods: row.allowed_methods,
      sortOrder: row.sort_order,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      corsSettings: {
        enabled: row.cors_enabled ?? false,
        allowedOrigins: row.cors_allowed_origins ?? [],
        allowedHeaders: row.cors_allowed_headers ?? [],
        exposeHeaders: row.cors_expose_headers ?? [],
        maxAge: row.cors_max_age ?? 86400,
        allowCredentials: row.cors_allow_credentials ?? false,
      },
      authMethodIds: (row.auth_methods || []).map((m: any) => m.id),
      authMethodNames: (row.auth_methods || []).map((m: any) => m.name),
      authLogic: (row.auth_logic as string) || 'or',
    }))

    return res.json(createResponse(true, routes, 'Routes retrieved'))
  }

  if (req.method === 'POST') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    const { routePath, functionId, allowedMethods, corsSettings, authMethodIds, authLogic } = req.body

    if (!routePath || typeof routePath !== 'string') {
      return res.status(400).json(createResponse(false, null, 'routePath is required', 400))
    }

    // Ensure gateway config exists for this project (auto-create disabled config if needed)
    const configResult = await database.query(
      `INSERT INTO api_gateway_configs (project_id, enabled)
       VALUES ($1, false)
       ON CONFLICT (project_id) DO UPDATE SET project_id = EXCLUDED.project_id
       RETURNING id`,
      [projectId]
    )
    const configId = configResult.rows[0].id

    // Check max sort_order to append new route at end
    const orderResult = await database.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM api_gateway_routes WHERE gateway_config_id = $1`,
      [configId]
    )
    const nextOrder = orderResult.rows[0].next_order

    // Create route + settings in a transaction
    const route = await database.transaction(async (client: any) => {
      const routeResult = await client.query(
        `INSERT INTO api_gateway_routes
           (gateway_config_id, route_path, function_id, allowed_methods, sort_order, auth_logic)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, route_path, function_id, allowed_methods, sort_order, is_active, auth_logic, created_at`,
        [configId, routePath, functionId || null, allowedMethods || ['GET', 'POST'], nextOrder, authLogic === 'and' ? 'and' : 'or']
      )
      const newRoute = routeResult.rows[0]

      await client.query(
        `INSERT INTO api_gateway_route_settings
           (route_id, cors_enabled, cors_allowed_origins, cors_allowed_headers,
            cors_expose_headers, cors_max_age, cors_allow_credentials)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newRoute.id,
          corsSettings?.enabled ?? false,
          corsSettings?.allowedOrigins ?? [],
          corsSettings?.allowedHeaders ?? [],
          corsSettings?.exposeHeaders ?? [],
          corsSettings?.maxAge ?? 86400,
          corsSettings?.allowCredentials ?? false,
        ]
      )

      // Link auth methods (order reflects execution order via sort_order)
      const methodIds: string[] = Array.isArray(authMethodIds) ? authMethodIds : []
      for (let i = 0; i < methodIds.length; i++) {
        await client.query(
          `INSERT INTO api_gateway_route_auth_methods (route_id, auth_method_id, sort_order)
           VALUES ($1, $2, $3) ON CONFLICT (route_id, auth_method_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
          [newRoute.id, methodIds[i], i]
        )
      }

      return newRoute
    })

    return res.status(201).json(createResponse(true, {
      id: route.id,
      routePath: route.route_path,
      functionId: route.function_id,
      allowedMethods: route.allowed_methods,
      sortOrder: route.sort_order,
      isActive: route.is_active,
      createdAt: route.created_at,
    }, 'Route created'))
  }
}

export default withAuthAndMethods(['GET', 'POST'])(handler)
