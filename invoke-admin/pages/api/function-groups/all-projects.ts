import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: any) {
  if (!req.user?.isAdmin) {
    return res.status(403).json(createResponse(false, null, 'Admin access required', 403))
  }

  const { FunctionGroup, Project } = database.models

  const rows = await FunctionGroup.findAll({
    include: [{ model: Project, attributes: ['name'] }],
    order: [
      [Project, 'name', 'ASC'],
      ['sort_order', 'ASC'],
      ['created_at', 'ASC'],
    ],
    raw: true,
    nest: true,
  })

  // Flatten the nested Project.name into project_name for the frontend
  const groups = rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    project_id: row.project_id,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    project_name: row.Project?.name ?? null,
  }))

  return res.status(200).json(createResponse(true, groups, 'All project groups retrieved'))
}

export default withAuthAndMethods(['GET'])(handler)
