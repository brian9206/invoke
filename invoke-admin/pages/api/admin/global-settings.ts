import { Op } from 'sequelize'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: any) {
  if (req.method === 'GET') {
    // Get global settings
    const { GlobalSetting } = database.models
    const rows = await GlobalSetting.findAll({
      where: {
        [Op.or]: [
          { setting_key: { [Op.like]: 'log_retention%' } },
          { setting_key: { [Op.like]: 'execution_%' } },
          { setting_key: 'function_base_url' },
          { setting_key: 'kv_storage_limit_bytes' },
          { setting_key: 'api_gateway_domain' },
          { setting_key: 'max_concurrent_builds' },
          { setting_key: 'build_memory_mb' }
        ]
      },
      attributes: ['setting_key', 'setting_value', 'description'],
      order: [['setting_key', 'ASC']]
    })

    const settings: Record<string, any> = {}
    rows
      .map((r: any) => r.get({ plain: true }))
      .forEach((row: any) => {
        let key
        if (row.setting_key === 'function_base_url') {
          key = 'function_base_url'
        } else if (row.setting_key === 'kv_storage_limit_bytes') {
          key = 'kv_storage_limit_bytes'
        } else if (row.setting_key === 'api_gateway_domain') {
          key = 'api_gateway_domain'
        } else if (row.setting_key === 'max_concurrent_builds') {
          key = 'max_concurrent_builds'
        } else if (row.setting_key === 'build_memory_mb') {
          key = 'build_memory_mb'
        } else if (row.setting_key.startsWith('execution_')) {
          key = row.setting_key
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
    const {
      type,
      value,
      enabled,
      function_base_url,
      kv_storage_limit_bytes,
      api_gateway_domain,
      execution_default_timeout_seconds,
      execution_max_timeout_seconds,
      execution_default_memory_mb,
      execution_max_memory_mb,
      max_concurrent_builds,
      build_memory_mb
    } = req.body

    // Validate execution timeout fields
    if (execution_default_timeout_seconds !== undefined) {
      const v = Number(execution_default_timeout_seconds)
      if (!Number.isInteger(v) || v < 10)
        return res.status(400).json(createResponse(false, null, 'Default timeout must be an integer ≥ 10 seconds', 400))
    }
    if (execution_max_timeout_seconds !== undefined) {
      const v = Number(execution_max_timeout_seconds)
      if (!Number.isInteger(v) || v < 10)
        return res.status(400).json(createResponse(false, null, 'Max timeout must be an integer ≥ 10 seconds', 400))
    }
    if (execution_default_timeout_seconds !== undefined && execution_max_timeout_seconds !== undefined) {
      if (Number(execution_max_timeout_seconds) < Number(execution_default_timeout_seconds))
        return res.status(400).json(createResponse(false, null, 'Max timeout must be ≥ default timeout', 400))
    }

    // Validate execution memory fields (must be multiples of 256)
    const isAligned256 = (n: number) => Number.isInteger(n) && n >= 256 && n % 256 === 0
    if (execution_default_memory_mb !== undefined) {
      const v = Number(execution_default_memory_mb)
      if (!isAligned256(v))
        return res
          .status(400)
          .json(createResponse(false, null, 'Default memory must be a multiple of 256 MB and at least 256 MB', 400))
    }
    if (execution_max_memory_mb !== undefined) {
      const v = Number(execution_max_memory_mb)
      if (!isAligned256(v))
        return res
          .status(400)
          .json(createResponse(false, null, 'Max memory must be a multiple of 256 MB and at least 256 MB', 400))
    }
    if (execution_default_memory_mb !== undefined && execution_max_memory_mb !== undefined) {
      if (Number(execution_max_memory_mb) < Number(execution_default_memory_mb))
        return res.status(400).json(createResponse(false, null, 'Max memory must be ≥ default memory', 400))
    }

    const { GlobalSetting } = database.models
    const queries: Promise<[number, ...unknown[]]>[] = []

    if (type !== undefined) {
      queries.push(
        GlobalSetting.update(
          { setting_value: type, updated_at: new Date() },
          { where: { setting_key: 'log_retention_type' } }
        )
      )
    }

    if (value !== undefined) {
      queries.push(
        GlobalSetting.update(
          { setting_value: value.toString(), updated_at: new Date() },
          { where: { setting_key: 'log_retention_value' } }
        )
      )
    }

    if (enabled !== undefined) {
      queries.push(
        GlobalSetting.update(
          { setting_value: enabled.toString(), updated_at: new Date() },
          { where: { setting_key: 'log_retention_enabled' } }
        )
      )
    }

    if (function_base_url !== undefined) {
      queries.push(
        GlobalSetting.update(
          { setting_value: function_base_url, updated_at: new Date() },
          { where: { setting_key: 'function_base_url' } }
        )
      )
    }

    if (kv_storage_limit_bytes !== undefined) {
      queries.push(
        GlobalSetting.update(
          { setting_value: kv_storage_limit_bytes.toString(), updated_at: new Date() },
          { where: { setting_key: 'kv_storage_limit_bytes' } }
        )
      )
    }

    if (api_gateway_domain !== undefined) {
      queries.push(
        GlobalSetting.update(
          { setting_value: api_gateway_domain, updated_at: new Date() },
          { where: { setting_key: 'api_gateway_domain' } }
        )
      )
    }

    if (execution_default_timeout_seconds !== undefined) {
      queries.push(
        GlobalSetting.update(
          { setting_value: String(execution_default_timeout_seconds), updated_at: new Date() },
          { where: { setting_key: 'execution_default_timeout_seconds' } }
        )
      )
    }

    if (execution_max_timeout_seconds !== undefined) {
      queries.push(
        GlobalSetting.update(
          { setting_value: String(execution_max_timeout_seconds), updated_at: new Date() },
          { where: { setting_key: 'execution_max_timeout_seconds' } }
        )
      )
    }

    if (execution_default_memory_mb !== undefined) {
      queries.push(
        GlobalSetting.update(
          { setting_value: String(execution_default_memory_mb), updated_at: new Date() },
          { where: { setting_key: 'execution_default_memory_mb' } }
        )
      )
    }

    if (execution_max_memory_mb !== undefined) {
      queries.push(
        GlobalSetting.update(
          { setting_value: String(execution_max_memory_mb), updated_at: new Date() },
          { where: { setting_key: 'execution_max_memory_mb' } }
        )
      )
    }

    if (max_concurrent_builds !== undefined) {
      const v = Number(max_concurrent_builds)
      if (!Number.isInteger(v) || v < 1)
        return res.status(400).json(createResponse(false, null, 'Max concurrent builds must be an integer ≥ 1', 400))
      queries.push(
        GlobalSetting.update(
          { setting_value: String(v), updated_at: new Date() },
          { where: { setting_key: 'max_concurrent_builds' } }
        )
      )
    }

    if (build_memory_mb !== undefined) {
      const v = Number(build_memory_mb)
      const isValidBuildMemory = Number.isInteger(v) && v >= 256 && v % 256 === 0
      if (!isValidBuildMemory)
        return res
          .status(400)
          .json(createResponse(false, null, 'Build memory must be a multiple of 256 MB, minimum 256 MB', 400))
      queries.push(
        GlobalSetting.update(
          { setting_value: String(v), updated_at: new Date() },
          { where: { setting_key: 'build_memory_mb' } }
        )
      )
    }

    if (queries.length === 0) {
      return res.status(400).json(createResponse(false, null, 'No settings provided to update', 400))
    }

    const results = await Promise.all(queries)

    // Check if any rows were actually updated
    const totalRowsUpdated = results.reduce((sum: number, result: [number, ...unknown[]]) => sum + (result[0] || 0), 0)

    if (totalRowsUpdated === 0) {
      return res
        .status(404)
        .json(
          createResponse(
            false,
            null,
            'No settings were found to update. Please ensure the global_settings table is properly initialized.',
            404
          )
        )
    }

    res.json(createResponse(true, { updatedRows: totalRowsUpdated }, 'Global settings updated successfully'))
  }
}

export default withAuthAndMethods(['GET', 'PUT'])(handler)
