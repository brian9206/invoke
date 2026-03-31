import path from 'path';
import { getWarmPool, type WarmPoolMetrics } from './warm-pool';
import { executeSandbox } from './sandbox-execution-context';
import { policyRowsToCIDRRules } from './tap-proxy';
import { getExecutionSettings } from './execution-settings';
import type { RequestData } from 'invoke-runtime/dist/protocol';
import {
  createReqObject,
  createResObject,
  stateToResponseData,
} from 'invoke-runtime/dist/request-response';

export interface AppLogEntry {
  level: string;
  message: string;
  functionId: string;
  projectId: string;
  traceId?: string;
  timestamp: number;
}

interface ExecutionEngineOptions {
  kvStoreFactory?: (projectId: string) => any;
  metadataProvider?: (functionId: string) => Promise<any>;
  envVarsProvider?: (functionId: string) => Promise<Record<string, string>>;
  networkPoliciesProvider?: (projectId: string) => Promise<any>;
  appLogHandler?: (entry: AppLogEntry) => void;
}

interface ExecutionResult {
  data?: Buffer | unknown;
  statusCode: number;
  headers?: Record<string, string | string[]>;
  error?: string;
  message?: string;
}

interface RequestLike {
  method: string;
  url: string;
  originalUrl?: string;
  path?: string;
  protocol?: string;
  hostname?: string;
  secure?: boolean;
  ip?: string;
  ips?: string[];
  body?: unknown;
  query?: Record<string, string>;
  params?: Record<string, string> & { [0]?: string; [1]?: string };
  headers?: Record<string, string>;
  connection?: { remoteAddress?: string };
}

interface ContextLike {
  req: RequestLike;
  traceId?: string;
  res?: { data?: unknown };
}

/**
 * ExecutionEngine — Singleton class managing function execution with gVisor sandboxes.
 * Orchestrates warm pool, overlay FS, and sandbox execution.
 */
export class ExecutionEngine {
  private warmPool = getWarmPool();
  private initialized: boolean;
  private sandboxEnabled: boolean;
  private functionTimeout: number;

  private kvStoreFactory: ((projectId: string) => any) | null;
  private metadataProvider: ((functionId: string) => Promise<any>) | null;
  private envVarsProvider: ((functionId: string) => Promise<any>) | null;
  private networkPoliciesProvider: ((projectId: string) => Promise<any>) | null;
  private appLogHandler: ((entry: AppLogEntry) => void) | null;

  constructor(options: ExecutionEngineOptions = {}) {
    this.initialized = false;
    this.sandboxEnabled = true;

    this.functionTimeout = 30_000; // overwritten on initialize() via DB

    this.kvStoreFactory = options.kvStoreFactory ?? null;
    this.metadataProvider = options.metadataProvider ?? null;
    this.envVarsProvider = options.envVarsProvider ?? null;
    this.networkPoliciesProvider = options.networkPoliciesProvider ?? null;
    this.appLogHandler = options.appLogHandler ?? null;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const missing = (
      ['kvStoreFactory', 'metadataProvider', 'envVarsProvider', 'networkPoliciesProvider'] as const
    ).filter((k) => !this[k]);

    if (missing.length) {
      throw new Error(
        `[ExecutionEngine] Missing required providers: ${missing.join(', ')}. Pass them via the constructor options.`,
      );
    }

    // Load execution settings from DB before initialising the pool
    const settings = await getExecutionSettings();
    this.functionTimeout = settings.defaultTimeoutMs;

    try {
      await this.warmPool.initialize(settings.defaultMemoryMb);
      this.sandboxEnabled = true;
    } catch (error: any) {
      const disableFallback = process.env.SANDBOX_FALLBACK_DISABLE === 'true';
      if (disableFallback) {
        throw error;
      }

      this.sandboxEnabled = false;
      console.warn(
        `[ExecutionEngine] Sandbox initialization failed. Falling back to in-process execution mode: ${error?.message || error}`,
      );
    }

    this.initialized = true;
  }

