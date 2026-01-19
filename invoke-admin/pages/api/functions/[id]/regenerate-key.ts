import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const { createResponse } = require('../../../../lib/utils')
const database = require('../../../../lib/database')

// Generate a random API key
const generateApiKey = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  try {
    await database.connect()

    const { id } = req.query as { id: string }

    if (!id || typeof id !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Function ID is required', 400))
    }

    // Extract and verify JWT token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(createResponse(false, null, 'Authorization header required', 401))
    }

    const token = authHeader.substring(7)
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
    
    try {
      jwt.verify(token, JWT_SECRET)
    } catch (error) {
      return res.status(401).json(createResponse(false, null, 'Invalid or expired token', 401))
    }

    // Verify function exists and requires API key
    const functionResult = await database.query(
      'SELECT id, requires_api_key FROM functions WHERE id = $1',
      [id]
    )

    if (functionResult.rows.length === 0) {
      return res.status(404).json(createResponse(false, null, 'Function not found', 404))
    }

    if (!functionResult.rows[0].requires_api_key) {
      return res.status(400).json(createResponse(false, null, 'Function does not require API key', 400))
    }

    // Generate new API key
    const newApiKey = generateApiKey()

    // Update function with new API key
    const updateResult = await database.query(`
      UPDATE functions 
      SET api_key = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING id, api_key
    `, [newApiKey, id])

    return res.status(200).json(createResponse(true, {
      id: updateResult.rows[0].id,
      api_key: updateResult.rows[0].api_key
    }, 'API key regenerated successfully', 200))

  } catch (error) {
    console.error('Regenerate API key error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}