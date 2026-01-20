import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('../../../lib/utils')
const database = require('../../../lib/database')

async function handler(req: AuthenticatedRequest, res: any) {
  if (req.method === 'GET') {
    // Get global settings
    const result = await database.query(`
      SELECT setting_key, setting_value, description
      FROM global_settings 
      WHERE setting_key LIKE 'log_retention%' OR setting_key = 'function_base_url'
      ORDER BY setting_key
    `)

    const settings = {}
    result.rows.forEach(row => {
      let key
      if (row.setting_key === 'function_base_url') {
        key = 'function_base_url'
      } else {
        key = row.setting_key.replace('log_retention_', '')
      }
      settings[key] = {
        value: row.setting_value,
        description: row.description
      }
    })

    res.json(createResponse(true, settings, 'Global settings retrieved successfully'))

  } else if (req.method === 'PUT') {
    // Update global settings
    const { type, value, enabled, function_base_url } = req.body

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
    
    if (function_base_url !== undefined) {
      queries.push(database.query(
        'UPDATE global_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2',
        [function_base_url, 'function_base_url']
      ))
    }

    if (queries.length === 0) {
      return res.status(400).json(createResponse(false, null, 'No settings provided to update', 400))
    }

    const results = await Promise.all(queries)
    
    // Check if any rows were actually updated
    const totalRowsUpdated = results.reduce((sum, result) => sum + (result.rowCount || 0), 0)
    
    if (totalRowsUpdated === 0) {
      return res.status(404).json(createResponse(false, null, 'No settings were found to update. Please ensure the global_settings table is properly initialized.', 404))
    }

    res.json(createResponse(true, { updatedRows: totalRowsUpdated }, 'Global settings updated successfully'))
  }
}

export default withAuthAndMethods(['GET', 'PUT'], { adminRequired: true })(handler)