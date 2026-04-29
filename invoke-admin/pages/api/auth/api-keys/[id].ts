import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { NextApiResponse } from 'next'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json(createResponse(false, null, 'API key ID is required', 400))
    }

    if (req.method === 'DELETE') {
      const { ApiKey } = database.models

      const keyId = Number(id)
      if (!Number.isInteger(keyId) || keyId <= 0) {
        return res.status(400).json(createResponse(false, null, 'Invalid API key ID', 400))
      }

      // Revoke only if the key belongs to the user and is currently active
      const [updatedCount] = await ApiKey.update(
        { is_active: false },
        { where: { id: keyId, created_by: req.user!.id, is_active: true } }
      )

      if (updatedCount === 0) {
        return res.status(404).json(createResponse(false, null, 'API key not found or already revoked', 404))
      }

      return res.status(200).json(createResponse(true, null, 'API key revoked successfully'))
    }
  } catch (error) {
    console.error('API key delete endpoint error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthAndMethods(['DELETE'])(handler)
