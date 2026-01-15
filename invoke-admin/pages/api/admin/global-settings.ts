import { NextApiRequest, NextApiResponse } from 'next'
const { createResponse } = require('../../../lib/utils')
const database = require('../../../lib/database')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await database.connect()

    if (req.method === 'GET') {
      // Get global settings
      const result = await database.query(`
        SELECT setting_key, setting_value, description
        FROM global_settings 
        WHERE setting_key LIKE 'log_retention%'
        ORDER BY setting_key
      `)

      const settings = {}
      result.rows.forEach(row => {
        const key = row.setting_key.replace('log_retention_', '')
        settings[key] = {
          value: row.setting_value,
          description: row.description
        }
      })

      res.json(createResponse(true, settings, 'Global settings retrieved successfully'))

    } else if (req.method === 'PUT') {
      // Update global settings
      const { type, value, enabled } = req.body

      const queries = []
      
      if (type !== undefined) {
        queries.push(database.query(
          'UPDATE global_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2',
          [type, 'log_retention_type']
        ))
      }
      
      if (value !== undefined) {
        queries.push(database.query(
          'UPDATE global_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2',
          [value.toString(), 'log_retention_value']
        ))
      }
      
      if (enabled !== undefined) {
        queries.push(database.query(
          'UPDATE global_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2',
          [enabled.toString(), 'log_retention_enabled']
        ))
      }

      await Promise.all(queries)

      res.json(createResponse(true, null, 'Global settings updated successfully'))

    } else {
      res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
    }

  } catch (error) {
    console.error('Global settings error:', error)
    res.status(500).json(createResponse(false, null, 'Internal server error'))
  }
}