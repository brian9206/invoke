const express = require('express');
const { VM } = require('vm2');
const fs = require('fs-extra');
const path = require('path');
const { logExecution } = require('../services/utils');
const db = require('../services/database');
const cache = require('../services/cache');
const { executeFunction, createExecutionContext, getFunctionPackage } = require('../services/execution');

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
            return res.status(404).json({
                success: false,
                message: 'Function not found'
            });
        }

        const functionInfo = functionResult.rows[0];

        // Check if API key is required and validate it
        if (functionInfo.api_key_required && functionInfo.api_key) {
            if (!apiKey) {
                return res.status(401).json({
                    success: false,
                    message: 'API key required'
                });
            }
            
            if (apiKey !== functionInfo.api_key) {
                return res.status(403).json({
                    success: false,
                    message: 'Invalid API key'
                });
            }
        }

        req.functionInfo = functionInfo;
        next();
    } catch (error) {
        console.error('API key authentication error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
}

/**
 * GET /invoke/:functionId
 * Execute a function with GET parameters
 */
router.all('/:functionId', authenticateApiKey, async (req, res) => {
    const startTime = Date.now();
    let tempDir = null;

    try {
        const { functionId } = req.params;
        const { query: queryParams, headers } = req;

        // Get function package (with caching)
        const packageInfo = await getFunctionPackage(functionId);
        tempDir = packageInfo.tempDir;

        // Create execution context
        const executionContext = createExecutionContext(req.method, {}, queryParams, filterHeaders(headers), { functionId }, req);

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
                message: result.message || 'Execution failed'
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
        console.error('GET execution error:', error);
        
        await logExecution(req.params.functionId, executionTime, 500, error.message);
        
        res.status(500).json(createResponse(false, null, 'Execution failed', 500));
    } finally {
        // Don't cleanup cached directories - let cache service manage them
    }
});


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
 * Manual cache cleanup endpoint
 */
router.post('/cache/cleanup', async (req, res) => {
    try {
        const result = await cache.cleanupCache();
        res.json(createResponse(true, result, 'Cache cleanup completed successfully'));
    } catch (error) {
        console.error('Error during cache cleanup:', error);
        res.status(500).json(createResponse(false, null, 'Cache cleanup failed'));
    }
});

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

module.exports = router;