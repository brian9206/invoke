import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import database from '../services/database';
import { insertRequestLog } from '../services/logger-client';
import cache from '../services/cache';
import { executeFunction, createExecutionContext, getFunctionPackage } from '../services/execution-service';
import { gatewayAuth } from '../middleware/gateway-auth';
import type { FunctionMetadata } from '../services/function-providers';

const router = express.Router();

// In-memory TTL cache for function metadata (avoids a DB round-trip on every invocation).
// Invalidated by pg-notify via the gateway's function-change channel.
const functionInfoCache = new Map<string, { data: any; expiresAt: number }>();
const FUNCTION_INFO_TTL_MS = 30_000; // 30 seconds

export function invalidateFunctionInfoCache(functionId: string): void {
  functionInfoCache.delete(functionId);
}

async function fetchFunctionInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const functionId: string = (req.params as any)[0] || (req.params as any).functionId;

    if (
      !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
        functionId,
      )
    ) {
      res.status(404).json({ success: false, message: 'Function not found' });
      return;
    }

    // Check in-memory cache first
    const cached = functionInfoCache.get(functionId);
    if (cached && cached.expiresAt > Date.now()) {
      req.functionInfo = cached.data;
      return next();
    }

    const { Function: FunctionModel, FunctionVersion } = database.models;

    const func = await FunctionModel.findOne({
      where: { id: functionId, is_active: true },
      include: [
        { model: FunctionVersion, as: 'activeVersion' },
        { model: database.models.Project, where: { is_active: true }, required: true },
      ],
    });

    if (!func) {
      res.status(404).json({ success: false, message: 'Function not found' });
      return;
    }

    const plain = func.get({ plain: true });
    functionInfoCache.set(functionId, { data: plain, expiresAt: Date.now() + FUNCTION_INFO_TTL_MS });
    req.functionInfo = plain;
    next();
  } catch (error) {
    console.error('fetchFunctionInfo error:', error);
    res.status(500).json({ success: false, message: 'Authentication error' });
  }
}

async function authenticateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.isFromGateway) {
    return next();
  }

  let apiKey: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7);
  }
  if (!apiKey) {
    apiKey = (req.query.api_key || req.query.apiKey) as string ?? null;
  }
  if (!apiKey) {
    apiKey = req.headers['x-api-key'] as string ?? null;
  }

  const functionInfo = req.functionInfo!;

  if (functionInfo.requires_api_key && functionInfo.api_key) {
    if (!apiKey) {
      res.status(401).json({ success: false, message: 'API key required' });
      return;
    }
    if (apiKey !== functionInfo.api_key) {
      res.status(403).json({ success: false, message: 'Invalid API key' });
      return;
    }
  }

  next();
}

function createResponse(
  success: boolean,
  data: unknown = null,
  message = '',
  statusCode = 200,
): object {
  return { success, data, message, statusCode, timestamp: new Date().toISOString() };
}

function filterHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const filtered: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      filtered[key] = value;
    } else if (Array.isArray(value)) {
      filtered[key] = value.join(', ');
    }
  }

  delete filtered['x-api-key'];
  delete filtered['authorization'];
  delete filtered['host'];
  delete filtered['x-forwarded-for'];
  delete filtered['x-invoke-data'];

  if (filtered['cookie']) {
    const cookies = filtered['cookie']
      .split(';')
      .map((c) => c.trim())
      .filter((cookie) => {
        const name = cookie.split('=')[0];
        return name !== 'auth-token';
      });

    if (cookies.length > 0) {
      filtered['cookie'] = cookies.join('; ');
    } else {
      delete filtered['cookie'];
    }
  }

  return filtered;
}

