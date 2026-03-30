import path from 'path';
import ivm from 'isolated-vm';
import ExecutionContext from './execution-context';
import { getInstance as getIsolatePool } from './isolate-pool';
import { getExecutionSettings } from './execution-settings';

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
 * ExecutionEngine — Singleton class managing function execution with isolated-vm.
 * Orchestrates isolate pool, VFS, module loading, and execution.
 */
export class ExecutionEngine {
  private isolatePool: ReturnType<typeof getIsolatePool> | null;
  private initialized: boolean;
  private functionTimeout: number;

  private kvStoreFactory: ((projectId: string) => any) | null;
  private metadataProvider: ((functionId: string) => Promise<any>) | null;
  private envVarsProvider: ((functionId: string) => Promise<any>) | null;
  private networkPoliciesProvider: ((projectId: string) => Promise<any>) | null;
  private appLogHandler: ((entry: AppLogEntry) => void) | null;

  constructor(options: ExecutionEngineOptions = {}) {
    this.isolatePool = null;
    this.initialized = false;

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

    this.isolatePool = getIsolatePool();
    await this.isolatePool.initialize(settings.defaultMemoryMb);

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
    let isolate: ivm.Isolate | null = null;
    let ivmContext: ivm.Context | null = null;
    let executionContext: ExecutionContext | null = null;
    let projectId: string | undefined;

    try {
      const metadata = await this.metadataProvider!(functionId);
      const packageHash = metadata.package_hash;
      projectId = metadata.project_id;
      const projectSlug = metadata.project_slug;

      const traceId = context.traceId;
      const boundConsoleLogger = this.appLogHandler
        ? (data: { level: string; message: string; timestamp: number }) => {
            this.appLogHandler!({ ...data, functionId, projectId, traceId });
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
      const networkPolicies = await this.networkPoliciesProvider!(projectId);
      const kvStore = this.kvStoreFactory!(projectId);

      const acquired = await this.isolatePool!.acquireWithMemory(effectiveMemoryMb);
      isolate = acquired.isolate;
      ivmContext = acquired.context;

      executionContext = new ExecutionContext(
        isolate,
        ivmContext,
        packageDir,
        functionId,
        packageHash,
        envVars,
        acquired.compiledScript,
        projectId,
        projectSlug,
        kvStore,
        networkPolicies,
        boundConsoleLogger,
      );

      await executionContext.bootstrap();

      const reqData = {
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

      await executionContext.setupRequest(reqData);
      await executionContext.setupResponse();

      const virtualIndexPath = '/app/index.js';
      const vfs = executionContext.vfs;
      const vfsFs = vfs.createNodeFSModule();
      const userCode = vfsFs.readFileSync(virtualIndexPath, 'utf8');

      const executeCode = `
(async function() {
    const module = { exports: {} };
    const exports = module.exports;
    const __filename = '/app/index.js';
    const __dirname = '/app';

    ${userCode}

    if (typeof module.exports !== 'function') {
        throw new Error('Module must export a function. Expected: module.exports = function(req, res) {...}');
    }

    const result = module.exports(req, res);
    if (result && typeof result.then === 'function') {
        await result;
    }

    return undefined;
})();
`;

      const executeScript = await isolate.compileScript(executeCode, {
        filename: '/app/index.js',
      });

      try {
        await executeScript.run(ivmContext, {
          timeout: effectiveTimeoutMs,
          promise: true,
        });
      } catch (error: any) {
        if (error.message && error.message.includes('Script execution timed out')) {
          this.isolatePool!.release(isolate, false);
          isolate = null;
          throw new Error(`Function execution timeout (${effectiveTimeoutMs}ms)`);
        }
        throw error;
      }

      const response = executionContext.getResponse();

      this.isolatePool!.release(isolate, true);
      isolate = null;

      executionContext.cleanup();

      return {
        data: response.data,
        statusCode: response.statusCode,
        headers: response.headers,
      };
    } catch (error: any) {
      console.error('[ExecutionEngine] Execution error:', error);

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

      if (isolate) {
        const isCorrupted =
          error.message &&
          (error.message.includes('timeout') ||
            error.message.includes('out of memory') ||
            error.message.includes('memory limit'));

        this.isolatePool!.release(isolate, !isCorrupted);
      }

      if (executionContext) {
        executionContext.cleanup();
      }

      const errorMessage = error.message || String(error);
      const errorStack = error.stack || '';

      return {
        error: errorMessage + (errorStack ? '\n' + errorStack : ''),
        statusCode: 500,
      };
    }
  }

  getMetrics(): { isolatePool: ReturnType<ReturnType<typeof getIsolatePool>['getMetrics']> | null } {
    const isolatePoolMetrics = this.isolatePool ? this.isolatePool.getMetrics() : null;
    return { isolatePool: isolatePoolMetrics };
  }

  async shutdown(): Promise<void> {
    if (this.isolatePool) {
      await this.isolatePool.shutdown();
    }
    this.initialized = false;
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
