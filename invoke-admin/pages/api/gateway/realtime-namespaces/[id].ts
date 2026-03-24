import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: any) {
  const { id } = req.query as { id: string }
  const projectId = req.query.projectId as string

  if (!id) {
    return res.status(400).json(createResponse(false, null, 'Namespace ID is required', 400))
  }
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

  // Verify namespace belongs to this project
  const ownerCheck = await RealtimeNamespace.findOne({
    where: { id },
    include: [{ model: ApiGatewayConfig, where: { project_id: projectId }, required: true, attributes: [] }],
  })
  if (!ownerCheck) {
    return res.status(404).json(createResponse(false, null, 'Namespace not found', 404))
  }

  if (req.method === 'GET') {
    const ns = await RealtimeNamespace.findOne({
      where: { id },
      include: [
        { model: RealtimeEventHandler, as: 'eventHandlers', required: false },
        {
          model: ApiGatewayAuthMethod,
          as: 'authMethods',
          through: { attributes: ['sort_order'] },
          required: false,
        },
      ],
    }) as any

    if (!ns) {
      return res.status(404).json(createResponse(false, null, 'Namespace not found', 404))
    }

    const raw = ns.toJSON()
    const authMethods = (raw.authMethods || []).sort((a: any, b: any) => {
      const sortA = a.RealtimeNamespaceAuthMethod?.sort_order ?? 999
      const sortB = b.RealtimeNamespaceAuthMethod?.sort_order ?? 999
      return sortA - sortB
    })

    return res.json(createResponse(true, {
      id: raw.id,
      namespacePath: raw.namespace_path,
      isActive: raw.is_active,
      authLogic: raw.auth_logic || 'or',
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      eventHandlers: (raw.eventHandlers || []).map((eh: any) => ({
        id: eh.id,
        eventName: eh.event_name,
        functionId: eh.function_id,
      })),
      authMethodIds: authMethods.map((m: any) => m.id),
      authMethodNames: authMethods.map((m: any) => m.name),
    }, 'Namespace retrieved'))
  }

  if (req.method === 'PUT') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    const { namespacePath, isActive, authLogic, eventHandlers, authMethodIds } = req.body
    const { RealtimeNamespaceAuthMethod } = database.models

    await database.sequelize.transaction(async (t: any) => {
      const nsUpdates: any = {}
      if (namespacePath !== undefined) {
        nsUpdates.namespace_path = namespacePath.startsWith('/') ? namespacePath.trim() : `/${namespacePath.trim()}`
      }
      if (isActive !== undefined) nsUpdates.is_active = isActive
      if (authLogic !== undefined) nsUpdates.auth_logic = authLogic === 'and' ? 'and' : 'or'
      nsUpdates.updated_at = new Date()

      await RealtimeNamespace.update(nsUpdates, { where: { id }, transaction: t })

      if (eventHandlers !== undefined) {
        await RealtimeEventHandler.destroy({ where: { realtime_namespace_id: id }, transaction: t })
        const handlers: any[] = Array.isArray(eventHandlers) ? eventHandlers : []
        for (const eh of handlers) {
          if (!eh.eventName || typeof eh.eventName !== 'string') continue
          await RealtimeEventHandler.create({
            realtime_namespace_id: id,
            event_name: eh.eventName.trim(),
            function_id: eh.functionId || null,
          }, { transaction: t })
        }
      }

      if (authMethodIds !== undefined) {
        await RealtimeNamespaceAuthMethod.destroy({ where: { realtime_namespace_id: id }, transaction: t })
        const methodIds: string[] = Array.isArray(authMethodIds) ? authMethodIds : []
        for (let i = 0; i < methodIds.length; i++) {
          await RealtimeNamespaceAuthMethod.upsert(
            { realtime_namespace_id: id, auth_method_id: methodIds[i], sort_order: i },
            { transaction: t }
          )
        }
      }
    })

    return res.json(createResponse(true, null, 'Namespace updated'))
  }

  if (req.method === 'DELETE') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    await RealtimeNamespace.destroy({ where: { id } })
    return res.json(createResponse(true, null, 'Namespace deleted'))
  }
}

export default withAuthAndMethods(['GET', 'PUT', 'DELETE'])(handler)
