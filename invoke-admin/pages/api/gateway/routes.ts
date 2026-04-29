import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

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
    const {
      ApiGatewayConfig,
      ApiGatewayRoute,
      ApiGatewayRouteSettings,
      ApiGatewayAuthMethod,
      Function: FunctionModel
    } = database.models
    const routeData = (await ApiGatewayRoute.findAll({
      include: [
        { model: ApiGatewayConfig, where: { project_id: projectId }, required: true, attributes: [] },
        { model: FunctionModel, attributes: ['name'], required: false },
        { model: ApiGatewayRouteSettings, as: 'settings', required: false },
        { model: ApiGatewayAuthMethod, as: 'authMethods', through: { attributes: ['sort_order'] }, required: false }
      ],
      order: [
        ['sort_order', 'ASC'],
        ['created_at', 'ASC']
      ]
    })) as any[]

    const routes = routeData.map((route: any) => {
      const raw = route.toJSON()
      const settings = raw.settings || {}
      const authMethods = (raw.authMethods || []).sort((a: any, b: any) => {
        const sortA = a.ApiGatewayRouteAuthMethod?.sort_order ?? 999
        const sortB = b.ApiGatewayRouteAuthMethod?.sort_order ?? 999
        return sortA - sortB || a.name.localeCompare(b.name)
      })
      return {
        id: raw.id,
        routePath: raw.route_path,
        functionId: raw.function_id,
        functionName: raw.Function?.name ?? null,
        allowedMethods: raw.allowed_methods,
        sortOrder: raw.sort_order,
        isActive: raw.is_active,
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
        corsSettings: {
          enabled: settings.cors_enabled ?? false,
          allowedOrigins: settings.cors_allowed_origins ?? [],
          allowedHeaders: settings.cors_allowed_headers ?? [],
          exposeHeaders: settings.cors_expose_headers ?? [],
          maxAge: settings.cors_max_age ?? 86400,
          allowCredentials: settings.cors_allow_credentials ?? false
        },
        authMethodIds: authMethods.map((m: any) => m.id),
        authMethodNames: authMethods.map((m: any) => m.name),
        authLogic: (raw.auth_logic as string) || 'or'
      }
    })

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
    const { ApiGatewayConfig, ApiGatewayRoute } = database.models
    const [cfgPost] = await ApiGatewayConfig.findOrCreate({
      where: { project_id: projectId },
      defaults: { enabled: false }
    })
    const configId = cfgPost.id

    // Check max sort_order to append new route at end
    const maxOrder = await (ApiGatewayRoute as any).max('sort_order', { where: { gateway_config_id: configId } })
    const nextOrder = ((maxOrder as number) ?? -1) + 1

    // Create route + settings in a transaction
    const { ApiGatewayRouteSettings, ApiGatewayRouteAuthMethod } = database.models
    const route = await database.sequelize.transaction(async (t: any) => {
      const newRoute = await ApiGatewayRoute.create(
        {
          gateway_config_id: configId,
          route_path: routePath,
          function_id: functionId || null,
          allowed_methods: allowedMethods || ['GET', 'POST'],
          sort_order: nextOrder,
          auth_logic: authLogic === 'and' ? 'and' : 'or'
        },
        { transaction: t }
      )

      await ApiGatewayRouteSettings.create(
        {
          route_id: newRoute.id,
          cors_enabled: corsSettings?.enabled ?? false,
          cors_allowed_origins: corsSettings?.allowedOrigins ?? [],
          cors_allowed_headers: corsSettings?.allowedHeaders ?? [],
          cors_expose_headers: corsSettings?.exposeHeaders ?? [],
          cors_max_age: corsSettings?.maxAge ?? 86400,
          cors_allow_credentials: corsSettings?.allowCredentials ?? false
        },
        { transaction: t }
      )

      // Link auth methods (order reflects execution order via sort_order)
      const methodIds: string[] = Array.isArray(authMethodIds) ? authMethodIds : []
      for (let i = 0; i < methodIds.length; i++) {
        await ApiGatewayRouteAuthMethod.upsert(
          { route_id: newRoute.id, auth_method_id: methodIds[i], sort_order: i },
          { transaction: t }
        )
      }

      return newRoute.get({ plain: true })
    })

    return res.status(201).json(
      createResponse(
        true,
        {
          id: route.id,
          routePath: route.route_path,
          functionId: route.function_id,
          allowedMethods: route.allowed_methods,
          sortOrder: route.sort_order,
          isActive: route.is_active,
          createdAt: route.created_at
        },
        'Route created'
      )
    )
  }
}

export default withAuthAndMethods(['GET', 'POST'])(handler)
