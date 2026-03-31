/**
 * execution-service.ts
 *
 * Wires ExecutionEngine with the DB/cache-backed providers from function-providers.ts
 * and exposes the same API surface that routes and server.ts previously imported.
 */

import { insertLog } from './logger-client';
import { ExecutionEngine, createExecutionContext, AppLogEntry } from './execution-engine';
import {
  fetchFunctionMetadata,
  fetchEnvironmentVariables,
  fetchNetworkPolicies,
  getFunctionPackage,
  createDefaultKVFactory,
} from './function-providers';

// Singleton engine wired with DB-backed providers
const executionEngine = new ExecutionEngine({
  kvStoreFactory: createDefaultKVFactory,
  metadataProvider: fetchFunctionMetadata,
  envVarsProvider: fetchEnvironmentVariables,
  networkPoliciesProvider: fetchNetworkPolicies,
  appLogHandler: (entry: AppLogEntry) => {
    insertLog({
      project: { id: entry.projectId },
      function: { id: entry.functionId },
      payload: {
        level: entry.level,
        message: entry.message,
        ...(entry.traceId ? { trace_id: entry.traceId } : {}),
        timestamp: new Date(entry.timestamp).toISOString(),
      },
      executedAt: new Date(entry.timestamp),
    });
  },
});

export const initialize = (): Promise<void> => executionEngine.initialize();
export const shutdown = (): Promise<void> => executionEngine.shutdown();
export const getMetrics = (): ReturnType<typeof executionEngine.getMetrics> =>
  executionEngine.getMetrics();

export const executeFunction = (
  ...args: Parameters<typeof executionEngine.executeFunction>
): ReturnType<typeof executionEngine.executeFunction> =>
  executionEngine.executeFunction(...args);

/** Update default timeout without restarting. Called by the settings listener. */
export const updateDefaultTimeout = (timeoutMs: number): void =>
  executionEngine.updateDefaultTimeout(timeoutMs);

/** Update default memory. Currently a no-op — warm pool uses config at init time. */
export const updateDefaultMemory = async (_memoryMb: number): Promise<void> => {
  // The warm pool doesn't support hot-swapping memory limits.
  // New sandboxes will pick up updated settings on next acquire.
};

export { createExecutionContext, getFunctionPackage, fetchFunctionMetadata, fetchEnvironmentVariables, fetchNetworkPolicies };
