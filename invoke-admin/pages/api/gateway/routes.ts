import { QueryTypes } from 'sequelize'
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
    const { ApiGatewayConfig, ApiGatewayRoute } = database.models;
    const routeRows = await database.sequelize.query(
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
      { bind: [projectId], type: QueryTypes.SELECT }
    ) as any[];

    const routes = routeRows.map((row: any) => ({
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
    const [cfgPost] = await ApiGatewayConfig.findOrCreate({
      where: { project_id: projectId },
      defaults: { enabled: false }
    });
    const configId = cfgPost.id;

    // Check max sort_order to append new route at end
    const maxOrder = await ApiGatewayRoute.max('sort_order', { where: { gateway_config_id: configId } });
    const nextOrder = ((maxOrder as number) ?? -1) + 1;

    // Create route + settings in a transaction
    const { ApiGatewayRouteSettings, ApiGatewayRouteAuthMethod } = database.models;
    const route = await database.sequelize.transaction(async (t: any) => {
      const newRoute = await ApiGatewayRoute.create({
        gateway_config_id: configId,
        route_path: routePath,
        function_id: functionId || null,
        allowed_methods: allowedMethods || ['GET', 'POST'],
        sort_order: nextOrder,
        auth_logic: authLogic === 'and' ? 'and' : 'or'
      }, { transaction: t });

      await ApiGatewayRouteSettings.create({
        route_id: newRoute.id,
        cors_enabled: corsSettings?.enabled ?? false,
        cors_allowed_origins: corsSettings?.allowedOrigins ?? [],
        cors_allowed_headers: corsSettings?.allowedHeaders ?? [],
        cors_expose_headers: corsSettings?.exposeHeaders ?? [],
        cors_max_age: corsSettings?.maxAge ?? 86400,
        cors_allow_credentials: corsSettings?.allowCredentials ?? false,
      }, { transaction: t });

      // Link auth methods (order reflects execution order via sort_order)
      const methodIds: string[] = Array.isArray(authMethodIds) ? authMethodIds : []
      for (let i = 0; i < methodIds.length; i++) {
        await ApiGatewayRouteAuthMethod.upsert(
          { route_id: newRoute.id, auth_method_id: methodIds[i], sort_order: i },
          { transaction: t }
        );
      }

      return newRoute.get({ plain: true });
    });

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
