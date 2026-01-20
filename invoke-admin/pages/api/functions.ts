import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('../../lib/utils')
const database = require('../../lib/database')

async function handler(req: AuthenticatedRequest, res: any) {
  if (req.method === 'GET') {
    // Get all functions with active version info
    const result = await database.query(`
      SELECT 
        f.*,
        fv.version as active_version,
        fv.file_size,
        u.username as deployed_by_username
      FROM functions f
      LEFT JOIN function_versions fv ON f.active_version_id = fv.id
      LEFT JOIN users u ON f.deployed_by = u.id
      ORDER BY f.created_at DESC
    `)

    return res.status(200).json(createResponse(true, result.rows, 'Functions retrieved successfully'))

  } else if (req.method === 'POST') {
    // This would be handled by the upload endpoint
    return res.status(405).json(createResponse(false, null, 'Use /api/functions/upload for file uploads', 405))
  }
}

export default withAuthAndMethods(['GET', 'POST'])(handler)