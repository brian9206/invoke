import { Router, Request, Response } from 'express';
import { Op, QueryTypes } from 'sequelize';
import { logSequelize } from '../database';
import { FunctionLog } from '../models/FunctionLog';
import { PayloadField } from '../models/PayloadField';
import { kqlToSequelizeQuery, parseSyntaxError } from '../kql';

const router = Router();

/**
 * GET /logs/search
 *
 * Unified log search — supports both KQL (?q=...) and plain filter params.
 * Query params: q, from, to, projectId, functionId, page, limit
 */
router.get('/logs/search', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 200);
    const projectId = req.query.projectId as string | undefined;
    const functionId = req.query.functionId as string | undefined;
    const q = ((req.query.q as string) || '').trim();
    const logType = req.query.logType as string | undefined;
    const offset = (page - 1) * limit;
    const fromDate = req.query.from ? new Date(req.query.from as string) : null;
    const toDate = req.query.to ? new Date(req.query.to as string) : null;

    // ── KQL path ────────────────────────────────────────────────────────────
    if (q) {
      let kqlResult: ReturnType<typeof kqlToSequelizeQuery>;
      try {
        kqlResult = kqlToSequelizeQuery(q, {
          jsonbColumn: 'payload',
          tsvectorColumn: 'payload_search',
        });
      } catch (err: any) {
        return res.status(400).json({ success: false, message: `Invalid query: ${parseSyntaxError(err.message).message}` });
      }

      const { sql: kqlSql, bind: kqlBind, predicate } = kqlResult;
      const binds: unknown[] = [...kqlBind];
      const whereParts: string[] = [`(${kqlSql})`];

      if (projectId && projectId !== 'system') {
        binds.push(projectId);
        whereParts.push(`project_id = $${binds.length}`);
      }

      if (functionId) {
        binds.push(functionId);
        whereParts.push(`function_id = $${binds.length}`);
      }

      if (fromDate && !isNaN(fromDate.getTime())) {
        binds.push(fromDate.toISOString());
        whereParts.push(`executed_at >= $${binds.length}`);
      }
      if (toDate && !isNaN(toDate.getTime())) {
        binds.push(toDate.toISOString());
        whereParts.push(`executed_at <= $${binds.length}`);
      }
      
      binds.push(logType);
      whereParts.push(`type = $${binds.length}`);

      const whereStr = whereParts.join(' AND ');
      const countSql = `SELECT COUNT(*) AS total FROM function_logs WHERE ${whereStr}`;
      const dataBinds = [...binds, limit, offset];
      const dataSql = `
        SELECT id, function_id, project_id, executed_at, payload,
               payload->'function'->>'name' AS function_name
        FROM function_logs
        WHERE ${whereStr}
        ORDER BY executed_at DESC
        LIMIT $${dataBinds.length - 1} OFFSET $${dataBinds.length}
      `;

      const [countResult, rawRows] = await Promise.all([
        logSequelize.query(countSql, { bind: binds as any[], type: QueryTypes.SELECT }),
        logSequelize.query(dataSql, { bind: dataBinds as any[], type: QueryTypes.SELECT }),
      ]);

      const rows = (rawRows as any[]).filter((row: any) => predicate({ payload: row.payload }));
      const totalCount = parseInt((countResult as any[])[0].total, 10);
      const totalPages = Math.ceil(totalCount / limit);

      return res.json({
        success: true,
        data: {
          logs: rows,
          pagination: {
            currentPage: page,
            totalPages,
            totalCount,
            limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        },
      });
    }

    // ── ORM path (no KQL) ───────────────────────────────────────────────────
    const andConditions: any[] = [];
    if (projectId && projectId !== 'system') andConditions.push({ project_id: projectId });
    if (functionId) andConditions.push({ function_id: functionId });
    andConditions.push({ type: logType });
    if (fromDate && !isNaN(fromDate.getTime())) {
      andConditions.push({ executed_at: { [Op.gte]: fromDate } });
    }
    if (toDate && !isNaN(toDate.getTime())) {
      andConditions.push({ executed_at: { [Op.lte]: toDate } });
    }

    const where: any = andConditions.length > 0 ? { [Op.and]: andConditions } : {};

    const { count, rows } = await FunctionLog.findAndCountAll({
      where,
      attributes: ['id', 'function_id', 'project_id', 'executed_at', 'payload'],
      order: [['executed_at', 'DESC']],
      limit,
      offset,
      raw: true,
    });

    const totalCount = count as number;
    const totalPages = Math.ceil(totalCount / limit);
    const logs = (rows as any[]).map((r: any) => ({
      ...r,
      function_name: r.payload?.function?.name ?? null,
    }));

    return res.json({
      success: true,
      data: {
        logs,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (err) {
    console.error('[Logger] /logs/search error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /logs/fields
 *
 * Returns top-5 values per known payload field, for use in KQL autocomplete/faceting.
 * Query params: q (KQL), projectId
 */
router.get('/logs/fields', async (req: Request, res: Response) => {
  const projectId = req.query.projectId as string | undefined;
  const q = ((req.query.q as string) || '').trim();

  const KNOWN_FIELDS = [
    { name: 'response.status', expr: `payload->'response'->>'status'`, type: 'number' },
    { name: 'request.method', expr: `payload->'request'->>'method'`, type: 'string' },
    { name: 'request.ip', expr: `payload->'request'->>'ip'`, type: 'string' },
    { name: 'execution_time_ms', expr: `payload->>'execution_time_ms'`, type: 'number' },
  ];

  try {
    const baseBinds: unknown[] = [];
    const baseParts: string[] = [];

    if (q) {
      const { sql: kqlSql, bind: kqlBind } = kqlToSequelizeQuery(q, {
        jsonbColumn: 'payload',
        tsvectorColumn: 'payload_search',
      });
      baseBinds.push(...kqlBind);
      baseParts.push(`(${kqlSql})`);
    }

    if (projectId && projectId !== 'system') {
      baseBinds.push(projectId);
      baseParts.push(`project_id = $${baseBinds.length}`);
    }

    const baseWhere = baseParts.length > 0 ? `WHERE ${baseParts.join(' AND ')}` : '';

    const totalSql = `SELECT COUNT(*)::int AS total FROM function_logs ${baseWhere}`;
    const [totalRow] = (await logSequelize.query(totalSql, {
      bind: baseBinds,
      type: QueryTypes.SELECT,
    })) as any[];
    const total = (totalRow?.total ?? 0) as number;

    const fieldResults = await Promise.all(
      KNOWN_FIELDS.map(async (field) => {
        const sql = `
          SELECT ${field.expr} AS value, COUNT(*)::int AS count
          FROM function_logs
          ${baseWhere}
          GROUP BY value
          HAVING ${field.expr} IS NOT NULL
          ORDER BY count DESC
          LIMIT 5
        `;
        const rows = (await logSequelize.query(sql, {
          bind: baseBinds,
          type: QueryTypes.SELECT,
        })) as any[];
        return {
          name: field.name,
          type: field.type,
          topValues: rows.map((r: any) => ({
            value: r.value,
            count: r.count,
            percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
          })),
        };
      }),
    );

    return res.status(200).json({ success: true, data: { fields: fieldResults } });
  } catch (err: any) {
    if (err.message?.includes('parse result') || err.message?.includes('Invalid')) {
      return res.status(400).json({ success: false, message: `Invalid query: ${parseSyntaxError(err.message).message}` });
    }
    console.error('[Logger] /logs/fields error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /logs/fields/discover
 *
 * Returns all unique payload field paths learned from inserted logs for this project.
 * Backed by the payload_fields registry table, populated on log insert.
 * Query params: projectId
 */
router.get('/logs/fields/discover', async (req: Request, res: Response) => {
  const projectId = req.query.projectId as string | undefined;
  try {
    const where: any = {};
    if (projectId && projectId !== 'system') where.project_id = projectId;
    const fields = await PayloadField.findAll({
      where,
      attributes: ['field_path', 'field_type'],
      order: [['field_path', 'ASC']],
      raw: true,
    });
    return res.status(200).json({
      success: true,
      data: { fields: fields.map((f: any) => ({ path: f.field_path, type: f.field_type })) },
    });
  } catch (err) {
    console.error('[Logger] /logs/fields/discover error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /logs/histogram
 *
 * Time-bucketed count of log entries for charting.
 * Query params: q (KQL), from, to, projectId
 */
router.get('/logs/histogram', async (req: Request, res: Response) => {
  const projectId = req.query.projectId as string | undefined;
  const functionId = req.query.functionId as string | undefined;
  const logType = req.query.logType as string | undefined;
  const q = ((req.query.q as string) || '').trim();
  const toDate = req.query.to ? new Date(req.query.to as string) : new Date();
  const fromDate = req.query.from
    ? new Date(req.query.from as string)
    : new Date(toDate.getTime() - 24 * 60 * 60 * 1000);

  const VALID_GRANULARITIES = new Set(['minute', 'hour', 'day', 'week', 'month'])
  const requestedInterval = (req.query.interval as string | undefined)?.toLowerCase()
  const rangeHours = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60);
  const granularity = (requestedInterval && VALID_GRANULARITIES.has(requestedInterval))
    ? requestedInterval
    : rangeHours <= 1 ? 'minute' : rangeHours <= 48 ? 'hour' : 'day';

  try {
    const binds: unknown[] = [];
    const whereParts: string[] = [];

    if (q) {
      const { sql: kqlSql, bind: kqlBind } = kqlToSequelizeQuery(q, {
        jsonbColumn: 'payload',
        tsvectorColumn: 'payload_search',
      });
      binds.push(...kqlBind);
      whereParts.push(`(${kqlSql})`);
    }

    binds.push(fromDate.toISOString());
    whereParts.push(`executed_at >= $${binds.length}`);
    binds.push(toDate.toISOString());
    whereParts.push(`executed_at <= $${binds.length}`);

    if (projectId && projectId !== 'system') {
      binds.push(projectId);
      whereParts.push(`project_id = $${binds.length}`);
    }

    if (functionId) {
      binds.push(functionId);
      whereParts.push(`function_id = $${binds.length}`);
    }

    if (logType === 'app' || logType === 'request') {
      binds.push(logType);
      whereParts.push(`type = $${binds.length}`);
    }

    const whereStr = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const sql = `
      SELECT
        date_trunc('${granularity}', executed_at) AS time,
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE (payload->'response'->>'status')::int >= 400)::int AS error_count
      FROM function_logs
      ${whereStr}
      GROUP BY 1
      ORDER BY 1
    `;

    const rows = await logSequelize.query(sql, { bind: binds, type: QueryTypes.SELECT });
    return res.status(200).json({ success: true, data: rows });
  } catch (err: any) {
    if (err.message?.includes('parse result') || err.message?.includes('Invalid')) {
      return res.status(400).json({ success: false, message: `Invalid query: ${parseSyntaxError(err.message).message}` });
    }
    console.error('[Logger] /logs/histogram error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /logs/:logId
 *
 * Retrieve a single log entry. Names are extracted from the embedded payload.
 */
router.get('/logs/:logId', async (req: Request, res: Response) => {
  try {
    const logId = req.params.logId as string;
    if (!logId) {
      return res.status(400).json({ success: false, message: 'Invalid log ID' });
    }

    const log = (await FunctionLog.findByPk(logId, { raw: true })) as any;
    if (!log) {
      return res.status(404).json({ success: false, message: 'Log not found' });
    }

    const result = {
      id: log.id,
      function_id: log.function_id,
      project_id: log.project_id,
      executed_at: log.executed_at,
      payload: log.payload,
      function_name: log.payload?.function?.name ?? null,
      project_name: log.payload?.project?.name ?? null,
    };

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Logger] /logs/:logId error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
