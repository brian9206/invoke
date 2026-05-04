import database from '@/lib/database'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess, checkProjectOwnerAccess } from '@/lib/project-access'
import { createResponse, generateApiKey } from '@/lib/utils'
import { deleteFunction } from '@/lib/delete-utils'

async function handler(req: AuthenticatedRequest, res: any) {
  const { id } = req.query as { id: string }

  if (!id || typeof id !== 'string') {
    return res.status(400).json(createResponse(false, null, 'Function ID is required', 400))
  }

  const userId = req.user!.id

  if (req.method === 'GET') {
    const { Function: FunctionModel, FunctionVersion, Project } = database.models
    const fn = (await FunctionModel.findByPk(id, {
      include: [
        {
          model: FunctionVersion,
          as: 'activeVersion',
          attributes: ['version', 'file_size', 'package_path', 'package_hash', 'created_at'],
          required: false
        },
        {
          model: Project,
          attributes: ['name', 'is_active'],
          required: false
        }
      ]
    })) as any

    if (!fn) {
      return res.status(404).json(createResponse(false, null, 'Function not found', 404))
    }
    if (!req.user?.isAdmin && fn.project_id) {
      const access = await checkProjectDeveloperAccess(req.user!.id, fn.project_id, false)
      if (!access.allowed) {
        return res.status(403).json(createResponse(false, null, 'Access denied to this project', 403))
      }
    }

    const raw = fn.toJSON()
    const functionData = {
      ...raw,
      project_name: raw.Project?.name ?? null,
      project_is_active: raw.Project?.is_active ?? null,
      active_version: raw.activeVersion?.version ?? null,
      file_size: raw.activeVersion?.file_size ?? null,
      package_path: raw.activeVersion?.package_path ?? null,
      package_hash: raw.activeVersion?.package_hash ?? null,
      version_created_at: raw.activeVersion?.created_at ?? null
    }
    delete functionData.Project
    delete functionData.activeVersion

    return res.status(200).json(createResponse(true, functionData, 'Function details retrieved', 200))
  } else if (req.method === 'PATCH') {
    const { Function: FunctionModel, GlobalSetting } = database.models

    const {
      name,
      description,
      requires_api_key,
      is_active,
      group_id,
      sort_order,
      custom_timeout_enabled,
      custom_timeout_seconds,
      custom_memory_enabled,
      custom_memory_mb
    } = req.body

    const fn = (await FunctionModel.findByPk(id)) as any
    if (!fn) {
      return res.status(404).json(createResponse(false, null, 'Function not found', 404))
    }

    if (!req.user?.isAdmin && fn.project_id) {
      const access = await checkProjectDeveloperAccess(userId, fn.project_id, false)
      if (!access.allowed) {
        return res
          .status(403)
          .json(createResponse(false, null, 'Insufficient project permissions to update function', 403))
      }
    }

    const updates: Record<string, unknown> = {}

    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (is_active !== undefined) updates.is_active = is_active
    if (group_id !== undefined) updates.group_id = group_id ?? null
    if (sort_order !== undefined) updates.sort_order = sort_order

    if (requires_api_key !== undefined) {
      updates.requires_api_key = requires_api_key
      if (requires_api_key && !fn.api_key) {
        updates.api_key = generateApiKey()
      }
    }

    if (custom_timeout_enabled !== undefined) updates.custom_timeout_enabled = custom_timeout_enabled

    if (custom_timeout_seconds !== undefined) {
      if (custom_timeout_seconds !== null) {
        const tv = Number(custom_timeout_seconds)
        if (!Number.isInteger(tv) || tv < 10)
          return res
            .status(400)
            .json(createResponse(false, null, 'custom_timeout_seconds must be an integer ≥ 10', 400))
        const maxRow = (await GlobalSetting.findOne({ where: { setting_key: 'execution_max_timeout_seconds' } })) as any
        if (maxRow && tv > parseInt(maxRow.setting_value, 10))
          return res
            .status(400)
            .json(
              createResponse(false, null, `custom_timeout_seconds must be ≤ global max (${maxRow.setting_value}s)`, 400)
            )
      }
      updates.custom_timeout_seconds = custom_timeout_seconds ?? null
    }

    if (custom_memory_enabled !== undefined) updates.custom_memory_enabled = custom_memory_enabled

    if (custom_memory_mb !== undefined) {
      if (custom_memory_mb !== null) {
        const mv = Number(custom_memory_mb)
        if (!Number.isInteger(mv) || mv < 256 || mv % 256 !== 0)
          return res
            .status(400)
            .json(createResponse(false, null, 'custom_memory_mb must be a multiple of 256 and at least 256 MB', 400))
        const maxRow = (await GlobalSetting.findOne({ where: { setting_key: 'execution_max_memory_mb' } })) as any
        if (maxRow && mv > parseInt(maxRow.setting_value, 10))
          return res
            .status(400)
            .json(
              createResponse(false, null, `custom_memory_mb must be ≤ global max (${maxRow.setting_value} MB)`, 400)
            )
      }
      updates.custom_memory_mb = custom_memory_mb ?? null
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json(createResponse(false, null, 'No fields to update', 400))
    }

    await fn.update(updates)
    await fn.reload()

    return res.status(200).json(createResponse(true, fn.toJSON(), 'Function updated successfully', 200))
  } else if (req.method === 'DELETE') {
    // Check project access for non-admins
    if (!req.user?.isAdmin) {
      const { Function: FunctionModel } = database.models
      const fnForDelete = await FunctionModel.findByPk(id, { attributes: ['project_id'] })
      if (!fnForDelete) {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }
      const projectId = fnForDelete.project_id
      if (projectId) {
        const access = await checkProjectDeveloperAccess(userId, projectId, false)
        if (!access.allowed) {
          return res
            .status(403)
            .json(createResponse(false, null, 'Insufficient project permissions to delete function', 403))
        }
      }
    }

    // Use centralized delete helper to remove MinIO packages and DB rows

    try {
      const deletedPackages = await deleteFunction(id)
      return res
        .status(200)
        .json(createResponse(true, null, `Function and ${deletedPackages} associated files deleted successfully`, 200))
    } catch (err) {
      if ((err as any).message === 'Function not found') {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }
      console.error('Error deleting function:', err)
      return res.status(500).json(createResponse(false, null, 'Failed to delete function', 500))
    }
  } else {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }
}

export default withAuthOrApiKeyAndMethods(['GET', 'PATCH', 'DELETE'])(handler)
