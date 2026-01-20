import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('../../../../lib/utils')
const database = require('../../../../lib/database')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { id } = req.query as { id: string }

    if (req.method === 'GET') {
      // Get function retention settings
      const result = await database.query(`
        SELECT retention_type, retention_value, retention_enabled 
        FROM functions 
        WHERE id = $1
      `, [id])

      if (result.rows.length === 0) {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }

      const func = result.rows[0]
      
      res.json(createResponse(true, {
        retention_type: func.retention_type,
        retention_value: func.retention_value,
        retention_enabled: func.retention_enabled || false
      }, 'Function retention settings retrieved successfully'))

    } else if (req.method === 'PUT') {
      // Update function retention settings
      const { retention_type, retention_value, retention_enabled } = req.body

      await database.query(`
        UPDATE functions 
        SET retention_type = $1, retention_value = $2, retention_enabled = $3
        WHERE id = $4
      `, [retention_type, retention_value, retention_enabled, id])

      res.json(createResponse(true, null, 'Function retention settings updated successfully'))

    } else {
      res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
    }

  } catch (error) {
    console.error('Function retention settings error:', error)
    res.status(500).json(createResponse(false, null, 'Internal server error'))
  }
}

export default withAuthAndMethods(['GET', 'PUT'])(handler)