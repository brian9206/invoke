import { Op, literal } from 'sequelize'
import { v4 as uuidv4 } from 'uuid'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
import { createResponse, generateApiKey } from '@/lib/utils'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: any) {
  if (req.method === 'GET') {
    const { projectId } = req.query
    const { Function: FunctionModel, FunctionVersion, User, Project, ProjectMembership } = database.models
    let fns: any[]

    if (req.user?.isAdmin && (projectId === 'system' || !projectId)) {
      fns = await (FunctionModel as any).findAll({
        include: [
          { model: FunctionVersion, as: 'activeVersion', attributes: ['version', 'file_size'], required: false },
          { model: User, as: 'deployedBy', attributes: ['username'], required: false },
          { model: Project, attributes: ['name'], required: false },
        ],
        order: [
          [literal('"functions"."group_id" NULLS LAST')],
          ['sort_order', 'ASC'],
          ['created_at', 'DESC'],
        ],
      })
    } else {
      // Regular users or project-specific query
      let projectIds: string[] = []
      if (projectId && projectId !== 'system') {
        // Specific project requested - verify access
        const userProjects = await getUserProjects(req.user!.id)
        const hasAccess = req.user?.isAdmin || userProjects.some(p => p.id === projectId)
        if (!hasAccess) {
          return res.status(403).json(createResponse(false, null, 'Access denied to this project', 403))
        }
        projectIds = [projectId as string]
      } else {
        // Get all user's projects
        const userProjects = await getUserProjects(req.user!.id)
        projectIds = userProjects.map(p => p.id)
      }
      if (projectIds.length === 0) {
        return res.status(200).json(createResponse(true, [], 'No functions found'))
      }
      fns = await (FunctionModel as any).findAll({
        where: { project_id: { [Op.in]: projectIds } },
        include: [
          { model: FunctionVersion, as: 'activeVersion', attributes: ['version', 'file_size'], required: false },
          { model: User, as: 'deployedBy', attributes: ['username'], required: false },
          {
            model: Project, attributes: ['name'], required: false,
            include: [{ model: ProjectMembership, attributes: ['role'], where: { user_id: req.user!.id }, required: false }],
          },
        ],
        order: [
          [literal('"functions"."group_id" NULLS LAST')],
          ['sort_order', 'ASC'],
          ['created_at', 'DESC'],
        ],
      })
    }

    const functions = fns.map((fn: any) => {
      const raw = fn.toJSON()
      const result: any = { ...raw }
      result.active_version = raw.activeVersion?.version ?? null
      result.file_size = raw.activeVersion?.file_size ?? null
      result.deployed_by_username = raw.deployedBy?.username ?? null
      result.project_name = raw.Project?.name ?? null
      if (raw.Project?.ProjectMemberships) {
        result.user_role = raw.Project.ProjectMemberships[0]?.role ?? null
      }
      delete result.activeVersion
      delete result.deployedBy
      delete result.Project
      return result
    })

    return res.status(200).json(createResponse(true, functions, 'Functions retrieved successfully'))

  } else if (req.method === 'POST') {
    // Create function metadata (code uploaded separately via versions endpoint)
    const { name, description, project_id, requires_api_key } = req.body

    if (!name || !project_id) {
      return res.status(400).json(createResponse(false, null, 'Name and project_id are required', 400))
    }

    // Check project access for non-admins
    if (!req.user?.isAdmin) {
      const userProjects = await getUserProjects(req.user!.id)
      const hasAccess = userProjects.some(p => p.id === project_id)
      if (!hasAccess) {
        return res.status(403).json(createResponse(false, null, 'Access denied to this project', 403))
      }
    }

    // Check if function name already exists
    const { Function: FunctionModel } = database.models;
    const existing = await FunctionModel.findOne({ where: { name }, attributes: ['id'] });

    if (existing) {
      return res.status(409).json(createResponse(false, null, `Function with name "${name}" already exists`, 409))
    }

    // Generate function ID and API key if needed
    const functionId = uuidv4()
    const apiKey = requires_api_key ? generateApiKey() : null

    // Create function
    const fn = await FunctionModel.create({
      id: functionId,
      name,
      description: description || '',
      deployed_by: req.user!.id,
      requires_api_key: requires_api_key || false,
      api_key: apiKey,
      is_active: false,
      project_id
    });

    return res.status(201).json(createResponse(true, fn.get({ plain: true }), 'Function created successfully', 201))
  }
}

export default withAuthOrApiKeyAndMethods(['GET', 'POST'])(handler)