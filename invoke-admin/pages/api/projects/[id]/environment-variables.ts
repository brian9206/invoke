import { NextApiResponse } from 'next'
import { withAuth, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { id: projectId } = req.query

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ success: false, message: 'Project ID is required' })
  }

  if (projectId === 'system') {
    return res.status(403).json({ success: false, message: 'Not available for system project' })
  }

  const hasAccess = await checkProjectAccess(req.user!.id, projectId, req.user!.isAdmin)
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: 'Access denied' })
  }

  const { Project, ProjectEnvironmentVariable } = database.models

  const project = await Project.findByPk(projectId, { attributes: ['id'] })
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }

  if (req.method === 'GET') {
    try {
      const rows = await ProjectEnvironmentVariable.findAll({
        where: { project_id: projectId },
        attributes: ['id', 'variable_name', 'variable_value', 'description', 'created_at', 'updated_at'],
        order: [['variable_name', 'ASC']]
      })
      return res.status(200).json({ success: true, data: rows.map((r: any) => r.get({ plain: true })) })
    } catch (error) {
      console.error('Error fetching project environment variables:', error)
      return res.status(500).json({ success: false, message: 'Failed to fetch environment variables' })
    }
  }

  if (req.method === 'PUT') {
    const { variables } = req.body

    if (!Array.isArray(variables)) {
      return res.status(400).json({ success: false, message: 'Variables must be an array' })
    }

    for (const variable of variables) {
      if (!variable.variable_name || typeof variable.variable_name !== 'string') {
        return res.status(400).json({ success: false, message: 'Each variable must have a valid variable_name' })
      }
      if (variable.variable_value === undefined || variable.variable_value === null) {
        return res.status(400).json({ success: false, message: 'Each variable must have a variable_value' })
      }
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(variable.variable_name)) {
        return res.status(400).json({
          success: false,
          message: `Invalid variable name: ${variable.variable_name}. Must contain only letters, numbers, and underscores, and cannot start with a number.`
        })
      }
    }

    try {
      await database.sequelize.transaction(async (t: any) => {
        await ProjectEnvironmentVariable.destroy({ where: { project_id: projectId }, transaction: t })
        for (const variable of variables) {
          await ProjectEnvironmentVariable.create(
            {
              project_id: projectId,
              variable_name: variable.variable_name,
              variable_value: String(variable.variable_value),
              description: variable.description || null
            },
            { transaction: t }
          )
        }
      })
      return res.status(200).json({ success: true, message: 'Environment variables updated successfully' })
    } catch (error) {
      console.error('Error updating project environment variables:', error)
      if ((error as any).name === 'SequelizeUniqueConstraintError' || (error as any).parent?.code === '23505') {
        return res.status(400).json({ success: false, message: 'Duplicate variable name found' })
      }
      return res.status(500).json({ success: false, message: 'Failed to update environment variables' })
    }
  }

  res.setHeader('Allow', ['GET', 'PUT'])
  return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` })
}

export default withAuth(handler)
