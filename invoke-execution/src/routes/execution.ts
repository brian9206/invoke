import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import { insertRequestLog } from 'invoke-shared';
import database from '../services/database';
import cache from '../services/cache';
import { executeFunction, createExecutionContext, getFunctionPackage } from '../services/execution-service';
import { gatewayAuth } from '../middleware/gateway-auth';

const router = express.Router();

async function authenticateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const { Function: FunctionModel, FunctionVersion } = database.models;

    if ((req as any).isFromGateway) {
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

      (req as any).functionInfo = func.get({ plain: true });
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

    const functionInfo = func.get({ plain: true });

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

    (req as any).functionInfo = functionInfo;
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({ success: false, message: 'Authentication error' });
  }
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
router.all(/^\/([^/]+)(?:\/(.*))?$/, gatewayAuth, authenticateApiKey, async (req: Request, res: Response): Promise<void> => {
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

    const packageInfo = await getFunctionPackage(functionId);

    const executionContext = createExecutionContext(
      req.method,
      req.body ?? {},
      queryParams as Record<string, string>,
      filterHeaders(headers as Record<string, string | string[]>),
      { functionId },
      req as any,
      packageInfo.tempDir,
    );

    const result = await executeFunction(packageInfo.indexPath, executionContext, functionId);

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
      requestSize,
      responseSize,
      clientIp: (req as any).trustedClientIp,
      userAgent: req.headers['user-agent'],
      consoleOutput: result.logs || [],
      requestHeaders: req.headers,
      responseHeaders: result.headers || {},
      requestMethod: req.method,
      requestUrl: executionContext.req.url,
      requestBody,
      responseBody: result.data,
    };

    const projectId = (req as any).functionInfo?.project_id;
    await insertRequestLog(database, {
      projectId,
      functionId,
      source: 'execution',
      traceId,
      executionTime,
      statusCode,
      error: result.error ?? undefined,
      requestInfo,
    });

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
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    console.error('Execution error:', error);
    const projectId = (req as any).functionInfo?.project_id;
    if (projectId) {
      await insertRequestLog(database, {
        projectId,
        functionId: (req.params as any)[0],
        source: 'execution',
        traceId,
        executionTime,
        statusCode: 500,
        error: error.message,
      });
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
