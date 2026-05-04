import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

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
  const { ApiGatewayConfig, ApiGatewayRoute, ApiGatewayRouteAuthMethod } = database.models
  const ownerCheck = await ApiGatewayRoute.findOne({
    where: { id },
    include: [{ model: ApiGatewayConfig, where: { project_id: projectId }, required: true, attributes: [] }]
  })
  if (!ownerCheck) {
    return res.status(404).json(createResponse(false, null, 'Route not found', 404))
  }

  if (req.method === 'GET') {
    const { ApiGatewayRouteSettings, ApiGatewayAuthMethod, Function: FunctionModel } = database.models
    const routeRecord = (await ApiGatewayRoute.findOne({
      where: { id },
      include: [
        { model: FunctionModel, attributes: ['name'], required: false },
        { model: ApiGatewayRouteSettings, as: 'settings', required: false },
        { model: ApiGatewayAuthMethod, as: 'authMethods', through: { attributes: ['sort_order'] }, required: false }
      ]
    })) as any

    if (!routeRecord) {
      return res.status(404).json(createResponse(false, null, 'Route not found', 404))
    }

    const raw = routeRecord.toJSON()
    const settings = raw.settings || {}
    const authMethods = (raw.authMethods || []).sort((a: any, b: any) => {
      const sortA = a.ApiGatewayRouteAuthMethod?.sort_order ?? 999
      const sortB = b.ApiGatewayRouteAuthMethod?.sort_order ?? 999
      return sortA - sortB || a.name.localeCompare(b.name)
    })

    return res.json(
      createResponse(
        true,
        {
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
        },
        'Route retrieved'
      )
    )
  }

  if (req.method === 'PUT') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    const { routePath, functionId, allowedMethods, isActive, corsSettings, authMethodIds, authLogic } = req.body

    await database.sequelize.transaction(async (t: any) => {
      const { ApiGatewayRouteSettings } = database.models
      if (
        routePath !== undefined ||
        functionId !== undefined ||
        allowedMethods !== undefined ||
        isActive !== undefined ||
        authLogic !== undefined
      ) {
        const routeUpdates: any = {}
        if (routePath !== undefined) routeUpdates.route_path = routePath
        if (functionId !== undefined) routeUpdates.function_id = functionId || null
        if (allowedMethods !== undefined) routeUpdates.allowed_methods = allowedMethods
        if (isActive !== undefined) routeUpdates.is_active = isActive
        if (authLogic !== undefined) routeUpdates.auth_logic = authLogic === 'and' ? 'and' : 'or'
        routeUpdates.updated_at = new Date()
        await ApiGatewayRoute.update(routeUpdates, { where: { id }, transaction: t })
      }

      if (corsSettings !== undefined) {
        const settingUpdates: any = {}
        if (corsSettings.enabled !== undefined) settingUpdates.cors_enabled = corsSettings.enabled
        if (corsSettings.allowedOrigins !== undefined) settingUpdates.cors_allowed_origins = corsSettings.allowedOrigins
        if (corsSettings.allowedHeaders !== undefined) settingUpdates.cors_allowed_headers = corsSettings.allowedHeaders
        if (corsSettings.exposeHeaders !== undefined) settingUpdates.cors_expose_headers = corsSettings.exposeHeaders
        if (corsSettings.maxAge !== undefined) settingUpdates.cors_max_age = corsSettings.maxAge
        if (corsSettings.allowCredentials !== undefined)
          settingUpdates.cors_allow_credentials = corsSettings.allowCredentials

        if (Object.keys(settingUpdates).length > 0) {
          settingUpdates.updated_at = new Date()
          await ApiGatewayRouteSettings.update(settingUpdates, { where: { route_id: id }, transaction: t })
        }
      }

      if (authMethodIds !== undefined) {
        // Replace all auth method associations
        await ApiGatewayRouteAuthMethod.destroy({ where: { route_id: id }, transaction: t })
        const methodIds: string[] = Array.isArray(authMethodIds) ? authMethodIds : []
        for (let i = 0; i < methodIds.length; i++) {
          await ApiGatewayRouteAuthMethod.upsert(
            { route_id: id, auth_method_id: methodIds[i], sort_order: i },
            { transaction: t }
          )
        }
      }
    })

    return res.json(createResponse(true, null, 'Route updated'))
  }

  if (req.method === 'DELETE') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    await ApiGatewayRoute.destroy({ where: { id } })
    return res.json(createResponse(true, null, 'Route deleted'))
  }
}

export default withAuthAndMethods(['GET', 'PUT', 'DELETE'])(handler)
