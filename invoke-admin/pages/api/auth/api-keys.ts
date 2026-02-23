import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { NextApiResponse } from 'next'
const { createResponse } = require('@/lib/utils')
const { generateApiKey, hashApiKey } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    await database.connect()

    if (req.method === 'GET') {
      // List user's API keys (without showing the actual keys)
      const result = await database.query(
        `SELECT id, name, created_at, last_used, usage_count, is_active 
         FROM api_keys 
         WHERE created_by = $1
         ORDER BY created_at DESC`,
        [req.user!.id]
      )

      return res.status(200).json(createResponse(true, result.rows, 'API keys retrieved'))
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
      const result = await database.query(
        `INSERT INTO api_keys (key_hash, name, created_by, is_active, usage_count)
         VALUES ($1, $2, $3, $4, 0)
         RETURNING id, name, created_at, is_active`,
        [keyHash, name.trim(), req.user!.id, true]
      )

      const keyData = result.rows[0]

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