  /** Update default timeout (called when global settings change). */
  updateDefaultTimeout(timeoutMs: number): void {
    this.functionTimeout = timeoutMs;
  }

  async executeFunction(
    indexPath: string,
    context: ContextLike,
    functionId: string,
  ): Promise<ExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const packageDir = path.dirname(indexPath);
    let projectId: string | undefined;
    let sandbox: Awaited<ReturnType<typeof this.warmPool.acquire>> | null = null;
    let wasClean = true;

    try {
      const metadata = await this.metadataProvider!(functionId);
      projectId = metadata.project_id;
      const projectSlug = metadata.project_slug;

      const resolvedProjectId: string = projectId!;
      const traceId = context.traceId;
      const boundConsoleLogger = this.appLogHandler
        ? (data: { level: string; message: string; timestamp: number }) => {
            this.appLogHandler!({ ...data, functionId, projectId: resolvedProjectId, traceId });
          }
        : undefined;

      // Determine effective timeout and memory for this execution
      const settings = await getExecutionSettings();
      const effectiveTimeoutMs = metadata.custom_timeout_enabled && metadata.custom_timeout_seconds
        ? metadata.custom_timeout_seconds * 1000
        : settings.defaultTimeoutMs;
      const effectiveMemoryMb = metadata.custom_memory_enabled && metadata.custom_memory_mb
        ? metadata.custom_memory_mb
        : settings.defaultMemoryMb;

      const envVars = await this.envVarsProvider!(functionId);
      const networkPolicies = await this.networkPoliciesProvider!(resolvedProjectId);
      const kvStore = this.kvStoreFactory!(resolvedProjectId);

      // Build the RequestData for the protocol
      const request: RequestData = {
        method: context.req.method,
        url: context.req.url,
        originalUrl: context.req.originalUrl ?? context.req.url,
        path: context.req.path ?? context.req.url,
        protocol: context.req.protocol ?? 'http',
        hostname: context.req.hostname ?? 'localhost',
        secure: context.req.secure ?? false,
        ip: context.req.ip ?? '127.0.0.1',
        ips: context.req.ips ?? [],
        body: context.req.body ?? {},
        query: context.req.query ?? {},
        params: context.req.params ?? {},
        headers: context.req.headers ?? {},
      };

      if (!this.sandboxEnabled) {
        return await this.executeInProcess(
          indexPath,
          request,
          envVars,
          kvStore,
          effectiveTimeoutMs,
        );
      }

      // Convert DB network policy rows to CIDR rules for the TAP proxy
      const cidrRules = policyRowsToCIDRRules([
        ...(networkPolicies.globalRules || []),
        ...(networkPolicies.projectRules || []),
      ]);

      // Acquire a sandbox from the warm pool
      sandbox = await this.warmPool.acquire(packageDir, cidrRules, effectiveMemoryMb);

      // Execute inside the sandbox
      const result = await executeSandbox(sandbox, {
        codePath: '/app/index.js',
        request,
        env: envVars,
        timeoutMs: effectiveTimeoutMs,
        kvStore,
        projectSlug,
        consoleLogger: boundConsoleLogger,
      });

      return {
        data: result.data,
        statusCode: result.statusCode,
        headers: result.headers,
        error: result.error,
      };
    } catch (error: any) {
      console.error('[ExecutionEngine] Execution error:', error);
      wasClean = false;

      if (this.appLogHandler && projectId) {
        this.appLogHandler({
          level: 'error',
          message: `[ExecutionEngine] Execution error: ${error.toString()}.`,
          functionId,
          projectId,
          traceId: context.traceId,
          timestamp: Date.now(),
        });
      }

      const errorMessage = error.message || String(error);
      const errorStack = error.stack || '';

      return {
        error: errorMessage + (errorStack ? '\n' + errorStack : ''),
        statusCode: 500,
      };
    } finally {
      if (sandbox) {
        await this.warmPool.release(sandbox, wasClean);
      }
    }
  }

  getMetrics(): { sandboxPool: WarmPoolMetrics | null; sandboxEnabled: boolean } {
    return {
      sandboxPool: this.sandboxEnabled ? this.warmPool.getMetrics() : null,
      sandboxEnabled: this.sandboxEnabled,
    };
  }

  async shutdown(): Promise<void> {
    if (this.sandboxEnabled) {
      await this.warmPool.shutdown();
    }
    this.initialized = false;
  }

  private async executeInProcess(
    indexPath: string,
    request: RequestData,
    envVars: Record<string, string>,
    kvStore: any,
    timeoutMs: number,
  ): Promise<ExecutionResult> {
    const previousKv = (globalThis as any).kv;
    const previousRealtime = (globalThis as any).realtime;
    const previousEnv = new Map<string, string | undefined>();

    for (const [key, value] of Object.entries(envVars)) {
      previousEnv.set(key, process.env[key]);
      process.env[key] = value;
    }

    (globalThis as any).kv = {
      get: async (key: string) => kvStore.get(key),
      set: async (key: string, value: unknown, ttl?: number) => kvStore.set(key, value, ttl),
      delete: async (key: string) => kvStore.delete(key),
      clear: async () => kvStore.clear(),
      has: async (key: string) => kvStore.has(key),
    };

    (globalThis as any).realtime = {
      send: async () => {},
      emit: async () => {},
      broadcast: async () => {},
      join: async () => {},
      leave: async () => {},
      emitToRoom: async () => {},
    };

    try {
      delete require.cache[require.resolve(indexPath)];
      const loaded = require(indexPath);
      const handler = typeof loaded === 'function'
        ? loaded
        : typeof loaded.default === 'function'
          ? loaded.default
          : null;

      if (!handler) {
        throw new Error('Module must export a function. Expected: module.exports = function(req, res) {...}');
      }

      const req = createReqObject(request);
      const { res, state } = createResObject(req);

      await Promise.race([
        (async () => {
          const result = handler(req, res);
          if (result && typeof result.then === 'function') {
            await result;
          }
        })(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Function execution timeout (${timeoutMs}ms)`)), timeoutMs);
        }),
      ]);

      const response = stateToResponseData(state);
      return {
        data: response.body ? Buffer.from(response.body, 'base64') : undefined,
        statusCode: response.statusCode,
        headers: response.headers,
      };
    } finally {
      (globalThis as any).kv = previousKv;
      (globalThis as any).realtime = previousRealtime;

      for (const [key, oldValue] of previousEnv.entries()) {
        if (oldValue === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = oldValue;
        }
      }
    }
  }
}

function createRequestObject(
  method = 'POST',
  body: unknown = {},
  query: Record<string, string> = {},
  headers: Record<string, string> = {},
  params: Record<string, string> = {},
  originalReq: RequestLike = {} as RequestLike,
): RequestLike {
  let pathAfterFunctionId = originalReq.params?.[1] ?? '';

  let url = pathAfterFunctionId ? `/${pathAfterFunctionId}` : '/';

  if (originalReq.originalUrl) {
    const queryString = originalReq.originalUrl.split('?')[1];
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const protocol = originalReq.protocol ?? 'http';

  return {
    method,
    url,
    originalUrl: url,
    path: url.split('?')[0],
    protocol,
    hostname: 'localhost',
    secure: protocol === 'https',
    ip:
      originalReq.ip ||
      originalReq.connection?.remoteAddress ||
      '127.0.0.1',
    ips: originalReq.ips ?? [],
    body,
    query,
    params,
    headers,
  };
}

interface CreateExecutionContextOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  originalReq?: RequestLike;
  traceId?: string;
}

export function createExecutionContext({
  method = 'POST',
  body = {},
  query = {},
  headers = {},
  params = {},
  originalReq = {} as RequestLike,
  traceId,
}: CreateExecutionContextOptions = {}): ContextLike {
  return {
    req: createRequestObject(method, body, query, headers, params, originalReq),
    traceId,
  };
}
