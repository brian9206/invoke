import axios from 'axios';

const LOGGER_URL = process.env.LOGGER_SERVICE_URL;
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;

const DEFAULT_MAX_RESPONSE_LOG_SIZE = 10 * 1024 * 1024; // 10 MB

function getMaxResponseLogSize(): number {
  const envValue = process.env.MAX_RESPONSE_LOG_SIZE;
  if (!envValue) return DEFAULT_MAX_RESPONSE_LOG_SIZE;
  const parsed = parseInt(envValue, 10);
  if (isNaN(parsed) || parsed <= 0) return DEFAULT_MAX_RESPONSE_LOG_SIZE;
  return parsed;
}

function isTextContentType(contentType: string): boolean {
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

function toNullableSize(value: unknown): number | null {
  if (value == null || !Number.isFinite(value as number) || (value as number) < 0) return null;
  return Math.trunc(value as number);
}

function postLog(body: Record<string, unknown>): void {
  if (!LOGGER_URL) {
    console.warn('[LoggerClient] LOGGER_SERVICE_URL is not set. Log dropped.');
    return;
  }
  axios
    .post(`${LOGGER_URL}/log`, body, {
      headers: {
        'Content-Type': 'application/json',
        ...(INTERNAL_SECRET ? { 'x-internal-secret': INTERNAL_SECRET } : {}),
      },
    })
    .catch((err: Error) => {
      console.error('[LoggerClient] Failed to send log:', err.message);
    });
}

export interface AppLogOptions {
  project?: { id?: string; name?: string | null };
  function?: { id?: string; name?: string | null };
  payload: Record<string, unknown>;
  executedAt?: Date;
}

export interface BuildLogOptions {
  project?: { id?: string; name?: string | null };
  function?: { id?: string; name?: string | null };
  build: { 
    id: string; 
    version: number,
    stage: string;
  };
  message: string;
}

export interface RequestLogInfo {
  request?: {
    url?: string;
    method?: string;
    ip?: string | null;
    userAgent?: string;
    headers?: Record<string, unknown>;
    body?: {
      size?: number | null;
      payload?: string;
    };
  };
  response?: {
    headers?: Record<string, string | string[]>;
    body?: {
      size?: number | null;
      payload?: Buffer | string | unknown;
    };
  };
}

export interface RequestLogOptions {
  project?: { id?: string; name?: string | null };
  function?: { id?: string; name?: string | null };
  traceId?: string;
  executionTime: number;
  statusCode: number;
  error?: string | null;
  requestInfo?: RequestLogInfo;
}

/**
 * Fire-and-forget: send an app log entry to invoke-logger.
 */
export function insertAppLog(opts: AppLogOptions): void {
  postLog({
    project: opts.project,
    function: opts.function,
    type: 'app',
    source: 'execution',
    payload: opts.payload,
    executedAt: opts.executedAt?.toISOString(),
  });
}

/**
 * Fire-and-forget: send an build log entry to invoke-logger.
 */
export function insertBuildLog(opts: BuildLogOptions): void {
  postLog({
    project: opts.project,
    function: opts.function,
    type: 'build',
    payload: {
      build: opts.build,
      message: opts.message,
    }
  });
}

/**
 * Fire-and-forget: build the structured request log payload locally
 * (handling response body text/binary serialization and truncation),
 * then send to invoke-logger.
 */
export function insertRequestLog(opts: RequestLogOptions): void {
  const {
    project,
    function: functionArg,
    traceId,
    executionTime,
    statusCode,
    error = null,
    requestInfo = {},
  } = opts;

  // Serialize response body
  const MAX_RESPONSE_LOG_SIZE = getMaxResponseLogSize();
  let responseBodyLog = '';

  if (requestInfo.response?.body?.payload) {
    const contentType = (requestInfo.response?.headers?.['content-type'] || '') as string;

    if (isTextContentType(contentType)) {
      const rawPayload = requestInfo.response.body.payload;
      if (Buffer.isBuffer(rawPayload)) {
        responseBodyLog = rawPayload.toString('utf8');
      } else if (typeof rawPayload === 'string') {
        responseBodyLog = rawPayload;
      } else {
        responseBodyLog = JSON.stringify(rawPayload);
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

  const executedAt = new Date();

  const payload: Record<string, unknown> = {
    executed_at: executedAt.toISOString(),
    execution_time_ms: executionTime,
    ...(traceId ? { trace_id: traceId } : {}),
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
    error: error || undefined,
  };

  postLog({
    project,
    function: functionArg,
    type: 'request',
    source: 'execution',
    payload,
    executedAt: executedAt.toISOString(),
  });
}
