const path = require('path');
const ExecutionContext = require('./execution-context');
const { getInstance: getIsolatePool } = require('./isolate-pool');

/**
 * ExecutionEngine - Singleton class managing function execution with isolated-vm
 * Orchestrates isolate pool, VFS, module loading, and execution
 */
class ExecutionEngine {
    /**
     * @param {Object} [options]
     * @param {function(string): import('keyv')} [options.kvStoreFactory]         - Override KV store creation. Receives projectId, returns Keyv instance.
     * @param {function(string): Promise<Object>} [options.metadataProvider]     - Override function metadata fetch. Receives functionId.
     * @param {function(string): Promise<Object>} [options.envVarsProvider]      - Override env vars fetch. Receives functionId.
     * @param {function(string): Promise<Object>} [options.networkPoliciesProvider] - Override network policies fetch. Receives projectId.
     */
    constructor(options = {}) {
        this.isolatePool = null;
        this.initialized = false;

        // Configuration
        this.functionTimeout = parseInt(process.env.FUNCTION_TIMEOUT_MS || '30000', 10);

        // Injectable providers — defaults are null; must be provided by caller or execution-service.js
        this.kvStoreFactory = options.kvStoreFactory || null;
        this.metadataProvider = options.metadataProvider || null;
        this.envVarsProvider = options.envVarsProvider || null;
        this.networkPoliciesProvider = options.networkPoliciesProvider || null;
    }
    
    /**
     * Initialize the execution engine
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        // Guard against missing providers
        const missing = ['kvStoreFactory', 'metadataProvider', 'envVarsProvider', 'networkPoliciesProvider']
            .filter(k => !this[k]);
        if (missing.length) {
            throw new Error(`[ExecutionEngine] Missing required providers: ${missing.join(', ')}. Pass them via the constructor options.`);
        }
        
        // Get isolate pool instance
        this.isolatePool = getIsolatePool();
        
        // Initialize pool (triggers async warm-up)
        await this.isolatePool.initialize();
        
        this.initialized = true;
    }
    
    /**
     * Execute a function
     * @param {string} indexPath - Path to function's index.js
     * @param {Object} context - Execution context with req, res, console
     * @param {string} functionId - Function ID
     * @returns {Object} Execution result
     */
    async executeFunction(indexPath, context, functionId) {
        // Ensure initialized
        if (!this.initialized) {
            await this.initialize();
        }
        
        const packageDir = path.dirname(indexPath);
        let isolate = null;
        let ivmContext = null;
        let executionContext = null;
        
        try {
            // Fetch function metadata (includes package_hash)
            const metadata = await this.metadataProvider(functionId);
            const packageHash = metadata.package_hash;
            const projectId = metadata.project_id;

            // Fetch environment variables
            const envVars = await this.envVarsProvider(functionId);

            // Fetch network security policies for the project
            const networkPolicies = await this.networkPoliciesProvider(projectId);

            // Create project-scoped KV store
            const kvStore = this.kvStoreFactory(projectId);
            
            // Acquire isolate from pool
            const acquired = await this.isolatePool.acquire();
            isolate = acquired.isolate;
            ivmContext = acquired.context;
            
            // Create execution context
            executionContext = new ExecutionContext(
                isolate,
                ivmContext,
                packageDir,
                functionId,
                packageHash,
                envVars,
                acquired.compiledScript,
                projectId,
                kvStore,
                networkPolicies
            );
            
            // Bootstrap environment
            await executionContext.bootstrap();
            
            // Setup request and response
            const reqData = {
                method: context.req.method,
                url: context.req.url,
                originalUrl: context.req.originalUrl,
                path: context.req.path,
                protocol: context.req.protocol,
                hostname: context.req.hostname,
                secure: context.req.secure,
                ip: context.req.ip,
                ips: context.req.ips,
                body: context.req.body,
                query: context.req.query,
                params: context.req.params,
                headers: context.req.headers
            };
            
            await executionContext.setupRequest(reqData);
            await executionContext.setupResponse();
            
            // Load user function from /aindex.js
            const virtualIndexPath = '/app/index.js';
            const vfs = executionContext.vfs;
            const vfsFs = vfs.createNodeFSModule();
            const userCode = vfsFs.readFileSync(virtualIndexPath, 'utf8');
            
            // Execute user code and invoke the exported function
            // The code runs in a context where require, fs, path, req, res are already available
            const executeCode = `
(async function() {
    // Set up module pattern
    const module = { exports: {} };
    const exports = module.exports;
    const __filename = '/app/index.js';
    const __dirname = '/app';
    
    // Execute user code
    ${userCode}
    
    // Validate exports is a function
    if (typeof module.exports !== 'function') {
        throw new Error('Module must export a function. Expected: module.exports = function(req, res) {...}');
    }
    
    // Invoke the function with req and res (handle both sync and async)
    const result = module.exports(req, res);
    if (result && typeof result.then === 'function') {
        await result;
    }
    
    return undefined;
})();
`;
            
            // Compile and execute
            const executeScript = await isolate.compileScript(executeCode, { filename: '/app/index.js' });
            
            // Run with timeout (handle promise)
            try {
                await executeScript.run(ivmContext, { timeout: this.functionTimeout, promise: true });
            } catch (error) {
                // Check if timeout error
                if (error.message && error.message.includes('Script execution timed out')) {
                    // Mark isolate as corrupted
                    this.isolatePool.release(isolate, false);
                    isolate = null; // Prevent double release
                    
                    throw new Error(`Function execution timeout (${this.functionTimeout}ms)`);
                }
                throw error;
            }
            
            // Extract response and logs
            const response = executionContext.getResponse();
            const logs = executionContext.getLogs();
            
            // Release isolate back to pool (healthy)
            this.isolatePool.release(isolate, true);
            isolate = null;
            
            // Cleanup execution context
            executionContext.cleanup();
            
            // Return result
            return {
                data: response.data,
                statusCode: response.statusCode,
                headers: response.headers,
                logs: logs
            };
            
        } catch (error) {
            console.error('[ExecutionEngine] Execution error:', error);
            
            // Release isolate if still held
            if (isolate) {
                // Check if error indicates corruption
                const isCorrupted = 
                    error.message && (
                        error.message.includes('timeout') ||
                        error.message.includes('out of memory') ||
                        error.message.includes('memory limit')
                    );
                
                this.isolatePool.release(isolate, !isCorrupted);
            }
            
            // Cleanup execution context
            if (executionContext) {
                executionContext.cleanup();
            }
            
            // Return error result
            const errorMessage = error.message || String(error);
            const errorStack = error.stack || '';
            
            return {
                error: errorMessage + (errorStack ? '\n' + errorStack : ''),
                statusCode: 500
            };
        }
    }
    
