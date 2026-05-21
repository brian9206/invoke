import { NextApiResponse } from 'next'
import { AuthenticatedRequest, withAuth } from '@/lib/middleware'
import { checkProjectOwnerAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import { destroyProjectDatabase } from '@/lib/sql-service-client'

/**
 * Destroy a project's database, dropping the database and users.
 * DELETE /api/projects/[id]/database/destroy
 *
 * Requires owner role and confirmation (project name in body).
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    const { id: projectId } = req.query

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Project ID is required', 400))
    }

    // Only owners can destroy
    const access = await checkProjectOwnerAccess(req.user!.id, projectId, req.user!.isAdmin)
    if (!access.allowed) {
      return res.status(403).json(createResponse(false, null, access.message, 403))
    }

    // Require confirmation
    const { confirm_name } = req.body || {}
    const { Project, ProjectDatabase } = database.models

    const project = await Project.findByPk(projectId)
    if (!project) {
      return res.status(404).json(createResponse(false, null, 'Project not found', 404))
    }

    if (!confirm_name || confirm_name !== project.name) {
      return res
        .status(400)
        .json(createResponse(false, null, 'Confirmation required: provide project name in confirm_name field', 400))
    }

    const record = await ProjectDatabase.findOne({ where: { project_id: projectId } })
    if (!record) {
      return res.status(404).json(createResponse(false, null, 'Database not initialized for this project', 404))
    }

    const result = await destroyProjectDatabase(projectId, confirm_name)
    if (!result.ok) {
      return res
        .status(result.status || 500)
        .json(createResponse(false, null, result.message || 'Database destruction failed', result.status || 500))
    }

    return res.status(200).json(createResponse(true, result.data as any))
  } catch (error) {
    console.error('Destroy database API error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuth(handler)
