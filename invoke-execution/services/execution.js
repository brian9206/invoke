const fs = require('fs-extra');
const path = require('path');
const db = require('./database');
const cache = require('./cache');
const ExecutionContext = require('./execution-context');
const { getInstance: getIsolatePool } = require('./isolate-pool');
const { createProjectKV } = require('./kv-store');

/**
 * ExecutionEngine - Singleton class managing function execution with isolated-vm
 * Orchestrates isolate pool, VFS, module loading, and execution
 */
class ExecutionEngine {
    constructor() {
        this.isolatePool = null;
        this.initialized = false;
        
        // Configuration
        this.functionTimeout = parseInt(process.env.FUNCTION_TIMEOUT_MS || '30000', 10);
    }
    
    /**
     * Initialize the execution engine
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        
        console.log('[ExecutionEngine] Initializing...');
        
        // Get isolate pool instance
        this.isolatePool = getIsolatePool();
        
        // Initialize pool (triggers async warm-up)
        await this.isolatePool.initialize();
        
        this.initialized = true;
        console.log('[ExecutionEngine] Initialization complete');
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
            const metadata = await fetchFunctionMetadata(functionId);
            const packageHash = metadata.package_hash;
            const projectId = metadata.project_id;
            
            // Fetch environment variables
            const envVars = await fetchEnvironmentVariables(functionId);
            
            // Fetch network security policies for the project
            const networkPolicies = await fetchNetworkPolicies(projectId);
            
            // Create project-scoped KV store
            const kvStore = createProjectKV(projectId, db.pool);
            
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
        console.log('[ExecutionEngine] Shutting down...');
        
        if (this.isolatePool) {
            await this.isolatePool.shutdown();
        }
        
        this.initialized = false;
        console.log('[ExecutionEngine] Shutdown complete');
    }
}

// Create singleton instance
const executionEngine = new ExecutionEngine();

/**
 * Fetch function metadata from database
 * @param {string} functionId - Function ID
 * @returns {Object} Function metadata
 */
async function fetchFunctionMetadata(functionId) {
    const query = `
        SELECT 
            f.id, 
            f.name, 
            f.project_id,
            f.is_active,
            f.created_at, 
            f.updated_at,
            fv.version,
            fv.package_path,
            fv.package_hash,
            fv.file_size
        FROM functions f
        LEFT JOIN function_versions fv ON f.active_version_id = fv.id
        WHERE f.id = $1 AND f.is_active = true
    `;
    
    const result = await db.query(query, [functionId]);
    
    if (result.rows.length === 0) {
        throw new Error('Function not found');
    }
    
    return result.rows[0];
}

/**
 * Fetch environment variables for a function
 * @param {string} functionId - Function ID
 * @returns {Object} Environment variables as key-value pairs
 */
async function fetchEnvironmentVariables(functionId) {
    try {
        const result = await db.query(`
            SELECT variable_name, variable_value 
            FROM function_environment_variables 
            WHERE function_id = $1
        `, [functionId]);
        
        const envVars = {};
        for (const row of result.rows) {
            envVars[row.variable_name] = row.variable_value;
        }
        
        return envVars;
    } catch (err) {
        console.error('Error fetching environment variables:', err);
        return {};
    }
}

/**
 * Fetch network security policies (global and project-specific)
 * @param {string} projectId - Project UUID
 * @returns {Object} Object with globalRules and projectRules arrays
 */
async function fetchNetworkPolicies(projectId) {
    try {
        // Fetch global network policies
        const globalResult = await db.query(`
            SELECT action, target_type, target_value, description, priority
            FROM global_network_policies
            ORDER BY priority ASC
        `);
        
        // Fetch project-specific network policies
        const projectResult = await db.query(`
            SELECT action, target_type, target_value, description, priority
            FROM project_network_policies
            WHERE project_id = $1
            ORDER BY priority ASC
        `, [projectId]);
        
        return {
            globalRules: globalResult.rows,
            projectRules: projectResult.rows
        };
    } catch (err) {
        console.error('Error fetching network policies:', err);
        // Return empty arrays - will be handled by NetworkPolicy class (default deny)
        return {
            globalRules: [],
            projectRules: []
        };
    }
}

/**
 * Get function package with caching
 * @param {string} functionId - Function ID
 * @returns {Object} Package information
 */
async function getFunctionPackage(functionId) {
    // Acquire lock to prevent concurrent cache operations
    const releaseLock = await cache.acquireLock(functionId);
    
    try {
        // Get function metadata from database first
        const functionData = await fetchFunctionMetadata(functionId);
        
        // Check cache with hash verification
        const cacheResult = await cache.checkCache(functionId, functionData.package_hash, functionData.version);
        
        if (cacheResult.cached && cacheResult.valid) {
            await cache.updateAccessStats(functionId);
            return {
                tempDir: cacheResult.extractedPath,
                indexPath: path.join(cacheResult.extractedPath, 'index.js'),
                fromCache: true
            };
        }
        
        // If cache exists but is invalid, remove it before downloading
        if (cacheResult.cached && !cacheResult.valid) {
            console.log(`🧹 Removing invalid cache for ${functionId}`);
            await cache.removeFromCache(functionId);
        }
        
        console.log(`Downloading package for function ${functionId}`);
        
        // Download and cache package with package_path from function_versions table
        // Note: cachePackageFromPath will NOT acquire its own lock since we already have it
        const extractedPath = await cache.cachePackageFromPathNoLock(functionId, functionData.version, functionData.package_hash, functionData.file_size || 0, functionData.package_path);
        
        return {
            tempDir: extractedPath,
            indexPath: path.join(extractedPath, 'index.js'),
            fromCache: false
        };
        
    } catch (error) {
        console.error('Error getting function package:', error.message);
        if (error.message.includes('not found')) {
            throw new Error('Function not found');
        }
        throw new Error(`Failed to get function: ${error.message}`);
    } finally {
        releaseLock();
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

// Export main execution function and helpers
module.exports = {
    executeFunction: (...args) => executionEngine.executeFunction(...args),
    createExecutionContext,
    fetchEnvironmentVariables,
    fetchNetworkPolicies,
    getFunctionPackage,
    fetchFunctionMetadata,
    getMetrics: () => executionEngine.getMetrics(),
    shutdown: () => executionEngine.shutdown(),
    initialize: () => executionEngine.initialize()
};
