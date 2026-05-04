import { NextApiResponse } from 'next'
import { adminRequired, AuthenticatedRequest } from '@/lib/middleware'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Project ID is required' })
  }

  switch (req.method) {
    case 'GET':
      return await getProject(id, res)
    default:
      return res.status(405).json({ error: 'Method not allowed' })
  }
}

async function getProject(id: string, res: NextApiResponse) {
  try {
    const { Project, ProjectMembership, Function: FunctionModel, User } = database.models

    const project = await Project.findByPk(id, {
      include: [{ model: User, as: 'creator', attributes: ['username'] }]
    })

    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const [memberCount, functionCount] = await Promise.all([
      ProjectMembership.count({ where: { project_id: id } }),
      FunctionModel.count({ where: { project_id: id } })
    ])

    const plain = project.get({ plain: true })

    res.json({
      success: true,
      data: {
        ...plain,
        created_by_username: plain.creator?.username ?? null,
        member_count: memberCount,
        function_count: functionCount
      }
    })
  } catch (error) {
    console.error('Error fetching project:', error)
    res.status(500).json({ error: 'Failed to fetch project' })
  }
}

export default adminRequired(handler)
