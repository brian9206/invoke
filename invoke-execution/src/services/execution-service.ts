/**
 * execution-service.ts
 *
 * Wires ExecutionEngine with the DB/cache-backed providers from function-providers.ts
 * and exposes the same API surface that routes and server.ts previously imported.
 */

import { ExecutionEngine, createExecutionContext } from './execution-engine';
import {
  fetchFunctionMetadata,
  fetchEnvironmentVariables,
  fetchNetworkPolicies,
  getFunctionPackage,
  createDefaultKVFactory,
} from './function-providers';
import { getInstance as getIsolatePool } from './isolate-pool';

// Singleton engine wired with DB-backed providers
const executionEngine = new ExecutionEngine({
  kvStoreFactory: createDefaultKVFactory,
  metadataProvider: fetchFunctionMetadata,
  envVarsProvider: fetchEnvironmentVariables,
  networkPoliciesProvider: fetchNetworkPolicies,
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

/** Update default memory tier in the isolate pool. Called by the settings listener. */
export const updateDefaultMemory = (memoryMb: number): Promise<void> =>
  getIsolatePool().updateDefaultMemory(memoryMb);

export { createExecutionContext, getFunctionPackage, fetchFunctionMetadata, fetchEnvironmentVariables, fetchNetworkPolicies };
