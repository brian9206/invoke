import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { logSequelize, appDb } from '../database';
import { FunctionLog } from '../models/FunctionLog';

const router = Router();

/**
 * POST /cleanup
 *
 * Log retention cleanup. Reads global and per-function retention settings
 * from the app DB and deletes qualifying logs from the log DB.
 *
 * Body: { functionId?: string }  — omit to clean all functions.
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const { functionId } = req.body;
    const { GlobalSetting, Function: FunctionModel } = appDb.models;

    // Check if cleanup is enabled globally
    const globalEnabledRecord = await GlobalSetting.findOne({
      where: { setting_key: 'log_retention_enabled' },
      attributes: ['setting_value'],
    });
    const globalEnabled = globalEnabledRecord?.setting_value === 'true';

    if (!globalEnabled) {
      return res.json({
        success: true,
        data: { deleted: 0, functions: 0 },
        message: 'Log retention cleanup is disabled globally',
      });
    }

    let functions: { id: any }[] = [];
    if (functionId) {
      const fn = await FunctionModel.findByPk(functionId, { attributes: ['id'] });
      functions = fn ? [fn.get({ plain: true })] : [];
    } else {
      const all = await FunctionModel.findAll({ attributes: ['id'] });
      functions = all.map((f: any) => f.get({ plain: true }));
    }

    let totalDeleted = 0;

    for (const func of functions) {
      try {
        const funcRecord = await FunctionModel.findByPk(func.id, {
          attributes: ['retention_type', 'retention_value', 'retention_enabled'],
        });
        if (!funcRecord) continue;

        const funcSettings = funcRecord.get({ plain: true });
        let retentionType: string | undefined;
        let retentionValue: any;
        let retentionEnabled: boolean | undefined;

        if (funcSettings.retention_enabled) {
          retentionType = funcSettings.retention_type;
          retentionValue = funcSettings.retention_value;
          retentionEnabled = funcSettings.retention_enabled;
        } else {
          const globalRows = await GlobalSetting.findAll({
            where: { setting_key: { [Op.like]: 'log_retention_%' } },
            attributes: ['setting_key', 'setting_value'],
          });
          const settings: Record<string, string> = {};
          globalRows
            .map((r: any) => r.get({ plain: true }))
            .forEach((row: any) => {
              settings[row.setting_key.replace('log_retention_', '')] = row.setting_value;
            });
          retentionType = settings.type;
          retentionValue = parseInt(settings.value, 10);
          retentionEnabled = settings.enabled === 'true';
        }

        if (!retentionEnabled) continue;

        let deleted = 0;

        if (retentionType === 'time') {
          deleted = await FunctionLog.destroy({
            where: {
              function_id: func.id,
              executed_at: {
                [Op.lt]: logSequelize.literal(
                  `NOW() - INTERVAL '${parseInt(retentionValue, 10)} days'`,
                ),
              },
            },
          });
        } else if (retentionType === 'count') {
          const keepers = (await FunctionLog.findAll({
            where: { function_id: func.id },
            attributes: ['id'],
            order: [['executed_at', 'DESC']],
            limit: parseInt(retentionValue, 10),
            raw: true,
          })) as any[];
          const keeperIds = keepers.map((k: any) => k.id);
          deleted = await FunctionLog.destroy({
            where: {
              function_id: func.id,
              ...(keeperIds.length > 0 ? { id: { [Op.notIn]: keeperIds } } : {}),
            },
          });
        } else {
          continue;
        }

        totalDeleted += deleted;
        if (deleted > 0) {
          console.log(`[Logger] Cleaned ${deleted} logs for function ${func.id}`);
        }
      } catch (funcErr) {
        console.error(`[Logger] Error cleaning logs for function ${func.id}:`, funcErr);
      }
    }

    return res.json({
      success: true,
      data: { deleted: totalDeleted, functions: functions.length },
      message: `Cleanup completed: ${totalDeleted} logs deleted from ${functions.length} functions`,
    });
  } catch (err) {
    console.error('[Logger] /cleanup error:', err);
    return res.status(500).json({ success: false, message: 'Cleanup failed' });
  }
});

export default router;
