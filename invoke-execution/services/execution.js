const { VM } = require('vm2');
const fs = require('fs-extra');
const path = require('path');
const db = require('./database');
const cache = require('./cache');

/**
 * Shared Function Execution Service
 * Provides unified execution logic for both regular HTTP calls and scheduled functions
 */

/**
 * Get function package with caching
 * @param {string} functionId - Function ID
 * @returns {Object} Package information
 */
async function getFunctionPackage(functionId) {
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
        
        console.log(`Downloading package for function ${functionId}`);
        
        // Download and cache package with package_path from function_versions table
        const extractedPath = await cache.cachePackageFromPath(functionId, functionData.version, functionData.package_hash, functionData.file_size || 0, functionData.package_path);
        
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
    }
}

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
        result.rows.forEach(row => {
            envVars[row.variable_name] = row.variable_value;
        });
        
        return envVars;
    } catch (error) {
        console.error('Error fetching environment variables:', error);
        return {};
    }
}

/**
 * Create a secure console object that captures logs
 */
function createConsoleObject() {
    const logs = [];
    
    const formatArgs = (...args) => {
        return args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg);
                } catch (error) {
                    // Handle circular references or other JSON.stringify errors
                    return '[object Object]';
                }
            }
            return String(arg);
        }).join(' ');
    };
    
    return {
        log: (...args) => logs.push({ level: 'log', message: formatArgs(...args), timestamp: Date.now() }),
        info: (...args) => logs.push({ level: 'info', message: formatArgs(...args), timestamp: Date.now() }),
        warn: (...args) => logs.push({ level: 'warn', message: formatArgs(...args), timestamp: Date.now() }),
        error: (...args) => logs.push({ level: 'error', message: formatArgs(...args), timestamp: Date.now() }),
        getLogs: () => logs
    };
}

/**
 * Create a mock request object compatible with Express.js
 */
function createRequestObject(method = 'POST', body = {}, query = {}, headers = {}, params = {}, originalReq = {}) {
    const url = originalReq.url || '/';
    const protocol = originalReq.protocol || 'http';
    const hostname = originalReq.hostname || 'localhost';
    
    const request = {
        method,
        url,
        originalUrl: url,
        path: url.split('?')[0],
        protocol,
        hostname,
        secure: protocol === 'https',
        ip: originalReq.ip || originalReq.connection?.remoteAddress || '127.0.0.1',
        ips: originalReq.ips || [],
        body,
        query,
        params,
        headers,
        //cookies: {}, // Simplified cookies object
        
        // Express.js methods
        get(headerName) {
            return this.headers[headerName.toLowerCase()];
        },
        
        header(headerName) {
            return this.get(headerName);
        },
        
        is(type) {
            const contentType = this.get('content-type') || '';
            return contentType.includes(type);
        },
        
        accepts(types) {
            const acceptHeader = this.get('accept') || '*/*';
            if (typeof types === 'string') {
                return acceptHeader.includes(types) ? types : false;
            }
            if (Array.isArray(types)) {
                for (const type of types) {
                    if (acceptHeader.includes(type)) return type;
                }
                return false;
            }
            return acceptHeader;
        }
    };
    
    return request;
}

/**
 * Create a mock response object for function context
 */
function createResponseObject() {
    const response = {
        statusCode: 200,
        headers: {},
        data: undefined,
        locals: {},
        
        status(code) {
            this.statusCode = code;
            return this;
        },
        
        json(data) {
            this.data = data;
            this.headers['content-type'] = 'application/json';
            return this;
        },
        
        send(data) {
            this.data = data;
            if (!this.headers['content-type']) {
                if (typeof data === 'string') {
                    this.headers['content-type'] = 'text/plain';
                } else if (typeof data === 'object') {
                    this.headers['content-type'] = 'application/json';
                } else {
                    this.headers['content-type'] = 'text/plain';
                }
            }
            return this;
        },
        
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
            return this;
        },
        
        get(name) {
            return this.headers[name.toLowerCase()];
        },
        
        end(data) {
            if (data !== undefined) {
                this.data = data;
            }
            return this;
        }
    };
    
    return response;
}

/**
 * Execute user function with proper context
 */
async function executeUserFunction(userFunction, context) {
    return new Promise(async (resolve) => {
        try {
            // Set timeout for execution
            const timeout = setTimeout(() => {
                resolve({
                    error: 'Function execution timeout (30s)',
                    statusCode: 504
                });
            }, 30000);

            const result = await userFunction(context.req, context.res);
            
            clearTimeout(timeout);
            
            // Check if the result is a promise (async function)
            if (result && typeof result.then === 'function') {
                try {
                    const promiseResult = await result;
                    
                    if (context.res.data !== undefined) {
                        resolve({ 
                            data: context.res.data, 
                            statusCode: context.res.statusCode || 200 
                        });
                    } else if (promiseResult !== undefined) {
                        resolve({ data: promiseResult, statusCode: context.res.statusCode || 200 });
                    } else {
                        resolve({ 
                            error: 'Function did not produce any output', 
                            statusCode: context.res.statusCode || 500 
                        });
                    }
                } catch (error) {
                    resolve({ error: error.message, statusCode: 500 });
                }
            }
            // For non-async functions
            else if (context.res.data !== undefined) {
                resolve({ 
                    data: context.res.data, 
                    statusCode: context.res.statusCode || 200 
                });
            } else if (result !== undefined) {
                resolve({ data: result, statusCode: context.res.statusCode || 200 });
            } else {
                resolve({ 
                    error: 'Function did not produce any output', 
                    statusCode: context.res.statusCode || 500 
                });
            }
            
        } catch (error) {
            resolve({
                error: error.message,
                statusCode: 500
            });
        }
    });
}

