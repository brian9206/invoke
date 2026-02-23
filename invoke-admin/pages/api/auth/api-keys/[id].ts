import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { NextApiResponse } from 'next'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    await database.connect()

    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json(createResponse(false, null, 'API key ID is required', 400))
    }

    if (req.method === 'DELETE') {
      // Check that the API key belongs to the user
      const checkResult = await database.query(
        'SELECT id FROM api_keys WHERE id = $1 AND created_by = $2',
        [parseInt(id), req.user!.id]
      )

      if (checkResult.rows.length === 0) {
        return res.status(404).json(createResponse(false, null, 'API key not found', 404))
      }

      // Revoke the API key (set is_active to false)
      await database.query(
        'UPDATE api_keys SET is_active = false WHERE id = $1',
        [parseInt(id)]
      )

      return res.status(200).json(createResponse(true, null, 'API key revoked successfully'))
    }

  } catch (error) {
    console.error('API key delete endpoint error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthAndMethods(['DELETE'])(handler)
