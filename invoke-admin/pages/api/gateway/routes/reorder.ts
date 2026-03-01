import { QueryTypes } from 'sequelize'
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

  // Check project write access
  const access = await checkProjectAccess(userId, projectId, isAdmin)
  if (!access.allowed || !access.canWrite) {
    return res.status(403).json(createResponse(false, null, access.message || 'Write access required', 403))
  }

  const { order } = req.body as { order: { id: string; sortOrder: number }[] }

  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json(createResponse(false, null, 'order array is required', 400))
  }

  // Verify all routes belong to this project
  const ids = order.map((o) => o.id)
  const { ApiGatewayConfig, ApiGatewayRoute } = database.models;
  const verifyRows = await database.sequelize.query(
    `SELECT gr.id FROM api_gateway_routes gr
     JOIN api_gateway_configs gc ON gc.id = gr.gateway_config_id
     WHERE gr.id = ANY($1::uuid[]) AND gc.project_id = $2`,
    { bind: [ids, projectId], type: QueryTypes.SELECT }
  ) as any[];
  if (verifyRows.length !== ids.length) {
    return res.status(403).json(createResponse(false, null, 'One or more route IDs do not belong to this project', 403))
  }

  // Batch update sort_order in a transaction
  await database.sequelize.transaction(async (t: any) => {
    for (const item of order) {
      await ApiGatewayRoute.update(
        { sort_order: item.sortOrder, updated_at: new Date() },
        { where: { id: item.id }, transaction: t }
      );
    }
  });

  return res.json(createResponse(true, null, 'Route order updated'))
}

export default withAuthAndMethods(['PUT'])(handler)
