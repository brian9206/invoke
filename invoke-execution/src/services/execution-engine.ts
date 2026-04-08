import dns from 'dns/promises';
import path from 'path';
import { getSandboxPool, type SandboxPoolMetrics } from './sandbox-pool';
import { executeSandbox } from './sandbox-execution-context';
import { getExecutionSettings } from './execution-settings';
import type { NetworkRule } from './sandbox-orchestrator';
import type { RequestData } from 'invoke-runtime/dist/protocol';
import type { FunctionMetadata } from './function-providers';

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
 * ExecutionEngine — Manages function execution with Docker containers
 * via SandboxOrchestrator and SandboxPool.
 */
export class ExecutionEngine {
  private pool = getSandboxPool();
  private initialized = false;
  private functionTimeout = 30_000;

  private kvStoreFactory: ((projectId: string) => any) | null;
  private envVarsProvider: ((functionId: string) => Promise<any>) | null;
  private networkPoliciesProvider: ((projectId: string) => Promise<any>) | null;
  private appLogHandler: ((entry: AppLogEntry) => void) | null;

  constructor(options: ExecutionEngineOptions = {}) {
    this.kvStoreFactory = options.kvStoreFactory ?? null;
    this.envVarsProvider = options.envVarsProvider ?? null;
    this.networkPoliciesProvider = options.networkPoliciesProvider ?? null;
    this.appLogHandler = options.appLogHandler ?? null;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const missing = (
      ['kvStoreFactory', 'envVarsProvider', 'networkPoliciesProvider'] as const
    ).filter((k) => !this[k]);

    if (missing.length) {
      throw new Error(
        `[ExecutionEngine] Missing required providers: ${missing.join(', ')}. Pass them via the constructor options.`,
      );
    }

    // Load execution settings from DB
    const settings = await getExecutionSettings();
    this.functionTimeout = settings.defaultTimeoutMs;

    // Initialize the sandbox pool (pre-spawns containers)
    await this.pool.initialize();

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
    metadata: FunctionMetadata,
  ): Promise<ExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    let projectId: string | undefined;
    let sandbox: Awaited<ReturnType<typeof this.pool.acquire>> | null = null;

    try {
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

      // Determine the function ID used to resolve the path inside the container.
      // The cache stores extracted packages at /tmp/cache/packages/{functionId}[-v{version}]/
      // which is bind-mounted to /functions/ inside the container.
      // indexPath looks like: /tmp/cache/packages/{dirName}/index.js
      const packageDirName = path.basename(path.dirname(indexPath));

      // Resolve network policies → Docker network rules
      const allPolicyRows = [
        ...(networkPolicies.globalRules || []),
        ...(networkPolicies.projectRules || []),
      ];

      const hasNetworkRules = false//allPolicyRows.length > 0;

      if (hasNetworkRules) {
        // Convert policy rows to NetworkRules for iptables
        const networkRules = await policyRowsToNetworkRules(allPolicyRows);
        const networkName = `invoke-${resolvedProjectId}`;
        await this.pool.ensureNetwork(networkName, networkRules);
        sandbox = await this.pool.acquireWithNetwork(networkName);
      } else {
        // No policies — use pooled container with network=none
        sandbox = await this.pool.acquire();
      }

      // Execute inside the container
      const result = await executeSandbox(sandbox, {
        functionId: packageDirName,
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
    }
    // Note: no release() call needed — the container self-reports 'ready'
    // after the supervisor cleans up the overlay, and the pool handles it.
  }

  getMetrics(): { sandboxPool: SandboxPoolMetrics | null } {
    return {
      sandboxPool: this.initialized ? this.pool.getMetrics() : null,
    };
  }

  async shutdown(): Promise<void> {
    await this.pool.shutdown();
    this.initialized = false;
  }

  /**
   * Remove a project's Docker network so it gets re-created with fresh rules
   * on the next invocation. Called when network policies change via PG-NOTIFY.
   */
  async invalidateProjectNetwork(projectId: string): Promise<void> {
    const networkName = `invoke-${projectId}`;
    try {
      await this.pool.removeNetwork(networkName);
      console.log(`[NetworkPolicy] Removed network ${networkName} — will be re-created on next invoke`);
    } catch {
      // Network may not exist yet, that's fine
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

// ---------------------------------------------------------------------------
// Network policy helpers
// ---------------------------------------------------------------------------

interface PolicyRow {
  action: 'allow' | 'deny';
  target_type: 'ip' | 'cidr' | 'domain';
  target_value: string;
  priority: number;
}

const IPV4_CIDR_RE = /^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Convert DB network-policy rows into iptables-compatible NetworkRule[].
 * - `allow` → RETURN, `deny` → DROP
 * - ip targets get /32 suffix
 * - domain targets are resolved via DNS (all A records)
 * - Rules are sorted by priority (ascending — lowest number = highest priority)
 */
async function policyRowsToNetworkRules(rows: PolicyRow[]): Promise<NetworkRule[]> {
  const sorted = [...rows].sort((a, b) => a.priority - b.priority);
  const rules: NetworkRule[] = [];

  for (const row of sorted) {
    const action = row.action === 'allow' ? 'RETURN' : 'DROP';

    switch (row.target_type) {
      case 'cidr':
        if (IPV4_CIDR_RE.test(row.target_value)) {
          rules.push({ cidr: row.target_value, action });
        } else {
          console.warn(`[NetworkPolicy] Skipping non-IPv4 CIDR target "${row.target_value}"`);
        }
        break;

      case 'ip':
        if (IPV4_RE.test(row.target_value)) {
          rules.push({ cidr: `${row.target_value}/32`, action });
        } else {
          console.warn(`[NetworkPolicy] Skipping non-IPv4 IP target "${row.target_value}"`);
        }
        break;

      case 'domain':
        try {
          const addresses = await dns.resolve4(row.target_value);
          for (const addr of addresses) {
            rules.push({ cidr: `${addr}/32`, action });
          }
        } catch {
          console.warn(`[NetworkPolicy] DNS resolution failed for domain "${row.target_value}", skipping`);
        }
        break;
    }
  }

  if (rows.length > 0 && rules.length === 0) {
    throw new Error(
      'Network policies only contained unsupported targets. Only IPv4 ip/cidr/domain rules are currently supported.',
    );
  }

  return rules;
}
