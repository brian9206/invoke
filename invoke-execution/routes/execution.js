const express = require('express');
const { VM } = require('vm2');
const fs = require('fs-extra');
const path = require('path');
const { logExecution } = require('../services/utils');
const db = require('../services/database');
const cache = require('../services/cache');

const router = express.Router();

/**
 * Function Execution Routes
 * Handles secure execution of user functions with API key authentication
 */

/**
 * Middleware to authenticate API key if required
 */
async function authenticateApiKey(req, res, next) {
    try {
        const { functionId } = req.params;
        
        // Get API key from Authorization header (Bearer token) or query parameter
        let apiKey = null;
        
        // Check Authorization header first (Bearer format)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            apiKey = authHeader.substring(7);
        }
        
        // Fall back to query parameter
        if (!apiKey) {
            apiKey = req.query.api_key || req.query.apiKey;
        }
        
        // Also check x-api-key header for backward compatibility
        if (!apiKey) {
            apiKey = req.headers['x-api-key'];
        }

        // Get function metadata with active version to check if API key is required
        const functionResult = await db.query(`
            SELECT 
                f.*,
                fv.version,
                fv.package_path,
                fv.file_size,
                fv.package_hash
            FROM functions f
            LEFT JOIN function_versions fv ON f.active_version_id = fv.id
            WHERE f.id = $1 AND f.is_active = true
        `, [functionId]);

        if (functionResult.rows.length === 0) {
            return res.status(404).json(createResponse(false, null, 'Function not found', 404));
        }

        const functionData = functionResult.rows[0];
        req.functionData = functionData;

        // If function doesn't require API key, proceed
        if (!functionData.requires_api_key) {
            req.apiKeyValid = true;
            return next();
        }

        // Function requires API key but none provided
        if (!apiKey) {
            return res.status(401).json(createResponse(false, null, 'API key required. Provide via Authorization: Bearer <key> header or ?api_key=<key> parameter', 401));
        }

        // Validate API key against function's stored key
        if (apiKey !== functionData.api_key) {
            return res.status(401).json(createResponse(false, null, 'Invalid API key', 401));
        }

        req.apiKeyValid = true;
        next();

    } catch (error) {
        console.error('API key authentication error:', error);
        res.status(500).json(createResponse(false, null, 'Authentication failed', 500));
    }
}

/**
 * POST /invoke/:functionId
 * Execute a function with POST data
 */
router.post('/:functionId', authenticateApiKey, async (req, res) => {
    const startTime = Date.now();
    let tempDir = null;

    try {
        const { functionId } = req.params;
        const { body: requestBody, query: queryParams, headers } = req;

        // Get function package (with caching)
        const packageInfo = await getFunctionPackage(functionId);
        tempDir = packageInfo.tempDir;

        // Create execution context
        const executionContext = {
            req: createRequestObject('POST', requestBody, queryParams, filterHeaders(headers), { functionId }, req),
            res: createResponseObject(),
            console: createConsoleObject()
        };

        // Execute the function
        const result = await executeFunction(packageInfo.indexPath, executionContext, functionId);

        // Log execution
        const executionTime = Date.now() - startTime;
        const statusCode = result.statusCode || 200;
        
        const requestInfo = {
            requestSize: JSON.stringify(requestBody).length,
            responseSize: JSON.stringify(result.data || {}).length,
            clientIp: req.ip,
            userAgent: req.headers['user-agent'],
            consoleOutput: executionContext.console.getLogs(),
            requestHeaders: req.headers,
            responseHeaders: executionContext.res.headers,
            requestMethod: req.method,
            requestUrl: req.url,
            requestBody: JSON.stringify(requestBody),
            responseBody: JSON.stringify(result.data || {})
        };
        
        await logExecution(functionId, executionTime, statusCode, result.error, requestInfo);

        // Send response - return only function data on success
        if (result.error) {
            const responseData = {
                success: false,
                data: result.data,
                message: result.message || 'Execution failed',
                executionTime,
                console: executionContext.console.getLogs()
            };
            res.status(statusCode).json(responseData);
        } else {
            // Set headers from user function
            if (executionContext.res.headers) {
                Object.entries(executionContext.res.headers).forEach(([key, value]) => {
                    res.setHeader(key, value);
                });
            }
            
            // Send response with appropriate content-type
            const contentType = executionContext.res.headers && executionContext.res.headers['content-type'];
            if (contentType && !contentType.includes('application/json')) {
                res.status(statusCode).send(result.data);
            } else {
                res.status(statusCode).json(result.data);
            }
        }

    } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error('POST execution error:', error);
        
        await logExecution(req.params.functionId, executionTime, 500, error.message);
        
        res.status(500).json(createResponse(false, null, 'Execution failed: ' + error.message, 500));
    } finally {
        // Don't cleanup cached directories - let cache service manage them
    }
});

