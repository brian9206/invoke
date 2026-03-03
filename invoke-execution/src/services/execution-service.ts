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

export { createExecutionContext, getFunctionPackage, fetchFunctionMetadata, fetchEnvironmentVariables, fetchNetworkPolicies };
