// ============================================================================
// SandboxExecutionContext — Orchestrates a single function execution
// inside a Docker container via the SandboxOrchestrator IPC protocol.
// ============================================================================

import crypto from 'crypto';
import axios from 'axios';
import type { Sandbox } from './sandbox-orchestrator';
import type { RequestData, ResponseData } from 'invoke-runtime/dist/protocol';

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
  /** Function ID used to resolve /functions/{functionId}/index.js inside the container */
  functionId: string;
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
// executeSandbox
// ---------------------------------------------------------------------------

export async function executeSandbox(
  sandbox: Sandbox,
  options: SandboxExecutionOptions,
): Promise<SandboxExecutionResult> {
  const {
    functionId,
    request,
    env,
    timeoutMs,
    kvStore,
    projectSlug,
    consoleLogger,
  } = options;

  const gatewayInternalUrl = process.env.GATEWAY_SERVICE_URL || 'http://localhost:3000';
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET || '';
  const invocationId = crypto.randomBytes(8).toString('hex');
  
  const executionStart = Date.now();

  return new Promise<SandboxExecutionResult>((resolve, reject) => {
    let settled = false;

    // Timeout guard
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Function execution timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    // ------------------------------------------------------------------
    // Event listeners
    // ------------------------------------------------------------------

    const onExecuteResult = (payload: { response: ResponseData }) => {
      if (settled) return;
      settled = true;
      cleanup();
      clearTimeout(timer);
      
      const ipcRoundtripTime = Date.now() - executionStart;
      console.log(`[ROUNDTRIP] ${functionId}: IPC roundtrip=${ipcRoundtripTime}ms`);

      const response = payload.response;
      const bodyBuf = response.body
        ? Buffer.from(response.body, 'base64')
        : undefined;

      resolve({
        data: bodyBuf,
        statusCode: response.statusCode,
        headers: response.headers,
      });
    };

    const onError = (payload: { error?: string }) => {
      if (settled) return;
      settled = true;
      cleanup();
      clearTimeout(timer);

      resolve({
        error: payload?.error || 'Unknown sandbox error',
        statusCode: 500,
      });
    };

    const onConsole = (payload: { level: string; args: string[] }) => {
      if (!payload) return;
      const message = payload.args?.join(' ') ?? '';
      consoleLogger?.({ level: payload.level, message, timestamp: Date.now() });
    };

    const onKvGet = async (payload: { id: string; key: string }) => {
      try {
        const value = await kvStore.get(payload.key);
        sandbox.emit('kv_result', {
          id: payload.id,
          value: value === undefined || value === null ? undefined : value,
        });
      } catch (err: any) {
        sandbox.emit('kv_result', { id: payload.id, error: err.message });
      }
    };

    const onKvSet = async (payload: { id: string; key: string; value: string; ttl?: number }) => {
      try {
        const parsed = JSON.parse(payload.value);
        await kvStore.set(payload.key, parsed, payload.ttl);
        sandbox.emit('kv_result', { id: payload.id, value: true });
      } catch (err: any) {
        sandbox.emit('kv_result', { id: payload.id, error: err.message });
      }
    };

    const onKvDelete = async (payload: { id: string; key: string }) => {
      try {
        const result = await kvStore.delete(payload.key);
        sandbox.emit('kv_result', { id: payload.id, value: result });
      } catch (err: any) {
        sandbox.emit('kv_result', { id: payload.id, error: err.message });
      }
    };

    const onKvClear = async (payload: { id: string }) => {
      try {
        await kvStore.clear();
        sandbox.emit('kv_result', { id: payload.id, value: true });
      } catch (err: any) {
        sandbox.emit('kv_result', { id: payload.id, error: err.message });
      }
    };

    const onKvHas = async (payload: { id: string; key: string }) => {
      try {
        const result = await kvStore.has(payload.key);
        sandbox.emit('kv_result', { id: payload.id, value: result });
      } catch (err: any) {
        sandbox.emit('kv_result', { id: payload.id, error: err.message });
      }
    };

    const onRealtimeCmd = async (payload: { id: string; cmd: Record<string, any> }) => {
      const cmd = { ...payload.cmd };

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
        sandbox.emit('realtime_result', { id: payload.id });
      } catch (err: any) {
        sandbox.emit('realtime_result', { id: payload.id, error: err.message });
      }
    };

    const onContainerExit = (code: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      clearTimeout(timer);

      resolve({
        error: `Container exited unexpectedly (code ${code})`,
        statusCode: 500,
      });
    };

    // ------------------------------------------------------------------
    // Register listeners
    // ------------------------------------------------------------------

    sandbox.on('execute_result', onExecuteResult);
    sandbox.on('error', onError);
    sandbox.on('console', onConsole);
    sandbox.on('kv_get', onKvGet);
    sandbox.on('kv_set', onKvSet);
    sandbox.on('kv_delete', onKvDelete);
    sandbox.on('kv_clear', onKvClear);
    sandbox.on('kv_has', onKvHas);
    sandbox.on('realtime_cmd', onRealtimeCmd);
    sandbox.on('exit', onContainerExit);

    function cleanup(): void {
      sandbox.removeListener('execute_result', onExecuteResult);
      sandbox.removeListener('error', onError);
      sandbox.removeListener('console', onConsole);
      sandbox.removeListener('kv_get', onKvGet);
      sandbox.removeListener('kv_set', onKvSet);
      sandbox.removeListener('kv_delete', onKvDelete);
      sandbox.removeListener('kv_clear', onKvClear);
      sandbox.removeListener('kv_has', onKvHas);
      sandbox.removeListener('realtime_cmd', onRealtimeCmd);
      sandbox.removeListener('exit', onContainerExit);
    }

    // ------------------------------------------------------------------
    // Send the execute command to the supervisor
    // ------------------------------------------------------------------

    // Determine the code path relative to the container's /functions mount
    const codePath = `/functions/${functionId}/index.js`;

    try {
      sandbox.setPendingBootstrapPayload(request, env);
      console.log(`[EXECUTE] ${functionId}: emitting execute command at ${Date.now()}`);
      sandbox.emit('execute', {
        functionId,
        invocationId,
        codePath,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    }
  });
}
