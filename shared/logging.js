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
 * @param {string}   [opts.projectId]
 * @param {string}   [opts.functionId]
 * @param {'execution'|'gateway'} opts.source
 * @param {string}   [opts.traceId]
 * @param {number}   opts.executionTime          Milliseconds.
 * @param {number}   opts.statusCode
 * @param {string}   [opts.error]                Error message if the execution failed.
 * @param {object}   [opts.requestInfo]
 * @param {number|null}  [opts.requestInfo.requestSize]
 * @param {number|null}  [opts.requestInfo.responseSize]
 * @param {string}       [opts.requestInfo.clientIp]
 * @param {string}       [opts.requestInfo.userAgent]
 * @param {unknown[]}    [opts.requestInfo.consoleOutput]
 * @param {object}       [opts.requestInfo.requestHeaders]
 * @param {object}       [opts.requestInfo.responseHeaders]
 * @param {string}       [opts.requestInfo.requestMethod]
 * @param {string}       [opts.requestInfo.requestUrl]
 * @param {string}       [opts.requestInfo.requestBody]
 * @param {Buffer|string|unknown} [opts.requestInfo.responseBody]
 */
async function insertRequestLog(database, {
  projectId,
  functionId,
  source,
  traceId,
  executionTime,
  statusCode,
  error = null,
  requestInfo = {},
}) {
  // ── Resolve projectId if not supplied ────────────────────────────────────
  let resolvedProjectId = projectId;
  if (!resolvedProjectId && functionId) {
    try {
      const { Function: FunctionModel } = database.models;
      const func = await FunctionModel.findOne({
        where: { id: functionId },
        attributes: ['project_id'],
      });
      if (func) resolvedProjectId = func.get('project_id');
    } catch (lookupErr) {
      console.error('[insertRequestLog] Failed to resolve projectId:', lookupErr);
    }
  }

  if (!resolvedProjectId) {
    console.error('[insertRequestLog] Skipping log — no projectId for functionId:', functionId);
    return;
  }

  // ── Serialize response body ───────────────────────────────────────────────
  const MAX_RESPONSE_LOG_SIZE = getMaxResponseLogSize();
  let responseBodyLog = '';

  if (requestInfo.responseBody) {
    const contentType = (requestInfo.responseHeaders?.['content-type'] || '');

    if (isTextContentType(contentType)) {
      if (Buffer.isBuffer(requestInfo.responseBody)) {
        responseBodyLog = requestInfo.responseBody.toString('utf8');
      } else if (typeof requestInfo.responseBody === 'string') {
        responseBodyLog = requestInfo.responseBody;
      } else {
        responseBodyLog = JSON.stringify(requestInfo.responseBody);
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
  const requestBody = requestInfo.requestBody || '';
  const requestSize = toNullableSize(requestInfo.requestSize);
  const responseSize = toNullableSize(requestInfo.responseSize);

  const payload = {
    executed_at: executedAt.toISOString(),
    execution_time_ms: executionTime,
    ...(traceId ? { trace_id: traceId } : {}),
    ...(functionId ? { function_id: functionId } : {}),
    request: {
      url: requestInfo.requestUrl || '',
      method: requestInfo.requestMethod || 'POST',
      ip: requestInfo.clientIp || null,
      headers: requestInfo.requestHeaders || {},
      body: {
        size: requestSize,
        ...(requestBody ? { payload: requestBody } : {}),
      },
    },
    response: {
      ...(statusCode ? { status: statusCode } : {}),
      headers: requestInfo.responseHeaders || {},
      body: {
        size: responseSize,
        ...(responseBodyLog ? { payload: responseBodyLog } : {}),
      },
    },
    ...(error ? { error } : {}),
    ...(requestInfo.consoleOutput && requestInfo.consoleOutput.length > 0
      ? { console: requestInfo.consoleOutput }
      : {}),
  };

  // ── Persist ───────────────────────────────────────────────────────────────
  try {
    await insertLog(database, {
      projectId: resolvedProjectId,
      functionId,
      type: 'request',
      source,
      payload,
      executedAt,
    });

    // Update execution metrics for function invocations
    if (source === 'execution' && functionId) {
      const { Function: FunctionModel } = database.models;
      await FunctionModel.update(
        {
          execution_count: database.sequelize.literal('execution_count + 1'),
          last_executed: new Date(),
        },
        { where: { id: functionId } },
      );
    }
  } catch (dbError) {
    console.error('[insertRequestLog] Failed to write log:', dbError);
  }
}

module.exports = { insertLog, insertRequestLog };
