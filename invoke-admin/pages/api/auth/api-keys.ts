import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { NextApiResponse } from 'next'
const { createResponse } = require('@/lib/utils')
const { generateApiKey, hashApiKey } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { ApiKey } = database.models

    if (req.method === 'GET') {
      // List user's API keys (without showing the actual keys)
      const keys = await ApiKey.findAll({
        where: { created_by: req.user!.id },
        attributes: ['id', 'name', 'created_at', 'last_used', 'usage_count', 'is_active'],
        order: [['created_at', 'DESC']],
      })

      return res.status(200).json(createResponse(true, keys.map((k: any) => k.get({ plain: true })), 'API keys retrieved'))
    }

    if (req.method === 'POST') {
      const { name } = req.body

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json(createResponse(false, null, 'API key name is required', 400))
      }

      if (name.length > 100) {
        return res.status(400).json(createResponse(false, null, 'API key name must be 100 characters or less', 400))
      }

      // Generate a new API key (64 characters)
      const apiKey = generateApiKey(32) // 32 bytes = 64 hex chars
      const keyHash = hashApiKey(apiKey)

      // Store the hashed key in the database
      const newKey = await ApiKey.create({
        key_hash: keyHash,
        name: name.trim(),
        created_by: req.user!.id,
        is_active: true,
        usage_count: 0,
      })

      const keyData = { id: newKey.id, name: newKey.name, created_at: newKey.created_at, is_active: newKey.is_active }

      // Return the plaintext key ONLY once (never stored)
      return res.status(201).json(createResponse(true, {
        ...keyData,
        api_key: apiKey, // Only returned this one time
        message: 'IMPORTANT: Save this API key now. You will not be able to see it again.'
      }, 'API key created successfully'))
    }

  } catch (error) {
    console.error('API keys endpoint error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthAndMethods(['GET', 'POST'])(handler)