/**
 * Execute function in secure VM environment
 * @param {string} indexPath - Path to function's index.js
 * @param {Object} context - Execution context with req, res, console
 * @param {string} functionId - Function ID for environment variables
 * @returns {Object} Execution result
 */
async function executeFunction(indexPath, context, functionId) {
    try {
        // Fetch environment variables for this function
        const customEnvVars = await fetchEnvironmentVariables(functionId);
        
        // Read the function code
        const functionCode = await fs.readFile(indexPath, 'utf8');
        
        // Get the package directory for local requires
        const packageDir = path.dirname(indexPath);

        // Create a custom require function that supports local files
        const createCustomRequire = (currentDir, originalPackageDir) => {
            const allowedModules = [
                'crypto', 'querystring', 'url', 'util', 'path', 'os', 
                'stream', 'events', 'buffer', 'string_decoder', 'zlib'
            ];
            
            return (moduleName) => {
                // Handle local requires (starts with ./ or ../)
                if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
                    try {
                        const fullPath = path.resolve(currentDir, moduleName);
                        
                        // Security check: ensure the required file is within the original package directory
                        const normalizedFullPath = path.normalize(fullPath);
                        const normalizedPackageDir = path.normalize(originalPackageDir);
                        
                        if (!normalizedFullPath.startsWith(normalizedPackageDir)) {
                            throw new Error(`Access denied: Cannot require files outside package directory`);
                        }
                        
                        // Try different file extensions
                        let filePath = fullPath;
                        if (!fs.existsSync(filePath)) {
                            if (fs.existsSync(`${fullPath}.js`)) {
                                filePath = `${fullPath}.js`;
                            } else if (fs.existsSync(path.join(fullPath, 'index.js'))) {
                                filePath = path.join(fullPath, 'index.js');
                            } else {
                                throw new Error(`Cannot find module '${moduleName}'`);
                            }
                        }
                        
                        // Read and execute the required file
                        const requiredCode = fs.readFileSync(filePath, 'utf8');
                        const moduleContext = {
                            module: { exports: {} },
                            exports: {},
                            require: createCustomRequire(path.dirname(filePath), originalPackageDir),
                            __filename: filePath,
                            __dirname: path.dirname(filePath)
                        };
                        
                        // Create VM for the required module
                        const moduleVM = new VM({
                            timeout: 5000,
                            sandbox: {
                                ...moduleContext,
                                console: context.console,
                                Buffer,
                                setTimeout,
                                setInterval,
                                clearTimeout,
                                clearInterval,
                                process: {
                                    env: customEnvVars
                                }
                            }
                        });
                        
                        moduleVM.run(requiredCode);
                        return moduleContext.module.exports || moduleContext.exports;
                        
                    } catch (error) {
                        throw new Error(`Error requiring '${moduleName}': ${error.message}`);
                    }
                }
                
                // Handle built-in Node.js modules
                if (allowedModules.includes(moduleName)) {
                    return require(moduleName);
                }
                
                throw new Error(`Module '${moduleName}' is not allowed in sandbox environment`);
            };
        };

        // Create a secure VM
        const vm = new VM({
            timeout: 30000, // 30 second timeout
            sandbox: {
                require: createCustomRequire(packageDir, packageDir),
                console: context.console,
                Buffer,
                process: {
                    env: customEnvVars
                },
                setTimeout,
                setInterval,
                clearTimeout,
                clearInterval,
                module: { exports: {} },
                exports: {},
                __filename: indexPath,
                __dirname: packageDir
            }
        });

        // Wrap the function code to handle different export patterns
        const wrappedCode = `
            (function() {
                ${functionCode}
                
                // Handle different export patterns
                let exportedFunction;
                if (typeof module !== 'undefined' && module.exports) {
                    exportedFunction = module.exports;
                } else if (typeof exports !== 'undefined') {
                    exportedFunction = exports.handler || exports.default || exports;
                }
                
                if (typeof exportedFunction === 'function') {
                    return exportedFunction;
                } else {
                    throw new Error('Function must export a function');
                }
            })();
        `;

        // Execute the code and get the function
        const userFunction = vm.run(wrappedCode);

        // Execute the user function
        const result = await executeUserFunction(userFunction, context);
        
        return result;

    } catch (error) {
        return {
            error: error.message,
            statusCode: 500
        };
    }
}

/**
 * Create execution context for function execution
 * @param {string} method - HTTP method
 * @param {Object} body - Request body
 * @param {Object} query - Query parameters  
 * @param {Object} headers - Request headers
 * @param {Object} params - Route parameters
 * @param {Object} originalReq - Original request object
 * @returns {Object} Execution context with req, res, console
 */
function createExecutionContext(method = 'POST', body = {}, query = {}, headers = {}, params = {}, originalReq = {}) {
    return {
        req: createRequestObject(method, body, query, headers, params, originalReq),
        res: createResponseObject(),
        console: createConsoleObject()
    };
}

module.exports = {
    executeFunction,
    createExecutionContext,
    fetchEnvironmentVariables,
    createConsoleObject,
    createRequestObject,
    createResponseObject,
    getFunctionPackage,
    fetchFunctionMetadata
};