'use strict';

const crypto = require('crypto');

/**
 * Shared logging utilities for invoke services.
 *
 * Two primary exports:
 *   insertLog(database, opts)        — generic log insertion
 *   insertRequestLog(database, opts) — structured request/response log
 *
 * Both functions accept the service's `database` instance (from createServiceDatabase)
 * as their first argument so they remain portable across all services.
 */

// ── Response body size limit ──────────────────────────────────────────────────

const DEFAULT_MAX_RESPONSE_LOG_SIZE = 10 * 1024 * 1024; // 10 MB

function getMaxResponseLogSize() {
  const envValue = process.env.MAX_RESPONSE_LOG_SIZE;
  if (!envValue) return DEFAULT_MAX_RESPONSE_LOG_SIZE;
  const parsed = parseInt(envValue, 10);
  if (isNaN(parsed) || parsed <= 0) return DEFAULT_MAX_RESPONSE_LOG_SIZE;
  return parsed;
}

// ── Text content-type detection ───────────────────────────────────────────────

function isTextContentType(contentType) {
  const ct = (contentType || '').toLowerCase();
  return (
    ct.startsWith('text/') ||
    ct.includes('application/json') ||
    ct.includes('application/xml') ||
    ct.includes('application/javascript') ||
    ct.includes('application/x-www-form-urlencoded') ||
    ct.includes('+json') ||
    ct.includes('+xml')
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNullableSize(value) {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

/**
 * Insert a generic log entry into `function_logs`.
 *
 * @param {import('./service-database').ServiceDatabase} database
 * @param {object}  opts
 * @param {string}  opts.projectId           Mandatory.
 * @param {string}  [opts.functionId]        Optional; null for gateway-only logs.
 * @param {'request'|'app'} opts.type
 * @param {'execution'|'gateway'} opts.source
 * @param {object}  opts.payload             JSONB payload object.
 * @param {Date}    [opts.executedAt]        Defaults to now.
 * @returns {Promise<object>} The created FunctionLog instance.
 */
async function insertLog(database, { projectId, functionId, type, source, payload, executedAt }) {
  if (!projectId) throw new Error('[insertLog] projectId is required');
  if (type !== 'request' && type !== 'app') throw new Error(`[insertLog] Invalid type: ${type}`);
  if (source !== 'execution' && source !== 'gateway') throw new Error(`[insertLog] Invalid source: ${source}`);

  const { FunctionLog } = database.models;

  return FunctionLog.create({
    project_id: projectId,
    function_id: functionId || null,
    type,
    source,
    executed_at: executedAt || new Date(),
    payload,
  });
}

/**
 * Insert a structured request/response log entry.
 *
 * Builds the standard JSONB payload (request, response, error, console, trace_id)
 * and delegates to insertLog(). Handles response body truncation and text/binary
 * detection automatically.
 *
 * If `projectId` is omitted but `functionId` is given, the project is resolved
 * automatically via a Function lookup (adds one extra DB query).
 *
 * When `source === 'execution'` and `functionId` is set, also increments
 * `Function.execution_count` and updates `Function.last_executed`.
 *
 * @param {import('./service-database').ServiceDatabase} database
 * @param {object}   opts
 * @param {object}   [opts.function]
 * @param {string}   [opts.function.id]
 * @param {string}   [opts.function.name]
 * @param {object}   [opts.project]
 * @param {string}   [opts.project.id]
 * @param {string}   [opts.project.name]
 * @param {'execution'|'gateway'} opts.source
 * @param {string}   [opts.traceId]
 * @param {number}   opts.executionTime          Milliseconds.
 * @param {number}   opts.statusCode
 * @param {string}   [opts.error]                Error message if the execution failed.
 * @param {object}   [opts.requestInfo]
 * @param {object}   [opts.requestInfo.request]
 * @param {string}   [opts.requestInfo.request.url]
 * @param {string}   [opts.requestInfo.request.method]
 * @param {string|null} [opts.requestInfo.request.ip]
 * @param {string}   [opts.requestInfo.request.userAgent]
 * @param {object}   [opts.requestInfo.request.headers]
 * @param {object}   [opts.requestInfo.request.body]
 * @param {number|null} [opts.requestInfo.request.body.size]
 * @param {string}   [opts.requestInfo.request.body.payload]
 * @param {object}   [opts.requestInfo.response]
 * @param {object}   [opts.requestInfo.response.headers]
 * @param {object}   [opts.requestInfo.response.body]
 * @param {number|null} [opts.requestInfo.response.body.size]
 * @param {Buffer|string|unknown} [opts.requestInfo.response.body.payload]
 * @param {unknown[]} [opts.requestInfo.console]
 */
async function insertRequestLog(database, {
  project = null,
  function: functionArg = null,
  source,
  traceId,
  executionTime,
  statusCode,
  error = null,
  requestInfo = {},
}) {
  // ── Resolve projectId / functionName / projectName if not supplied ───────
  let resolvedProjectId = project?.id ?? null;
  let resolvedFunctionName = functionArg?.name ?? null;
  let resolvedProjectName = project?.name ?? null;

  if (functionArg?.id && (!resolvedProjectId || resolvedFunctionName === null || resolvedProjectName === null)) {
    try {
      const { Function: FunctionModel, Project } = database.models;
      const func = await FunctionModel.findOne({
        where: { id: functionArg.id },
        attributes: ['project_id', 'name'],
        include: [{ model: Project, attributes: ['name'], required: false }],
      });
      if (func) {
        if (!resolvedProjectId) resolvedProjectId = func.get('project_id');
        if (resolvedFunctionName === null) resolvedFunctionName = func.get('name') ?? null;
        if (resolvedProjectName === null) resolvedProjectName = func.Project?.get('name') ?? null;
      }
    } catch (lookupErr) {
      console.error('[insertRequestLog] Failed to resolve function/project info:', lookupErr);
    }
  }

  if (!resolvedProjectId) {
    console.error('[insertRequestLog] Skipping log — no projectId for functionId:', functionArg?.id);
    return;
  }

  // ── Serialize response body ───────────────────────────────────────────────
  const MAX_RESPONSE_LOG_SIZE = getMaxResponseLogSize();
  let responseBodyLog = '';

  if (requestInfo.response?.body?.payload) {
    const contentType = (requestInfo.response?.headers?.['content-type'] || '');

    if (isTextContentType(contentType)) {
      if (Buffer.isBuffer(requestInfo.response.body.payload)) {
        responseBodyLog = requestInfo.response.body.payload.toString('utf8');
      } else if (typeof requestInfo.response.body.payload === 'string') {
        responseBodyLog = requestInfo.response.body.payload;
      } else {
        responseBodyLog = JSON.stringify(requestInfo.response.body.payload);
      }

      if (responseBodyLog.length > MAX_RESPONSE_LOG_SIZE) {
        const sizeMB = (MAX_RESPONSE_LOG_SIZE / (1024 * 1024)).toFixed(1);
        responseBodyLog =
          responseBodyLog.substring(0, MAX_RESPONSE_LOG_SIZE) +
          `...<TRUNCATED at ${sizeMB}MB>`;
      }
    } else {
      responseBodyLog = '<BINARY>';
    }
  }

  // ── Build payload ─────────────────────────────────────────────────────────
  const executedAt = new Date();

  const payload = {
    executed_at: executedAt.toISOString(),
    execution_time_ms: executionTime,
    ...(traceId ? { trace_id: traceId } : {}),
    ...(functionArg?.id ? { function: { id: functionArg.id, name: resolvedFunctionName } } : {}),
    ...(resolvedProjectId ? { project: { id: resolvedProjectId, name: resolvedProjectName } } : {}),
    request: {
      url: requestInfo.request?.url || '',
      method: requestInfo.request?.method || 'POST',
      ip: requestInfo.request?.ip || null,
      ...(requestInfo.request?.userAgent ? { userAgent: requestInfo.request.userAgent } : {}),
      headers: requestInfo.request?.headers || {},
      body: {
        size: toNullableSize(requestInfo.request?.body?.size),
        ...(requestInfo.request?.body?.payload ? { payload: requestInfo.request.body.payload } : {}),
      },
    },
    response: {
      ...(statusCode ? { status: statusCode } : {}),
      headers: requestInfo.response?.headers || {},
      body: {
        size: toNullableSize(requestInfo.response?.body?.size),
        ...(responseBodyLog ? { payload: responseBodyLog } : {}),
      },
    },
    ...(error ? { error } : {}),
    ...(requestInfo.console && requestInfo.console.length > 0
      ? { console: requestInfo.console }
      : {}),
  };

  // ── Persist ───────────────────────────────────────────────────────────────
  try {
    await insertLog(database, {
      projectId: resolvedProjectId,
      functionId: functionArg?.id,
      type: 'request',
      source,
      payload,
      executedAt,
    });

    // Update execution metrics for function invocations
    if (source === 'execution' && functionArg?.id) {
      const { Function: FunctionModel } = database.models;
      await FunctionModel.update(
        {
          execution_count: database.sequelize.literal('execution_count + 1'),
          last_executed: new Date(),
        },
        { where: { id: functionArg.id } },
      );
    }
  } catch (dbError) {
    console.error('[insertRequestLog] Failed to write log:', dbError);
  }
}

module.exports = { insertLog, insertRequestLog };