    /**
     * Get metrics
     */
    getMetrics() {
        const isolatePoolMetrics = this.isolatePool ? this.isolatePool.getMetrics() : null;
        
        return {
            isolatePool: isolatePoolMetrics
        };
    }
    
    /**
     * Shutdown the execution engine
     */
    async shutdown() {
        if (this.isolatePool) {
            await this.isolatePool.shutdown();
        }
        
        this.initialized = false;
    }
}

/**
 * Create a mock request object compatible with Express.js
 */
function createRequestObject(method = 'POST', body = {}, query = {}, headers = {}, params = {}, originalReq = {}) {
    // Extract the path after the function ID
    // originalReq.params[0] = functionId, originalReq.params[1] = the rest of the path
    let pathAfterFunctionId = originalReq.params && originalReq.params[1] ? originalReq.params[1] : '';
    
    // Ensure path starts with /
    let url = pathAfterFunctionId ? `/${pathAfterFunctionId}` : '/';
    
    // If there's a query string in the original URL, preserve it
    if (originalReq.originalUrl) {
        const queryString = originalReq.originalUrl.split('?')[1];
        if (queryString) {
            url += `?${queryString}`;
        }
    }
    
    const protocol = originalReq.protocol || 'http';
    const hostname = 'localhost';
    const host = 'localhost';
    
    const request = {
        method,
        url,
        originalUrl: url,
        path: url.split('?')[0],
        protocol,
        hostname,
        host,
        secure: protocol === 'https',
        ip: originalReq.ip || (originalReq.connection && originalReq.connection.remoteAddress) || '127.0.0.1',
        ips: originalReq.ips || [],
        body,
        query,
        params,
        headers
    };
    
    return request;
}

/**
 * Create execution context for function execution (backward compatibility)
 * @param {string} method - HTTP method
 * @param {Object} body - Request body
 * @param {Object} query - Query parameters  
 * @param {Object} headers - Request headers
 * @param {Object} params - Route parameters
 * @param {Object} originalReq - Original request object
 * @returns {Object} Execution context with req
 */
function createExecutionContext(method = 'POST', body = {}, query = {}, headers = {}, params = {}, originalReq = {}, packageDir = null) {
    return {
        req: createRequestObject(method, body, query, headers, params, originalReq)
    };
}

module.exports = {
    ExecutionEngine,
    createExecutionContext,
};
