import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

const MAX_DEPTH = 5

/** Validate path segments: no empty segments, no leading/trailing spaces per segment. */
function validateSegments(fullPath: string): string | null {
  const segments = fullPath.split('/')
  if (segments.length > MAX_DEPTH) {
    return `Group path exceeds maximum depth of ${MAX_DEPTH}`
  }
  for (const seg of segments) {
    const t = seg.trim()
    if (!t) return 'Group name cannot have empty segments'
    if (t.length > 100) return 'Each group name segment must be 100 characters or fewer'
  }
  return null
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

  // Verify project access
  const access = await checkProjectAccess(req.user!.id, projectId, req.user!.isAdmin)
  if (!access.allowed) {
    return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
  }

  const { FunctionGroup } = database.models

  if (req.method === 'GET') {
    const groups = await FunctionGroup.findAll({
      where: { project_id: projectId },
      order: [['sort_order', 'ASC'], ['created_at', 'ASC']],
      raw: true,
    })
    return res.status(200).json(createResponse(true, groups, 'Groups retrieved successfully'))
  }

  if (req.method === 'POST') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Insufficient permissions to create groups', 403))
    }

    const { name, parentPath } = req.body
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json(createResponse(false, null, 'Group name is required', 400))
    }

    // Build full path: if parentPath provided, prepend it
    const inputPath = name.trim()
    const fullPath = parentPath ? `${String(parentPath).trim()}/${inputPath}` : inputPath

    // Normalize: trim each segment
    const normalizedPath = fullPath.split('/').map((s: string) => s.trim()).join('/')

    const validationError = validateSegments(normalizedPath)
    if (validationError) {
      return res.status(400).json(createResponse(false, null, validationError, 400))
    }

    const segments = normalizedPath.split('/')

    // Compute max sort_order once
    const maxGroup = await FunctionGroup.findOne({
      where: { project_id: projectId },
      order: [['sort_order', 'DESC']],
      attributes: ['sort_order'],
      raw: true,
    })
    let nextSortOrder = maxGroup ? (maxGroup as any).sort_order + 1 : 0

    let lastCreated: any = null
    try {
      // Auto-create each ancestor segment then the leaf
      for (let i = 1; i <= segments.length; i++) {
        const pathSlice = segments.slice(0, i).join('/')
        const [grp, created] = await FunctionGroup.findOrCreate({
          where: { project_id: projectId, name: pathSlice },
          defaults: {
            project_id: projectId,
            name: pathSlice,
            sort_order: nextSortOrder,
            created_at: new Date(),
            updated_at: new Date(),
          },
        })
        if (created) nextSortOrder++
        lastCreated = grp
      }
    } catch (err: any) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json(createResponse(false, null, `A group at path "${normalizedPath}" already exists in this project`, 409))
      }
      throw err
    }

    return res.status(201).json(createResponse(true, lastCreated.get({ plain: true }), 'Group created successfully', 201))
  }
}

export default withAuthAndMethods(['GET', 'POST'])(handler)
