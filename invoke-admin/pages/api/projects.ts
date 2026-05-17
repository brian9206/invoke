import { NextApiResponse } from 'next'
import { Op } from 'sequelize'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { name, slug } = req.query
  const userId = req.user?.id

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { Project } = database.models

    // Get user's accessible projects
    const userProjects = await getUserProjects(userId)
    const projectIds = userProjects.map(p => p.id)

    if (projectIds.length === 0) {
      return res.status(200).json([])
    }

    const where: any = { id: { [Op.in]: projectIds } }

    if (slug) {
      where.slug = slug as string
    } else if (name) {
      where.name = name as string
    }

    const projects = await Project.findAll({
      where,
      attributes: ['id', 'name', 'slug', 'description', 'is_active'],
      order: [['created_at', 'DESC']]
    })

    res.status(200).json(projects.map((p: any) => p.get({ plain: true })))
  } catch (error) {
    console.error('Error fetching projects:', error)
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
}

export default withAuthOrApiKeyAndMethods(['GET'])(handler)
