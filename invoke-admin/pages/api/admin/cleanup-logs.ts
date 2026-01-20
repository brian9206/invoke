import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { functionId } = req.body // Optional - if not provided, cleans all functions

    // Get global settings to determine if cleanup is enabled
    const globalResult = await database.query(`
      SELECT setting_value 
      FROM global_settings 
      WHERE setting_key = 'log_retention_enabled'
    `)
    
    const globalEnabled = globalResult.rows[0]?.setting_value === 'true'
    
    if (!globalEnabled) {
      return res.json(createResponse(true, { deleted: 0, functions: 0 }, 'Log retention cleanup is disabled globally'))
    }

    let functions = []
    
    if (functionId) {
      // Clean specific function
      const result = await database.query('SELECT id FROM functions WHERE id = $1', [functionId])
      functions = result.rows
    } else {
      // Clean all functions
      const result = await database.query('SELECT id FROM functions')
      functions = result.rows
    }

    let totalDeleted = 0

    for (const func of functions) {
      try {
        // Get function retention settings
        const funcResult = await database.query(`
          SELECT retention_type, retention_value, retention_enabled 
          FROM functions 
          WHERE id = $1
        `, [func.id])

        if (funcResult.rows.length === 0) continue

        const funcSettings = funcResult.rows[0]
        
        let retentionType, retentionValue, retentionEnabled

        if (funcSettings.retention_enabled) {
          // Use function-specific settings
          retentionType = funcSettings.retention_type
          retentionValue = funcSettings.retention_value
          retentionEnabled = funcSettings.retention_enabled
        } else {
          // Use global settings
          const globalSettings = await database.query(`
            SELECT setting_key, setting_value 
            FROM global_settings 
            WHERE setting_key LIKE 'log_retention_%'
          `)
          
          const settings: any = {}
          globalSettings.rows.forEach((row: any) => {
            const key = row.setting_key.replace('log_retention_', '')
            settings[key] = row.setting_value
          })
          
          retentionType = settings.type
          retentionValue = parseInt(settings.value)
          retentionEnabled = settings.enabled === 'true'
        }

        if (!retentionEnabled) continue

        let deleteQuery, params

        if (retentionType === 'time') {
          // Delete logs older than specified days
          deleteQuery = `
            DELETE FROM execution_logs 
            WHERE function_id = $1 
            AND executed_at < NOW() - INTERVAL '${retentionValue} days'
          `
          params = [func.id]
        } else if (retentionType === 'count') {
          // Keep only the latest N logs
          deleteQuery = `
            DELETE FROM execution_logs 
            WHERE function_id = $1 
            AND id NOT IN (
              SELECT id FROM execution_logs 
              WHERE function_id = $1 
              ORDER BY executed_at DESC 
              LIMIT $2
            )
          `
          params = [func.id, retentionValue]
        } else {
          continue // Skip if type is 'none'
        }

        const result = await database.query(deleteQuery, params)
        const deleted = result.rowCount || 0
        totalDeleted += deleted

        if (deleted > 0) {
          console.log(`Cleaned ${deleted} logs for function ${func.id}`)
        }

      } catch (error) {
        console.error(`Error cleaning logs for function ${func.id}:`, error)
      }
    }

    res.json(createResponse(true, { 
      deleted: totalDeleted, 
      functions: functions.length 
    }, `Cleanup completed: ${totalDeleted} logs deleted from ${functions.length} functions`))

  } catch (error) {
    console.error('Cleanup error:', error)
    res.status(500).json(createResponse(false, null, 'Cleanup failed'))
  }
}

export default withAuthAndMethods(['POST'], { adminRequired: true })(handler)
