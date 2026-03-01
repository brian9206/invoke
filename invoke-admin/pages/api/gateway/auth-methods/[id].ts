import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import { validateAuthMethodConfig, isValidAuthMethodType } from '@/lib/gateway-auth-validation'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: any) {
  const { id } = req.query as { id: string }
  const projectId = req.query.projectId as string

  if (!id) {
    return res.status(400).json(createResponse(false, null, 'Auth method ID is required', 400))
  }
  if (!projectId) {
    return res.status(400).json(createResponse(false, null, 'projectId query parameter is required', 400))
  }

  const userId = req.user!.id
  const isAdmin = req.user!.isAdmin

  const access = await checkProjectAccess(userId, projectId, isAdmin)
  if (!access.allowed) {
    return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
  }

  // Verify auth method belongs to this project
  const { ApiGatewayConfig, ApiGatewayAuthMethod } = database.models;
  const ownerCheck = await ApiGatewayAuthMethod.findOne({
    where: { id },
    include: [{ model: ApiGatewayConfig, where: { project_id: projectId }, required: true, attributes: [] }]
  });
  if (!ownerCheck) {
    return res.status(404).json(createResponse(false, null, 'Auth method not found', 404))
  }

  if (req.method === 'GET') {
    const method = await ApiGatewayAuthMethod.findByPk(id, {
      attributes: ['id', 'name', 'type', 'config', 'created_at', 'updated_at']
    });
    return res.json(createResponse(true, {
      id: method.id,
      name: method.name,
      type: method.type,
      config: method.config,
      createdAt: method.created_at,
      updatedAt: method.updated_at,
    }, 'Auth method retrieved'))
  }

  if (req.method === 'PUT') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    const { name, type, config } = req.body

    // Get current values for partial update
    const cur = await ApiGatewayAuthMethod.findByPk(id, { attributes: ['name', 'type', 'config'] });

    const newName = name !== undefined ? (typeof name === 'string' ? name.trim() : null) : cur.name
    const newType = type !== undefined ? type : cur.type
    const newConfig = config !== undefined ? config : cur.config

    if (!newName) {
      return res.status(400).json(createResponse(false, null, 'name cannot be empty', 400))
    }
    if (!isValidAuthMethodType(newType)) {
      return res.status(400).json(createResponse(false, null, 'type must be basic_auth, bearer_jwt, api_key, or middleware', 400))
    }
    const configError = validateAuthMethodConfig(newType, newConfig)
    if (configError) {
      return res.status(400).json(createResponse(false, null, `Invalid config: ${configError}`, 400))
    }

    await ApiGatewayAuthMethod.update(
      { name: newName, type: newType, config: newConfig, updated_at: new Date() },
      { where: { id } }
    );

    return res.json(createResponse(true, null, 'Auth method updated'))
  }

  if (req.method === 'DELETE') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    await ApiGatewayAuthMethod.destroy({ where: { id } });
    return res.json(createResponse(true, null, 'Auth method deleted'))
  }
}

export default withAuthAndMethods(['GET', 'PUT', 'DELETE'])(handler)
