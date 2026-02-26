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
  const verifyResult = await database.query(
    `SELECT gr.id FROM api_gateway_routes gr
     JOIN api_gateway_configs gc ON gc.id = gr.gateway_config_id
     WHERE gr.id = ANY($1::uuid[]) AND gc.project_id = $2`,
    [ids, projectId]
  )
  if (verifyResult.rows.length !== ids.length) {
    return res.status(403).json(createResponse(false, null, 'One or more route IDs do not belong to this project', 403))
  }

  // Batch update sort_order in a transaction
  await database.transaction(async (client: any) => {
    for (const item of order) {
      await client.query(
        `UPDATE api_gateway_routes SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
        [item.sortOrder, item.id]
      )
    }
  })

  return res.json(createResponse(true, null, 'Route order updated'))
}

export default withAuthAndMethods(['PUT'])(handler)
