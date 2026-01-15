import { NextApiRequest, NextApiResponse } from 'next'
const { createResponse } = require('../../lib/utils')
const database = require('../../lib/database')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await database.connect()

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

    } else {
      return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
    }

  } catch (error) {
    console.error('Functions API error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}