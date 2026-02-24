/**
 * execution-service.js
 *
 * Wires ExecutionEngine with the DB/cache-backed providers from function-providers.js
 * and exposes the same API surface that routes and server.js previously imported
 * from execution.js.
 *
 * Routes and server code should import from this file, not from execution.js.
 */

const { ExecutionEngine, createExecutionContext } = require('./execution-engine');
const {
    fetchFunctionMetadata,
    fetchEnvironmentVariables,
    fetchNetworkPolicies,
    getFunctionPackage,
    createDefaultKVFactory,
} = require('./function-providers');

// Singleton engine wired with DB-backed providers
const executionEngine = new ExecutionEngine({
    kvStoreFactory: createDefaultKVFactory,
    metadataProvider: fetchFunctionMetadata,
    envVarsProvider: fetchEnvironmentVariables,
    networkPoliciesProvider: fetchNetworkPolicies,
});

module.exports = {
    // Engine lifecycle
    initialize: () => executionEngine.initialize(),
    shutdown: () => executionEngine.shutdown(),
    getMetrics: () => executionEngine.getMetrics(),

    // Execution
    executeFunction: (...args) => executionEngine.executeFunction(...args),
    createExecutionContext,

    // Package management (routes use this directly)
    getFunctionPackage,

    // Providers (exported for routes that use them directly)
    fetchFunctionMetadata,
    fetchEnvironmentVariables,
    fetchNetworkPolicies,
};
