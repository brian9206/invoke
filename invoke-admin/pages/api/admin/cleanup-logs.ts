import crypto from 'crypto'
import { Op } from 'sequelize'
import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { functionId } = req.body // Optional - if not provided, cleans all functions

    // Get global settings to determine if cleanup is enabled
    const { GlobalSetting, Function: FunctionModel, FunctionLog } = database.models;
    const globalEnabledRecord = await GlobalSetting.findOne({
      where: { setting_key: 'log_retention_enabled' },
      attributes: ['setting_value']
    });
    const globalEnabled = globalEnabledRecord?.setting_value === 'true'
    
    if (!globalEnabled) {
      return res.json(createResponse(true, { deleted: 0, functions: 0 }, 'Log retention cleanup is disabled globally'))
    }

    let functions: { id: any }[] = []
    
    if (functionId) {
      // Clean specific function
      const fn = await FunctionModel.findByPk(functionId, { attributes: ['id'] });
      functions = fn ? [fn.get({ plain: true })] : [];
    } else {
      // Clean all functions
      const allFunctions = await FunctionModel.findAll({ attributes: ['id'] });
      functions = allFunctions.map((f: any) => f.get({ plain: true }));
    }

    let totalDeleted = 0

    for (const func of functions) {
      try {
        // Get function retention settings
        const funcRecord = await FunctionModel.findByPk(func.id, {
          attributes: ['retention_type', 'retention_value', 'retention_enabled']
        });

        if (!funcRecord) continue

        const funcSettings = funcRecord.get({ plain: true });
        
        let retentionType, retentionValue, retentionEnabled

        if (funcSettings.retention_enabled) {
          // Use function-specific settings
          retentionType = funcSettings.retention_type
          retentionValue = funcSettings.retention_value
          retentionEnabled = funcSettings.retention_enabled
        } else {
          // Use global settings
          const globalSettingsRows = await GlobalSetting.findAll({
            where: { setting_key: { [Op.like]: 'log_retention_%' } },
            attributes: ['setting_key', 'setting_value']
          });
          
          const settings: any = {}
          globalSettingsRows.map((r: any) => r.get({ plain: true })).forEach((row: any) => {
            const key = row.setting_key.replace('log_retention_', '')
            settings[key] = row.setting_value
          })
          
          retentionType = settings.type
          retentionValue = parseInt(settings.value)
          retentionEnabled = settings.enabled === 'true'
        }

        if (!retentionEnabled) continue

        let deleted = 0

        if (retentionType === 'time') {
          // Delete logs older than specified days
          deleted = await FunctionLog.destroy({
            where: {
              function_id: func.id,
              executed_at: { [Op.lt]: database.sequelize.literal(`NOW() - INTERVAL '${parseInt(retentionValue)} days'`) }
            }
          });
        } else if (retentionType === 'count') {
          // Keep only the latest N logs — fetch keeper IDs then destroy the rest
          const keepers = await FunctionLog.findAll({
            where: { function_id: func.id },
            attributes: ['id'],
            order: [['executed_at', 'DESC']],
            limit: parseInt(retentionValue),
            raw: true,
          }) as any[]
          const keeperIds = keepers.map((k: any) => k.id)
          deleted = await FunctionLog.destroy({
            where: {
              function_id: func.id,
              ...(keeperIds.length > 0 ? { id: { [Op.notIn]: keeperIds } } : {}),
            },
          })
        } else {
          continue // Skip if type is 'none'
        }

        totalDeleted += deleted

        if (deleted > 0) {
          console.log(`Cleaned ${deleted} logs for function ${func.id}`)
        }

      } catch (error) {
        console.error(`Error cleaning logs for function ${func.id}:`, error)
      }
    }

    // Clean up expired refresh tokens
    let expiredTokensDeleted = 0
    try {
      const { RefreshToken } = database.models
      expiredTokensDeleted = await RefreshToken.destroy({
        where: { expires_at: { [Op.lt]: new Date() } },
      })
      if (expiredTokensDeleted > 0) {
        console.log(`Cleaned ${expiredTokensDeleted} expired refresh tokens`)
      }
    } catch (tokenError) {
      console.error('Error cleaning expired refresh tokens:', tokenError)
    }

    res.json(createResponse(true, { 
      deleted: totalDeleted, 
      functions: functions.length,
      expiredTokensDeleted,
    }, `Cleanup completed: ${totalDeleted} logs deleted from ${functions.length} functions, ${expiredTokensDeleted} expired tokens removed`))

  } catch (error) {
    console.error('Cleanup error:', error)
    res.status(500).json(createResponse(false, null, 'Cleanup failed'))
  }
}

export default function routeHandler(req: NextApiRequest, res: NextApiResponse) {
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET
  const headerSecret = req.headers['x-internal-secret'] as string | undefined
  if (internalSecret && headerSecret && internalSecret.length === headerSecret.length) {
    const isMatch = crypto.timingSafeEqual(Buffer.from(internalSecret), Buffer.from(headerSecret))
    if (isMatch) {
      console.log(`[audit] Internal service bypass used for cleanup-logs from ${req.socket.remoteAddress}`)
      return handler(req as AuthenticatedRequest, res)
    }
  }
  return withAuthAndMethods(['POST'], { adminRequired: true })(handler)(req as AuthenticatedRequest, res)
}
