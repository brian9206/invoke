// ============================================================================
// SandboxExecutionContext — Orchestrates a single function execution
// inside a gVisor sandbox over the Unix socket protocol.
// ============================================================================

import crypto from 'crypto';
import axios from 'axios';
import sandboxManager, { type Sandbox } from './sandbox-manager';
import {
  encode,
  type ExecuteMessage,
  type ExecuteResultMessage,
  type ShimMessage,
  type ConsoleMessage,
  type KvGetMessage,
  type KvSetMessage,
  type KvDeleteMessage,
  type KvClearMessage,
  type KvHasMessage,
  type RealtimeCommandMessage,
  type RequestData,
  type ResponseData,
} from 'invoke-runtime/dist/protocol';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SandboxExecutionResult {
  data?: Buffer;
  statusCode: number;
  headers?: Record<string, string | string[]>;
  error?: string;
}

export interface SandboxExecutionOptions {
  /** Absolute host path to the function's index.js inside the merged overlay */
  codePath: string;
  /** Request data forwarded to the sandbox */
  request: RequestData;
  /** Environment variables injected into the sandbox */
  env: Record<string, string>;
  /** Execution timeout in milliseconds */
  timeoutMs: number;
  /** KV store instance for the project */
  kvStore: any;
  /** Project slug for realtime namespace resolution */
  projectSlug: string;
  /** Console log handler (optional) */
  consoleLogger?: (data: { level: string; message: string; timestamp: number }) => void;
}

// ---------------------------------------------------------------------------
// SandboxExecutionContext
// ---------------------------------------------------------------------------

export async function executeSandbox(
  sandbox: Sandbox,
  options: SandboxExecutionOptions,
): Promise<SandboxExecutionResult> {
  const {
    codePath,
    request,
    env,
    timeoutMs,
    kvStore,
    projectSlug,
    consoleLogger,
  } = options;

  const gatewayInternalUrl = process.env.GATEWAY_SERVICE_URL || 'http://localhost:3000';
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET || '';

  return new Promise<SandboxExecutionResult>((resolve, reject) => {
    const executeId = crypto.randomBytes(8).toString('hex');
    let settled = false;

    // Timeout guard
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Function execution timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    // ------------------------------------------------------------------
    // Message routing: handle shim → host messages
    // ------------------------------------------------------------------

    sandboxManager.setupMessageRouting(sandbox, async (msg: ShimMessage) => {
      if (settled) return;

      switch (msg.type) {
        // ---- Execute result (final answer) ----
        case 'execute_result': {
          const result = msg as ExecuteResultMessage;
          if (result.id !== executeId) return;

          clearTimeout(timer);
          if (settled) return;
          settled = true;

          const response = result.response;
          const bodyBuf = response.body
            ? Buffer.from(response.body, 'base64')
            : undefined;

          resolve({
            data: bodyBuf,
            statusCode: response.statusCode,
            headers: response.headers,
          });
          break;
        }

        // ---- Error from shim ----
        case 'error': {
          if ((msg as any).id && (msg as any).id !== executeId) return;

          clearTimeout(timer);
          if (settled) return;
          settled = true;

          resolve({
            error: (msg as any).error || 'Unknown sandbox error',
            statusCode: 500,
          });
          break;
        }

        // ---- Console (fire-and-forget) ----
        case 'console': {
          const consoleMsg = msg as ConsoleMessage;
          const message = consoleMsg.args.join(' ');
          consoleLogger?.({ level: consoleMsg.level, message, timestamp: Date.now() });
          break;
        }

        // ---- KV operations (need host-side fulfillment) ----
        case 'kv_get': {
          const m = msg as KvGetMessage;
          try {
            const value = await kvStore.get(m.key);
            sandboxManager.sendMessage(sandbox, {
              type: 'kv_result',
              id: m.id,
              value: value === undefined || value === null ? undefined : value,
            });
          } catch (err: any) {
            sandboxManager.sendMessage(sandbox, {
              type: 'kv_result',
              id: m.id,
              error: err.message,
            });
          }
          break;
        }
        case 'kv_set': {
          const m = msg as KvSetMessage;
          try {
            const parsed = JSON.parse(m.value);
            await kvStore.set(m.key, parsed, m.ttl);
            sandboxManager.sendMessage(sandbox, {
              type: 'kv_result',
              id: m.id,
              value: true,
            });
          } catch (err: any) {
            sandboxManager.sendMessage(sandbox, {
              type: 'kv_result',
              id: m.id,
              error: err.message,
            });
          }
          break;
        }
        case 'kv_delete': {
          const m = msg as KvDeleteMessage;
          try {
            const result = await kvStore.delete(m.key);
            sandboxManager.sendMessage(sandbox, {
              type: 'kv_result',
              id: m.id,
              value: result,
            });
          } catch (err: any) {
            sandboxManager.sendMessage(sandbox, {
              type: 'kv_result',
              id: m.id,
              error: err.message,
            });
          }
          break;
        }
        case 'kv_clear': {
          const m = msg as KvClearMessage;
          try {
            await kvStore.clear();
            sandboxManager.sendMessage(sandbox, {
              type: 'kv_result',
              id: m.id,
              value: true,
            });
          } catch (err: any) {
            sandboxManager.sendMessage(sandbox, {
              type: 'kv_result',
              id: m.id,
              error: err.message,
            });
          }
          break;
        }
        case 'kv_has': {
          const m = msg as KvHasMessage;
          try {
            const result = await kvStore.has(m.key);
            sandboxManager.sendMessage(sandbox, {
              type: 'kv_result',
              id: m.id,
              value: result,
            });
          } catch (err: any) {
            sandboxManager.sendMessage(sandbox, {
              type: 'kv_result',
              id: m.id,
              error: err.message,
            });
          }
          break;
        }

        // ---- Realtime socket ----
        case 'realtime_cmd': {
          const m = msg as RealtimeCommandMessage;
          const cmd = m.cmd as Record<string, any>;

          // Resolve namespace: prepend project slug if not already prefixed
          if (cmd.namespace) {
            const prefix = `/${projectSlug}/`;
            if (!cmd.namespace.startsWith(prefix) && cmd.namespace !== `/${projectSlug}`) {
              const cleanNamespace = (cmd.namespace as string).replace(/^\//, '');
              cmd.namespace = `/${projectSlug}/${cleanNamespace}`;
            }
          }

          try {
            await axios.post(`${gatewayInternalUrl}/_realtime/command`, cmd, {
              headers: { 'x-internal-secret': internalSecret },
              timeout: 5000,
            });
            sandboxManager.sendMessage(sandbox, {
              type: 'realtime_result',
              id: m.id,
            });
          } catch (err: any) {
            sandboxManager.sendMessage(sandbox, {
              type: 'realtime_result',
              id: m.id,
              error: err.message,
            });
          }
          break;
        }

        default:
          break;
      }
    });

    // ------------------------------------------------------------------
    // Send the execute command
    // ------------------------------------------------------------------

    const executeMsg: ExecuteMessage = {
      type: 'execute',
      id: executeId,
      codePath: '/app/index.js', // Path inside the sandbox
      request,
      env,
    };

    try {
      sandboxManager.sendMessage(sandbox, executeMsg);
    } catch (err: any) {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    }
  });
}