/**
 * GET /invoke/:functionId
 * Execute a function with GET parameters
 */
router.get('/:functionId', authenticateApiKey, async (req, res) => {
    const startTime = Date.now();
    let tempDir = null;

    try {
        const { functionId } = req.params;
        const { query: queryParams, headers } = req;

        // Get function package (with caching)
        const packageInfo = await getFunctionPackage(functionId);
        tempDir = packageInfo.tempDir;

        // Create execution context
        const executionContext = {
            req: createRequestObject('GET', {}, queryParams, filterHeaders(headers), { functionId }, req),
            res: createResponseObject(),
            console: createConsoleObject()
        };

        // Execute the function
        const result = await executeFunction(packageInfo.indexPath, executionContext, functionId);

        // Log execution
        const executionTime = Date.now() - startTime;
        const statusCode = result.statusCode || 200;
        
        const requestInfo = {
            requestSize: JSON.stringify(queryParams).length,
            responseSize: JSON.stringify(result.data || {}).length,
            clientIp: req.ip,
            userAgent: req.headers['user-agent'],
            consoleOutput: executionContext.console.getLogs(),
            requestHeaders: req.headers,
            responseHeaders: executionContext.res.headers,
            requestMethod: req.method,
            requestUrl: req.url,
            requestBody: JSON.stringify(queryParams),
            responseBody: JSON.stringify(result.data || {})
        };
        
        await logExecution(functionId, executionTime, statusCode, result.error, requestInfo);

        // Send response - return only function data on success
        if (result.error) {
            const responseData = {
                success: false,
                data: result.data,
                message: result.message || 'Execution failed',
                executionTime,
                console: executionContext.console.getLogs()
            };
            res.status(statusCode).json(responseData);
        } else {
            // Set headers from user function
            if (executionContext.res.headers) {
                Object.entries(executionContext.res.headers).forEach(([key, value]) => {
                    res.setHeader(key, value);
                });
            }
            
            // Send response with appropriate content-type
            const contentType = executionContext.res.headers && executionContext.res.headers['content-type'];
            if (contentType && !contentType.includes('application/json')) {
                res.status(statusCode).send(result.data);
            } else {
                res.status(statusCode).json(result.data);
            }
        }

    } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error('Execution error:', error);
        
        await logExecution(req.params.functionId, executionTime, 500, error.message);
        
        res.status(500).json(createResponse(false, null, 'Execution failed: ' + error.message, 500));
    } finally {
        // Don't cleanup cached directories - let cache service manage them
    }
});

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
 * Execute function in secure VM environment
 * @param {string} indexPath - Path to function's index.js
 * @param {Object} context - Execution context
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
                            throw new Error(`Access denied: Cannot require files outside package directory. Attempted: ${normalizedFullPath}, Package: ${normalizedPackageDir}`);
                        }
                        
                        // Try different file extensions
                        let filePath = fullPath;
                        if (!fs.existsSync(filePath)) {
                            if (fs.existsSync(`${fullPath}.js`)) {
                                filePath = `${fullPath}.js`;
                            } else if (fs.existsSync(path.join(fullPath, 'index.js'))) {
                                filePath = path.join(fullPath, 'index.js');
                            } else {
                                throw new Error(`Cannot find module '${moduleName}'. Tried: ${fullPath}, ${fullPath}.js, ${path.join(fullPath, 'index.js')}`);
                            }
                        }
                        
                        // Read and execute the required file in a new context
                        const requiredCode = fs.readFileSync(filePath, 'utf8');
                        const moduleContext = {
                            module: { exports: {} },
                            exports: {},
                            require: createCustomRequire(path.dirname(filePath), originalPackageDir), // Pass both current dir and original package dir
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
                        
                        // Execute the required module
                        moduleVM.run(requiredCode);
                        
                        // Return module.exports or exports
                        return moduleContext.module.exports || moduleContext.exports;
                        
                    } catch (error) {
                        throw new Error(`Error requiring '${moduleName}': ${error.message}`);
                    }
                }
                
                // Handle built-in Node.js modules
                if (allowedModules.includes(moduleName)) {
                    return require(moduleName);
                }
                
                // Deny access to other modules for security
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
 * Execute user function with proper context
 */
