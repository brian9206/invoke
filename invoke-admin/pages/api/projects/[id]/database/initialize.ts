import { NextApiResponse } from 'next'
import { AuthenticatedRequest, withAuth } from '@/lib/middleware'
import { checkProjectOwnerAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import { initializeProjectDatabase } from '@/lib/sql-service-client'

/**
 * Initialize a PostgreSQL database for a project on postgres-userdata.
 * POST /api/projects/[id]/database/initialize
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    const { id: projectId } = req.query

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Project ID is required', 400))
    }

    if (projectId === 'system') {
      return res.status(403).json(createResponse(false, null, 'SQL database not available for system project', 403))
    }

    // Only project owners/admins can initialize
    const access = await checkProjectOwnerAccess(req.user!.id, projectId, req.user!.isAdmin)
    if (!access.allowed) {
      return res.status(403).json(createResponse(false, null, access.message, 403))
    }

    const { ProjectDatabase, Project } = database.models

    // Check project exists
    const project = await Project.findByPk(projectId, { attributes: ['id'] })
    if (!project) {
      return res.status(404).json(createResponse(false, null, 'Project not found', 404))
    }

    // Check if already initialized
    const existing = await ProjectDatabase.findOne({ where: { project_id: projectId } })
    if (existing) {
      return res.status(409).json(createResponse(false, null, 'Database already initialized for this project', 409))
    }

    const result = await initializeProjectDatabase(projectId, req.user!.id)
    if (!result.ok) {
      return res
        .status(result.status || 500)
        .json(createResponse(false, null, result.message || 'Database initialization failed', result.status || 500))
    }

    return res.status(201).json(createResponse(true, result.data as any))
  } catch (error) {
    console.error('Initialize database API error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuth(handler)
