import { Op } from 'sequelize'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: any) {
  if (req.method === 'GET') {
    // Get global settings
    const { GlobalSetting } = database.models;
    const rows = await GlobalSetting.findAll({
      where: {
        [Op.or]: [
          { setting_key: { [Op.like]: 'log_retention%' } },
          { setting_key: 'function_base_url' },
          { setting_key: 'kv_storage_limit_bytes' },
          { setting_key: 'api_gateway_domain' }
        ]
      },
      attributes: ['setting_key', 'setting_value', 'description'],
      order: [['setting_key', 'ASC']]
    });

    const settings: Record<string, any> = {}
    rows.map((r: any) => r.get({ plain: true })).forEach((row: any) => {
      let key
      if (row.setting_key === 'function_base_url') {
        key = 'function_base_url'
      } else if (row.setting_key === 'kv_storage_limit_bytes') {
        key = 'kv_storage_limit_bytes'
      } else if (row.setting_key === 'api_gateway_domain') {
        key = 'api_gateway_domain'
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
    // Check admin permission for write operations
    if (!req.user?.isAdmin) {
      return res.status(403).json(createResponse(false, null, 'Only administrators can modify global settings', 403))
    }
    
    // Update global settings
    const { type, value, enabled, function_base_url, kv_storage_limit_bytes, api_gateway_domain } = req.body

    const { GlobalSetting } = database.models;
    const queries: Promise<[number]>[] = []

    if (type !== undefined) {
      queries.push(GlobalSetting.update(
        { setting_value: type, updated_at: new Date() },
        { where: { setting_key: 'log_retention_type' } }
      ))
    }

    if (value !== undefined) {
      queries.push(GlobalSetting.update(
        { setting_value: value.toString(), updated_at: new Date() },
        { where: { setting_key: 'log_retention_value' } }
      ))
    }

    if (enabled !== undefined) {
      queries.push(GlobalSetting.update(
        { setting_value: enabled.toString(), updated_at: new Date() },
        { where: { setting_key: 'log_retention_enabled' } }
      ))
    }

    if (function_base_url !== undefined) {
      queries.push(GlobalSetting.update(
        { setting_value: function_base_url, updated_at: new Date() },
        { where: { setting_key: 'function_base_url' } }
      ))
    }

    if (kv_storage_limit_bytes !== undefined) {
      queries.push(GlobalSetting.update(
        { setting_value: kv_storage_limit_bytes.toString(), updated_at: new Date() },
        { where: { setting_key: 'kv_storage_limit_bytes' } }
      ))
    }

    if (api_gateway_domain !== undefined) {
      queries.push(GlobalSetting.update(
        { setting_value: api_gateway_domain, updated_at: new Date() },
        { where: { setting_key: 'api_gateway_domain' } }
      ))
    }

    if (queries.length === 0) {
      return res.status(400).json(createResponse(false, null, 'No settings provided to update', 400))
    }

    const results = await Promise.all(queries)

    // Check if any rows were actually updated
    const totalRowsUpdated = results.reduce((sum: number, result: [number]) => sum + (result[0] || 0), 0)
    
    if (totalRowsUpdated === 0) {
      return res.status(404).json(createResponse(false, null, 'No settings were found to update. Please ensure the global_settings table is properly initialized.', 404))
    }

    res.json(createResponse(true, { updatedRows: totalRowsUpdated }, 'Global settings updated successfully'))
  }
}

export default withAuthAndMethods(['GET', 'PUT'])(handler)
