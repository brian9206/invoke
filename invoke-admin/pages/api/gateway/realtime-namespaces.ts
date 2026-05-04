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

  const access = await checkProjectAccess(userId, projectId, isAdmin)
  if (!access.allowed) {
    return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
  }

  const { ApiGatewayConfig, RealtimeNamespace, RealtimeEventHandler, ApiGatewayAuthMethod } = database.models

  if (req.method === 'GET') {
    const cfg = await ApiGatewayConfig.findOne({ where: { project_id: projectId }, attributes: ['id'] })
    if (!cfg) {
      return res.json(createResponse(true, [], 'No namespaces found'))
    }

    const namespaces = (await RealtimeNamespace.findAll({
      where: { gateway_config_id: cfg.id },
      include: [
        { model: RealtimeEventHandler, as: 'eventHandlers', required: false },
        {
          model: ApiGatewayAuthMethod,
          as: 'authMethods',
          through: { attributes: ['sort_order'] },
          required: false
        }
      ],
      order: [['created_at', 'ASC']]
    })) as any[]

    const result = namespaces.map((ns: any) => {
      const raw = ns.toJSON()
      const authMethods = (raw.authMethods || []).sort((a: any, b: any) => {
        const sortA = a.RealtimeNamespaceAuthMethod?.sort_order ?? 999
        const sortB = b.RealtimeNamespaceAuthMethod?.sort_order ?? 999
        return sortA - sortB
      })
      return {
        id: raw.id,
        namespacePath: raw.namespace_path,
        isActive: raw.is_active,
        authLogic: raw.auth_logic || 'or',
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
        eventHandlers: (raw.eventHandlers || []).map((eh: any) => ({
          id: eh.id,
          eventName: eh.event_name,
          functionId: eh.function_id
        })),
        authMethodIds: authMethods.map((m: any) => m.id),
        authMethodNames: authMethods.map((m: any) => m.name)
      }
    })

    return res.json(createResponse(true, result, 'Namespaces retrieved'))
  }

  if (req.method === 'POST') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    const { namespacePath, isActive, authLogic, eventHandlers, authMethodIds } = req.body

    if (!namespacePath || typeof namespacePath !== 'string' || !namespacePath.trim()) {
      return res.status(400).json(createResponse(false, null, 'namespacePath is required', 400))
    }

    const normalizedPath = namespacePath.startsWith('/') ? namespacePath.trim() : `/${namespacePath.trim()}`

    const [cfg] = await ApiGatewayConfig.findOrCreate({
      where: { project_id: projectId },
      defaults: { enabled: false }
    })

    const { RealtimeNamespaceAuthMethod } = database.models

    const ns = await database.sequelize.transaction(async (t: any) => {
      const newNs = await RealtimeNamespace.create(
        {
          gateway_config_id: cfg.id,
          namespace_path: normalizedPath,
          is_active: isActive !== undefined ? isActive : true,
          auth_logic: authLogic === 'and' ? 'and' : 'or'
        },
        { transaction: t }
      )

      const handlers: any[] = Array.isArray(eventHandlers) ? eventHandlers : []
      for (const eh of handlers) {
        if (!eh.eventName || typeof eh.eventName !== 'string') continue
        await RealtimeEventHandler.create(
          {
            realtime_namespace_id: newNs.id,
            event_name: eh.eventName.trim(),
            function_id: eh.functionId || null
          },
          { transaction: t }
        )
      }

      const methodIds: string[] = Array.isArray(authMethodIds) ? authMethodIds : []
      for (let i = 0; i < methodIds.length; i++) {
        await RealtimeNamespaceAuthMethod.upsert(
          { realtime_namespace_id: newNs.id, auth_method_id: methodIds[i], sort_order: i },
          { transaction: t }
        )
      }

      return newNs.get({ plain: true })
    })

    return res.status(201).json(createResponse(true, { id: ns.id }, 'Namespace created'))
  }
}

export default withAuthAndMethods(['GET', 'POST'])(handler)