async function executeUserFunction(userFunction, context) {
    return new Promise(async (resolve) => {
        try {
            // Call the user function
            const result = userFunction(context.req, context.res);
            
            // Check if the result is a promise (async function)
            if (result && typeof result.then === 'function') {
                try {
                    const promiseResult = await result;
                    
                    // After promise resolves, check if response has data (set by res.json() calls)
                    if (context.res.data !== undefined) {
                        resolve({ 
                            data: context.res.data, 
                            statusCode: context.res.statusCode || 200 
                        });
                    } else if (promiseResult !== undefined) {
                        // Promise returned data directly
                        resolve({ data: promiseResult, statusCode: context.res.statusCode || 200 });
                    } else {
                        // No data was set - this might be an error
                        resolve({ 
                            error: 'Function did not produce any output', 
                            statusCode: context.res.statusCode || 500 
                        });
                    }
                } catch (error) {
                    resolve({ error: error.message, statusCode: 500 });
                }
            }
            // For non-async functions, check response data immediately
            else if (context.res.data !== undefined) {
                resolve({ 
                    data: context.res.data, 
                    statusCode: context.res.statusCode || 200 
                });
            } else if (result !== undefined) {
                // Function returned a value directly
                resolve({ data: result, statusCode: context.res.statusCode || 200 });
            } else {
                // No data was set - this might be an error
                resolve({ 
                    error: 'Function did not produce any output', 
                    statusCode: context.res.statusCode || 500 
                });
            }
        } catch (error) {
            console.error('Error executing user function:', error);
            resolve({ error: error.message, statusCode: 500 });
        }
    });
}

/**
 * GET /cache/stats
 * Get cache statistics and usage information
 */
router.get('/cache/stats', async (req, res) => {
    try {
        const stats = await cache.getCacheStats();
        res.json(createResponse(true, stats, 'Cache statistics retrieved successfully'));
    } catch (error) {
        console.error('Error getting cache stats:', error);
        res.status(500).json(createResponse(false, null, 'Failed to get cache statistics'));
    }
});

/**
 * POST /cache/cleanup
 * Trigger cache cleanup
 */
router.post('/cache/cleanup', async (req, res) => {
    try {
        const result = await cache.cleanup();
        res.json(createResponse(true, result, 'Cache cleanup completed'));
    } catch (error) {
        console.error('Error during cache cleanup:', error);
        res.status(500).json(createResponse(false, null, 'Failed to cleanup cache'));
    }
});

/**
 * DELETE /cache/:functionId
 * Clear cache for specific function
 */
router.delete('/cache/:functionId', async (req, res) => {
    try {
        const { functionId } = req.params;
        await cache.clearFunctionCache(functionId);
        res.json(createResponse(true, null, `Cache cleared for function ${functionId}`));
    } catch (error) {
        console.error('Error clearing function cache:', error);
        res.status(500).json(createResponse(false, null, 'Failed to clear function cache'));
    }
});

/**
 * Create a mock request object compatible with Express.js
 */
