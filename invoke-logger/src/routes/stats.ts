import { Router, Request, Response } from 'express';
import { Op, QueryTypes } from 'sequelize';
import { logSequelize } from '../database';
import { FunctionLog } from '../models/FunctionLog';

const router = Router();

/**
 * GET /stats
 *
 * Dashboard execution statistics for the past 24 hours.
 * Query params: projectId
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const whereParts: string[] = ['executed_at > $1'];
    const binds: unknown[] = [cutoff.toISOString()];

    if (projectId && projectId !== 'system') {
      binds.push(projectId);
      whereParts.push(`project_id = $${binds.length}`);
    }

    const whereStr = whereParts.join(' AND ');
    const sql = `
      SELECT
        COUNT(*) AS recent_executions,
        COUNT(*) FILTER (WHERE (payload->'response'->>'status')::int >= 400) AS recent_errors,
        AVG((payload->>'execution_time_ms')::int)::int AS avg_response_time,
        CASE WHEN COUNT(*) = 0 THEN 100.0
             ELSE ROUND((COUNT(*) FILTER (WHERE (payload->'response'->>'status')::int < 400) * 100.0 / COUNT(*)), 1)
        END AS success_rate
      FROM function_logs
      WHERE ${whereStr}
    `;

    const [result] = (await logSequelize.query(sql, {
      bind: binds as any[],
      type: QueryTypes.SELECT,
    })) as any[];

    return res.json({
      success: true,
      data: {
        recentExecutions: parseInt(result?.recent_executions ?? '0', 10),
        recentErrors: parseInt(result?.recent_errors ?? '0', 10),
        avgResponseTime: result?.avg_response_time ?? 0,
        successRate: result?.success_rate ?? 100,
      },
    });
  } catch (err) {
    console.error('[Logger] /stats error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /recent-activity
 *
 * Last 10 log entries from the past hour.
 * Query params: projectId
 */
router.get('/recent-activity', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const where: any = { executed_at: { [Op.gt]: oneHourAgo } };
    if (projectId && projectId !== 'system') {
      where.project_id = projectId;
    }

    const logs = (await FunctionLog.findAll({
      where,
      attributes: ['id', 'function_id', 'executed_at', 'payload'],
      order: [['executed_at', 'DESC']],
      limit: 10,
      raw: true,
    })) as any[];

    const recentActivity = logs.map((log: any) => {
      const statusCode: number = log.payload?.response?.status ?? 0;
      return {
        id: String(log.id),
        functionId: log.function_id,
        functionName: log.payload?.function?.name ?? null,
        status: statusCode > 0 && statusCode < 400 ? 'success' : 'error',
        executionTime: log.payload?.execution_time_ms ?? null,
        executedAt:
          log.executed_at instanceof Date
            ? log.executed_at.toISOString()
            : log.executed_at,
      };
    });

    return res.json({ success: true, data: recentActivity });
  } catch (err) {
    console.error('[Logger] /recent-activity error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
