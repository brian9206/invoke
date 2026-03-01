import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

// Generate a random API key
const generateApiKey = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { id } = req.query as { id: string }

    if (!id || typeof id !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Function ID is required', 400))
    }

    // Verify function exists and requires API key
    const { FunctionModel } = database.models;
    const fn = await FunctionModel.findByPk(id, { attributes: ['id', 'requires_api_key'] });

    if (!fn) {
      return res.status(404).json(createResponse(false, null, 'Function not found', 404))
    }

    if (!fn.requires_api_key) {
      return res.status(400).json(createResponse(false, null, 'Function does not require API key', 400))
    }

    // Generate new API key
    const newApiKey = generateApiKey()

    // Update function with new API key
    const [, updatedRows] = await FunctionModel.update(
      { api_key: newApiKey, updated_at: new Date() },
      { where: { id }, returning: true }
    );

    return res.status(200).json(createResponse(true, {
      id: updatedRows[0].id,
      api_key: updatedRows[0].api_key
    }, 'API key regenerated successfully', 200))

  } catch (error) {
    console.error('Regenerate API key error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthOrApiKeyAndMethods(['POST'])(handler)