function createRequestObject(method, body, query, headers, params, originalReq) {
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
        ip: originalReq.ip,
        ips: originalReq.ips || [],
        body,
        query,
        params,
        headers,
        cookies: {}, // Simplified cookies object
        
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
        },
        
        acceptsCharsets(charsets) {
            const acceptCharsetHeader = this.get('accept-charset') || '*';
            if (typeof charsets === 'string') {
                return acceptCharsetHeader.includes(charsets) ? charsets : false;
            }
            return acceptCharsetHeader;
        },
        
        acceptsEncodings(encodings) {
            const acceptEncodingHeader = this.get('accept-encoding') || '*';
            if (typeof encodings === 'string') {
                return acceptEncodingHeader.includes(encodings) ? encodings : false;
            }
            return acceptEncodingHeader;
        },
        
        acceptsLanguages(languages) {
            const acceptLanguageHeader = this.get('accept-language') || '*';
            if (typeof languages === 'string') {
                return acceptLanguageHeader.includes(languages) ? languages : false;
            }
            return acceptLanguageHeader;
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
        locals: {}, // Express.js locals object
        
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
            // Set appropriate content-type if not already set
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
        
        sendStatus(statusCode) {
            this.statusCode = statusCode;
            this.data = getStatusText(statusCode);
            this.headers['content-type'] = 'text/plain';
            return this;
        },
        
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
            return this;
        },
        
        // Express.js aliases and additional methods
        set(name, value) {
            return this.setHeader(name, value);
        },
        
        header(name, value) {
            return this.setHeader(name, value);
        },
        
        get(name) {
            return this.headers[name.toLowerCase()];
        },
        
        type(type) {
            const mimeType = type.includes('/') ? type : getMimeType(type);
            return this.setHeader('content-type', mimeType);
        },
        
        cookie(name, value, options = {}) {
            // Simplified cookie setting (serialize cookie string)
            let cookie = `${name}=${value}`;
            if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`;
            if (options.domain) cookie += `; Domain=${options.domain}`;
            if (options.path) cookie += `; Path=${options.path}`;
            if (options.secure) cookie += '; Secure';
            if (options.httpOnly) cookie += '; HttpOnly';
            if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;
            
            const existingCookies = this.get('set-cookie') || [];
            const cookies = Array.isArray(existingCookies) ? existingCookies : [existingCookies];
            cookies.push(cookie);
            this.setHeader('set-cookie', cookies);
            return this;
        },
        
        clearCookie(name, options = {}) {
            return this.cookie(name, '', { ...options, expires: new Date(1), maxAge: 0 });
        },
        
        redirect(statusOrUrl, url) {
            if (typeof statusOrUrl === 'string') {
                this.statusCode = 302;
                this.setHeader('location', statusOrUrl);
            } else {
                this.statusCode = statusOrUrl || 302;
                this.setHeader('location', url);
            }
            this.data = `Redirecting to ${url || statusOrUrl}`;
            return this;
        },
        
        location(url) {
            return this.setHeader('location', url);
        },
        
        vary(field) {
            const existing = this.get('vary');
            if (existing) {
                const fields = existing.split(', ');
                if (!fields.includes(field)) {
                    fields.push(field);
                    this.setHeader('vary', fields.join(', '));
                }
            } else {
                this.setHeader('vary', field);
            }
            return this;
        },
        
        append(field, value) {
            const existing = this.get(field);
            if (existing) {
                const values = Array.isArray(existing) ? existing : [existing];
                values.push(value);
                this.setHeader(field, values);
            } else {
                this.setHeader(field, value);
            }
            return this;
        },
        
        attachment(filename) {
            if (filename) {
                this.setHeader('content-disposition', `attachment; filename="${filename}"`);
                this.type(getFileExtension(filename));
            } else {
                this.setHeader('content-disposition', 'attachment');
            }
            return this;
        },
        
        format(obj) {
            // Simplified content negotiation
            const acceptHeader = this.req ? this.req.get('accept') : 'application/json';
            
            if (obj.json && acceptHeader.includes('application/json')) {
                return this.json(typeof obj.json === 'function' ? obj.json() : obj.json);
            } else if (obj.html && acceptHeader.includes('text/html')) {
                this.type('html');
                return this.send(typeof obj.html === 'function' ? obj.html() : obj.html);
            } else if (obj.text && acceptHeader.includes('text/plain')) {
                this.type('text');
                return this.send(typeof obj.text === 'function' ? obj.text() : obj.text);
            } else if (obj.default) {
                return typeof obj.default === 'function' ? obj.default() : this.send(obj.default);
            }
            
            this.statusCode = 406; // Not Acceptable
            return this.send('Not Acceptable');
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
 * Helper function to get HTTP status text
 */
function getStatusText(statusCode) {
    const statusTexts = {
        200: 'OK', 201: 'Created', 204: 'No Content',
        400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
        500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable'
    };
    return statusTexts[statusCode] || 'Unknown Status';
}

/**
 * Helper function to get MIME type from extension
 */
function getMimeType(extension) {
    const mimeTypes = {
        'html': 'text/html',
        'json': 'application/json',
        'xml': 'application/xml',
        'txt': 'text/plain',
        'css': 'text/css',
        'js': 'application/javascript',
        'pdf': 'application/pdf',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml'
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Helper function to get file extension
 */
function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

/**
 * Create a secure console object that captures logs
 */
function createConsoleObject() {
    const logs = [];
    
    return {
        log: (...args) => logs.push({ level: 'log', message: args.join(' '), timestamp: Date.now() }),
        info: (...args) => logs.push({ level: 'info', message: args.join(' '), timestamp: Date.now() }),
        warn: (...args) => logs.push({ level: 'warn', message: args.join(' '), timestamp: Date.now() }),
        error: (...args) => logs.push({ level: 'error', message: args.join(' '), timestamp: Date.now() }),
        getLogs: () => logs
    };
}

/**
 * Create secure require function with limited modules
 */
function createSecureRequire() {
    const allowedModules = [
        'crypto', 'querystring', 'url', 'util', 
        'path', 'os', 'stream', 'events'
    ];
    
    return (moduleName) => {
        if (allowedModules.includes(moduleName)) {
            return require(moduleName);
        }
        throw new Error(`Module '${moduleName}' is not allowed`);
    };
}

/**
 * Create standard response format
 */
function createResponse(success, data = null, message = '', statusCode = 200) {
    return {
        success,
        data,
        message,
        statusCode,
        timestamp: new Date().toISOString()
    };
}

/**
 * Filter headers to remove sensitive information
 */
function filterHeaders(headers) {
    const filtered = { ...headers };
    delete filtered['x-api-key'];
    delete filtered['authorization'];
    delete filtered['cookie'];
    return filtered;
}

/**
 * Cleanup temporary directory
 */
async function cleanupTempDir(tempDir) {
    try {
        await fs.remove(tempDir);
    } catch (error) {
        console.error('Failed to cleanup temp directory:', tempDir, error);
    }
}

module.exports = router;