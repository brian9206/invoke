import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import { Op } from 'sequelize'

const MAX_DEPTH = 5

interface GroupOrder {
  id: string
  sort_order: number
  /** New parent path for reparenting. Empty string = root level. Undefined = no reparent. */
  parentPath?: string | null
}

interface FunctionOrder {
  id: string
  group_id: string | null
  sort_order: number
}

async function handler(req: AuthenticatedRequest, res: any) {
  const { projectId } = req.query

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json(createResponse(false, null, 'projectId query parameter is required', 400))
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(projectId)) {
    return res.status(400).json(createResponse(false, null, 'Invalid projectId', 400))
  }

  const access = await checkProjectAccess(req.user!.id, projectId, req.user!.isAdmin)
  if (!access.allowed) {
    return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
  }
  if (!access.canWrite) {
    return res.status(403).json(createResponse(false, null, 'Insufficient permissions', 403))
  }

  const { groups, functions: funcs } = req.body as {
    groups?: GroupOrder[]
    functions?: FunctionOrder[]
  }

  // Validate inputs
  if (groups && !Array.isArray(groups)) {
    return res.status(400).json(createResponse(false, null, 'groups must be an array', 400))
  }
  if (funcs && !Array.isArray(funcs)) {
    return res.status(400).json(createResponse(false, null, 'functions must be an array', 400))
  }

  const { FunctionGroup, Function: FunctionModel } = database.models

  await database.sequelize.transaction(async (t: any) => {
    if (groups && groups.length > 0) {
      for (const g of groups) {
        const grp = await FunctionGroup.findOne({
          where: { id: g.id, project_id: projectId },
          transaction: t,
        })
        if (!grp) continue

        const oldFullPath: string = grp.name

        if (g.parentPath !== undefined) {
          // Reparenting: compute new full path
          const oldSegment = oldFullPath.split('/').pop()!
          const newFullPath = g.parentPath ? `${g.parentPath}/${oldSegment}` : oldSegment

          // Validate depth (silently skip if would exceed limit)
          if (newFullPath.split('/').length > MAX_DEPTH) continue

          if (newFullPath !== oldFullPath) {
            // Cascade-rename descendants
            const descendants = await FunctionGroup.findAll({
              where: {
                project_id: projectId,
                name: { [Op.like]: `${oldFullPath}/%` },
              },
              transaction: t,
            })
            for (const desc of descendants) {
              const newDescName = newFullPath + (desc.name as string).slice(oldFullPath.length)
              await desc.update({ name: newDescName, updated_at: new Date() }, { transaction: t })
            }
            await grp.update({ name: newFullPath, sort_order: g.sort_order, updated_at: new Date() }, { transaction: t })
            continue
          }
        }

        await FunctionGroup.update(
          { sort_order: g.sort_order, updated_at: new Date() },
          { where: { id: g.id, project_id: projectId }, transaction: t }
        )
      }
    }

    if (funcs && funcs.length > 0) {
      await Promise.all(
        funcs.map((f) =>
          FunctionModel.update(
            { group_id: f.group_id ?? null, sort_order: f.sort_order },
            { where: { id: f.id, project_id: projectId }, transaction: t }
          )
        )
      )
    }
  })

  return res.status(200).json(createResponse(true, null, 'Reorder saved successfully'))
}

export default withAuthAndMethods(['PUT'])(handler)
