import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import { Op } from 'sequelize'

async function handler(req: AuthenticatedRequest, res: any) {
  const { id } = req.query as { id: string }

  if (!id || typeof id !== 'string') {
    return res.status(400).json(createResponse(false, null, 'Group ID is required', 400))
  }

  const { FunctionGroup } = database.models
  const group = await FunctionGroup.findByPk(id)
  if (!group) {
    return res.status(404).json(createResponse(false, null, 'Group not found', 404))
  }

  // Verify project access
  const access = await checkProjectAccess(req.user!.id, group.project_id, req.user!.isAdmin)
  if (!access.allowed) {
    return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
  }
  if (!access.canWrite) {
    return res.status(403).json(createResponse(false, null, 'Insufficient permissions', 403))
  }

  if (req.method === 'PATCH') {
    const { name } = req.body
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json(createResponse(false, null, 'Group name is required', 400))
    }
    // Rename only changes the last segment — slashes are not allowed
    const newSegment = name.trim()
    if (newSegment.includes('/')) {
      return res.status(400).json(createResponse(false, null, 'Group name cannot contain /', 400))
    }
    if (newSegment.length > 100) {
      return res.status(400).json(createResponse(false, null, 'Group name must be 100 characters or fewer', 400))
    }

    const oldFullPath: string = group.name
    const lastSlash = oldFullPath.lastIndexOf('/')
    const newFullPath = lastSlash === -1 ? newSegment : `${oldFullPath.slice(0, lastSlash)}/${newSegment}`
    const projectId: string = group.project_id

    try {
      await database.sequelize.transaction(async (t: any) => {
        // Cascade-rename all descendants (names starting with "oldFullPath/")
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
        await group.update({ name: newFullPath, updated_at: new Date() }, { transaction: t })
      })
      return res.status(200).json(createResponse(true, group.get({ plain: true }), 'Group updated successfully'))
    } catch (err: any) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json(createResponse(false, null, `A group named "${newFullPath}" already exists in this project`, 409))
      }
      throw err
    }
  }

  if (req.method === 'DELETE') {
    const fullPath: string = group.name
    const projectId: string = group.project_id

    await database.sequelize.transaction(async (t: any) => {
      // Find all descendant groups
      const descendants = await FunctionGroup.findAll({
        where: {
          project_id: projectId,
          name: { [Op.like]: `${fullPath}/%` },
        },
        attributes: ['id'],
        transaction: t,
      })
      const descendantIds = descendants.map((d: any) => d.id)
      const allIds = [...descendantIds, group.id]

      // Nullify group_id on functions belonging to any of these groups
      const { Function: FunctionModel } = database.models
      await FunctionModel.update(
        { group_id: null },
        { where: { group_id: allIds }, transaction: t }
      )

      // Delete descendants then the group itself
      if (descendantIds.length > 0) {
        await FunctionGroup.destroy({ where: { id: descendantIds }, transaction: t })
      }
      await group.destroy({ transaction: t })
    })

    return res.status(200).json(createResponse(true, null, 'Group deleted successfully'))
  }
}

export default withAuthAndMethods(['PATCH', 'DELETE'])(handler)
