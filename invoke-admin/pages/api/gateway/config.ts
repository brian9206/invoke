import { Op } from 'sequelize'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: any) {
  const projectId = req.query.projectId as string

  if (!projectId) {
    return res.status(400).json(createResponse(false, null, 'projectId query parameter is required', 400))
  }

  const userId = req.user!.id
  const isAdmin = req.user!.isAdmin

  // Check project access
  const access = await checkProjectAccess(userId, projectId, isAdmin)
  if (!access.allowed) {
    return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
  }

  if (req.method === 'GET') {
    const { ApiGatewayConfig } = database.models;
    const row = await ApiGatewayConfig.findOne({ where: { project_id: projectId } });

    if (!row) {
      // Return default (not yet configured)
      return res.json(createResponse(true, { enabled: false, customDomain: null }, 'Gateway config retrieved'))
    }

    return res.json(createResponse(true, {
      id: row.id,
      enabled: row.enabled,
      customDomain: row.custom_domain,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }, 'Gateway config retrieved'))
  }

  if (req.method === 'PUT') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    const { enabled, customDomain } = req.body

    // Validate custom domain uniqueness if provided
    const { ApiGatewayConfig } = database.models;
    if (customDomain) {
      const existing = await ApiGatewayConfig.findOne({
        where: { custom_domain: customDomain, project_id: { [Op.ne]: projectId } },
        attributes: ['id']
      });
      if (existing) {
        return res.status(409).json(createResponse(false, null, 'Custom domain is already in use by another project', 409))
      }
    }

    const [cfg] = await ApiGatewayConfig.upsert(
      { project_id: projectId, enabled: enabled ?? false, custom_domain: customDomain || null },
      { returning: true }
    );

    return res.json(createResponse(true, {
      id: cfg.id,
      enabled: cfg.enabled,
      customDomain: cfg.custom_domain,
      createdAt: cfg.created_at,
      updatedAt: cfg.updated_at,
    }, 'Gateway config updated'))
  }
}

export default withAuthAndMethods(['GET', 'PUT'])(handler)
