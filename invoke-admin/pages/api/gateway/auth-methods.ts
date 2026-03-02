import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectAccess } from '@/lib/project-access'
import { validateAuthMethodConfig, isValidAuthMethodType } from '@/lib/gateway-auth-validation'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: any) {
  const projectId = req.query.projectId as string

  if (!projectId) {
    return res.status(400).json(createResponse(false, null, 'projectId query parameter is required', 400))
  }

  const userId = req.user!.id
  const isAdmin = req.user!.isAdmin

  const access = await checkProjectAccess(userId, projectId, isAdmin)
  if (!access.allowed) {
    return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
  }

  const { ApiGatewayConfig, ApiGatewayAuthMethod } = database.models;

  if (req.method === 'GET') {
    // Ensure gateway config exists; return empty array if not
    const cfg = await ApiGatewayConfig.findOne({ where: { project_id: projectId }, attributes: ['id'] });
    if (!cfg) {
      return res.json(createResponse(true, [], 'No auth methods found'))
    }
    const configId = cfg.id;

    const methods = await ApiGatewayAuthMethod.findAll({
      where: { gateway_config_id: configId },
      attributes: ['id', 'name', 'type', 'config', 'created_at', 'updated_at'],
      order: [['created_at', 'ASC']]
    });

    return res.json(createResponse(true, methods.map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      config: r.config,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })), 'Auth methods retrieved'))
  }

  if (req.method === 'POST') {
    if (!access.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Write access required', 403))
    }

    const { name, type, config } = req.body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json(createResponse(false, null, 'name is required', 400))
    }
    if (!isValidAuthMethodType(type)) {
      return res.status(400).json(createResponse(false, null, 'type must be basic_auth, bearer_jwt, api_key, or middleware', 400))
    }
    const configError = validateAuthMethodConfig(type, config)
    if (configError) {
      return res.status(400).json(createResponse(false, null, `Invalid config: ${configError}`, 400))
    }

    // Auto-create gateway config if it doesn't exist
    const [cfg2] = await ApiGatewayConfig.findOrCreate({
      where: { project_id: projectId },
      defaults: { enabled: false }
    });
    const configId = cfg2.id;

    const newMethod = await ApiGatewayAuthMethod.create({
      gateway_config_id: configId,
      name: name.trim(),
      type,
      config
    });

    return res.status(201).json(createResponse(true, {
      id: newMethod.id,
      name: newMethod.name,
      type: newMethod.type,
      config: newMethod.config,
      createdAt: newMethod.created_at,
      updatedAt: newMethod.updated_at,
    }, 'Auth method created'))
  }
}

export default withAuthAndMethods(['GET', 'POST'])(handler)
