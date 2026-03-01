import { QueryTypes } from 'sequelize'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: any) {
  const { id } = req.query as { id: string }
  const projectId = req.query.projectId as string

  if (!id) {
    return res.status(400).json(createResponse(false, null, 'Route ID is required', 400))
  }
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

  // Verify route belongs to this project
  const { ApiGatewayConfig, ApiGatewayRoute, ApiGatewayRouteAuthMethod } = database.models;
  const ownerCheck = await ApiGatewayRoute.findOne({
    where: { id },
    include: [{ model: ApiGatewayConfig, where: { project_id: projectId }, required: true, attributes: [] }]
  });
  if (!ownerCheck) {
    return res.status(404).json(createResponse(false, null, 'Route not found', 404))
  }

  if (req.method === 'GET') {
    const [row] = await database.sequelize.query(
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
       FROM api_gateway_routes gr
       LEFT JOIN api_gateway_route_settings gs ON gs.route_id = gr.id
       LEFT JOIN functions f ON f.id = gr.function_id
       LEFT JOIN api_gateway_route_auth_methods ram ON ram.route_id = gr.id
       LEFT JOIN api_gateway_auth_methods am ON am.id = ram.auth_method_id
       WHERE gr.id = $1
       GROUP BY gr.id, f.name, gs.cors_enabled, gs.cors_allowed_origins,
                gs.cors_allowed_headers, gs.cors_expose_headers, gs.cors_max_age, gs.cors_allow_credentials,
                gr.auth_logic`,
      { bind: [id], type: QueryTypes.SELECT }
    ) as any[];

    return res.json(createResponse(true, {
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
    }, 'Route retrieved'))
  }

  if (req.method === 'PUT') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    const { routePath, functionId, allowedMethods, isActive, corsSettings, authMethodIds, authLogic } = req.body

    await database.sequelize.transaction(async (t: any) => {
      if (routePath !== undefined || functionId !== undefined || allowedMethods !== undefined || isActive !== undefined || authLogic !== undefined) {
        const updates: string[] = []
        const values: any[] = []
        let idx = 1

        if (routePath !== undefined) { updates.push(`route_path = $${idx++}`); values.push(routePath) }
        if (functionId !== undefined) { updates.push(`function_id = $${idx++}`); values.push(functionId || null) }
        if (allowedMethods !== undefined) { updates.push(`allowed_methods = $${idx++}`); values.push(allowedMethods) }
        if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); values.push(isActive) }
        if (authLogic !== undefined) { updates.push(`auth_logic = $${idx++}`); values.push(authLogic === 'and' ? 'and' : 'or') }

        updates.push(`updated_at = NOW()`)
        values.push(id)

        await database.sequelize.query(
          `UPDATE api_gateway_routes SET ${updates.join(', ')} WHERE id = $${idx}`,
          { bind: values, transaction: t }
        );
      }

      if (corsSettings !== undefined) {
        const settingUpdates: string[] = []
        const settingValues: any[] = []
        let idx = 1

        if (corsSettings.enabled !== undefined) { settingUpdates.push(`cors_enabled = $${idx++}`); settingValues.push(corsSettings.enabled) }
        if (corsSettings.allowedOrigins !== undefined) { settingUpdates.push(`cors_allowed_origins = $${idx++}`); settingValues.push(corsSettings.allowedOrigins) }
        if (corsSettings.allowedHeaders !== undefined) { settingUpdates.push(`cors_allowed_headers = $${idx++}`); settingValues.push(corsSettings.allowedHeaders) }
        if (corsSettings.exposeHeaders !== undefined) { settingUpdates.push(`cors_expose_headers = $${idx++}`); settingValues.push(corsSettings.exposeHeaders) }
        if (corsSettings.maxAge !== undefined) { settingUpdates.push(`cors_max_age = $${idx++}`); settingValues.push(corsSettings.maxAge) }
        if (corsSettings.allowCredentials !== undefined) { settingUpdates.push(`cors_allow_credentials = $${idx++}`); settingValues.push(corsSettings.allowCredentials) }

        if (settingUpdates.length > 0) {
          settingUpdates.push(`updated_at = NOW()`)
          settingValues.push(id)
          await database.sequelize.query(
            `UPDATE api_gateway_route_settings SET ${settingUpdates.join(', ')} WHERE route_id = $${idx}`,
            { bind: settingValues, transaction: t }
          );
        }
      }

      if (authMethodIds !== undefined) {
        // Replace all auth method associations
        await ApiGatewayRouteAuthMethod.destroy({ where: { route_id: id }, transaction: t });
        const methodIds: string[] = Array.isArray(authMethodIds) ? authMethodIds : []
        for (let i = 0; i < methodIds.length; i++) {
          await ApiGatewayRouteAuthMethod.upsert(
            { route_id: id, auth_method_id: methodIds[i], sort_order: i },
            { transaction: t }
          );
        }
      }
    })

    return res.json(createResponse(true, null, 'Route updated'))
  }

  if (req.method === 'DELETE') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    await ApiGatewayRoute.destroy({ where: { id } });
    return res.json(createResponse(true, null, 'Route deleted'))
  }
}

export default withAuthAndMethods(['GET', 'PUT', 'DELETE'])(handler)