// All function invocations — handles GET, POST, PUT, DELETE, PATCH, etc.
router.all(/^\/([^/]+)(?:\/(.*))?$/, gatewayAuth, fetchFunctionInfo, authenticateApiKey, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  // Propagate or generate a trace ID.
  const traceId: string =
    (req.headers['x-trace-id'] as string) || crypto.randomUUID();
  res.setHeader('x-trace-id', traceId);

  const parseContentLength = (value: string | string[] | undefined): number | null => {
    if (!value) return null;
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  };

  try {
    const functionId = (req.params as any)[0];
    const { query: queryParams, headers } = req;

    // Build FunctionMetadata from the already-fetched req.functionInfo (no extra DB query)
    const fi = req.functionInfo as any;
    const fv = fi.activeVersion;
    const metadata: FunctionMetadata = {
      id: fi.id,
      name: fi.name,
      project_id: fi.project_id,
      project_slug: fi.Project?.slug ?? '',
      is_active: fi.is_active,
      created_at: fi.created_at,
      updated_at: fi.updated_at,
      version: fv?.version ?? null,
      package_path: fv?.package_path ?? null,
      package_hash: fv?.package_hash ?? null,
      file_size: fv?.file_size ?? null,
      custom_timeout_enabled: fi.custom_timeout_enabled ?? false,
      custom_timeout_seconds: fi.custom_timeout_seconds ?? null,
      custom_memory_enabled: fi.custom_memory_enabled ?? false,
      custom_memory_mb: fi.custom_memory_mb ?? null,
    };

    let t1 = Date.now();
    const packageInfo = await getFunctionPackage(functionId, metadata);
    const packageTime = Date.now() - t1;

    const executionContext = createExecutionContext({
      method: req.method,
      body: req.body ?? {},
      query: queryParams as Record<string, string>,
      headers: filterHeaders(headers as Record<string, string | string[]>),
      params: { functionId },
      originalReq: req as any,
      traceId,
    });

    let t2 = Date.now();
    const result = await executeFunction(packageInfo.indexPath, executionContext, functionId, metadata);
    const executeTime = Date.now() - t2;

    const executionTime = Date.now() - startTime;
    const statusCode = result.statusCode || 200;

    let responseSize: number | null = null;
    if (Buffer.isBuffer(result.data)) {
      responseSize = Buffer.byteLength(result.data as Buffer);
    } else if (typeof result.data === 'string') {
      responseSize = Buffer.byteLength(result.data, 'utf8');
    } else if (result.data !== undefined && result.data !== null) {
      responseSize = JSON.stringify(result.data).length;
    }

    let requestSize = parseContentLength(req.headers['content-length']);
    if (requestSize == null && Buffer.isBuffer(req.body)) {
      requestSize = Buffer.byteLength(req.body as Buffer);
    } else if (requestSize == null && typeof req.body === 'string') {
      requestSize = Buffer.byteLength(req.body, 'utf8');
    } else if (requestSize == null && req.body !== undefined && req.body !== null) {
      requestSize = JSON.stringify(req.body).length;
    }

    const requestBody = req.body === undefined || req.body === null ? '' : JSON.stringify(req.body);

    const requestInfo = {
      request: {
        url: executionContext.req.url,
        method: req.method,
        ip: req.trustedClientIp,
        userAgent: req.headers['user-agent'],
        headers: req.headers,
        body: {
          size: requestSize,
          payload: requestBody,
        },
      },
      response: {
        headers: result.headers || {},
        body: {
          size: responseSize,
          payload: result.data,
        },
      },
    };

    insertRequestLog({
      project: { id: req.functionInfo?.project_id, name: req.functionInfo?.Project?.name },
      function: { id: functionId, name: req.functionInfo?.name },
      traceId,
      executionTime,
      statusCode,
      error: result.error ?? undefined,
      requestInfo,
    });

    // Send HTTP response first, then do non-critical DB bookkeeping
    if (result.error) {
      res.status(statusCode).json({
        success: false,
        data: result.data,
        message: result.message || 'Execution failed',
      });
    } else {
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach((v) => res.append(key, v));
          } else {
            res.setHeader(key, value);
          }
        });
      }
      res.status(statusCode).send(result.data);
    }

    // Fire-and-forget: update execution count after response is sent
    const { Function: FunctionModel } = database.models;
    FunctionModel.update(
      { execution_count: database.sequelize.literal('execution_count + 1'), last_executed: new Date() },
      { where: { id: functionId } },
    ).catch((err: any) => console.error('[TIMING] FunctionModel.update failed:', err.message));

    console.log(
      `[TIMING] ${functionId}: total=${executionTime}ms | package=${packageTime}ms | execute=${executeTime}ms`,
    );
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    console.error('Execution error:', error);
    if (req.functionInfo?.project_id) {
      const errorFunctionId = (req.params as any)[0];
      insertRequestLog({
        project: { id: req.functionInfo.project_id, name: req.functionInfo?.Project?.name },
        function: { id: errorFunctionId, name: req.functionInfo?.name },
        traceId,
        executionTime,
        statusCode: 500,
        error: error.message,
      });
      const { Function: FunctionModel } = database.models;
      await FunctionModel.update(
        { execution_count: database.sequelize.literal('execution_count + 1'), last_executed: new Date() },
        { where: { id: errorFunctionId } },
      );
    }
    res.status(500).json(createResponse(false, null, 'Execution failed', 500));
  }
});

router.get('/cache/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await cache.getCacheStats();
    res.json(createResponse(true, stats, 'Cache statistics retrieved successfully'));
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json(createResponse(false, null, 'Failed to get cache statistics'));
  }
});

router.post('/cache/cleanup', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await cache.cleanupCache();
    res.json(createResponse(true, result, 'Cache cleanup completed successfully'));
  } catch (error) {
    console.error('Error during cache cleanup:', error);
    res.status(500).json(createResponse(false, null, 'Cache cleanup failed'));
  }
});

export default router;
