const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Validate and parse MAX_RESPONSE_LOG_SIZE environment variable
const parseMaxResponseLogSize = () => {
    const envValue = process.env.MAX_RESPONSE_LOG_SIZE;
    
    if (!envValue) {
        // Default to 10MB
        return 10 * 1024 * 1024;
    }
    
    const parsed = parseInt(envValue, 10);
    
    if (isNaN(parsed) || parsed <= 0) {
        throw new Error(`MAX_RESPONSE_LOG_SIZE must be a positive integer, got: ${envValue}`);
    }
    
    return parsed;
};

const MAX_RESPONSE_LOG_SIZE = parseMaxResponseLogSize();

/**
 * Shared utility functions for all Invoke services
 */

/**
 * Generate a secure API key
 * @param {number} length - Length of the key
 * @returns {string} API key
 */
function generateApiKey(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash an API key for secure storage
 * @param {string} apiKey - Plain text API key
 * @returns {string} Hashed API key
 */
function hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Hash a password for storage
 * @param {string} password - Plain text password
 * @returns {string} Hashed password
 */
async function hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against its hash
 * @param {string} password - Plain text password
 * @param {string} hash - Stored password hash
 * @returns {boolean} Whether password matches
 */
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * Generate a unique function ID
 * @returns {string} UUID-like string
 */
function generateFunctionId() {
    return crypto.randomUUID();
}

/**
 * Validate environment variables
 * @param {string[]} requiredVars - Array of required environment variable names
 */
function validateEnvironment(requiredVars) {
    const missing = requiredVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

/**
 * Format file size in human readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
    if (bytes == 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Sanitize filename for filesystem storage
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
    return filename
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/_{2,}/g, '_')
        .substring(0, 100);
}

/**
 * Create a standardized API response
 * @param {boolean} success - Success status
 * @param {any} data - Response data
 * @param {string} message - Response message
 * @param {number} statusCode - HTTP status code
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
 * Log execution metrics
 * @param {string} functionId - Function ID
 * @param {number} executionTime - Execution time in milliseconds
 * @param {number} statusCode - HTTP status code
 * @param {string} error - Error message if any
 * @param {Object} requestInfo - Additional request information
 */
async function logExecution(functionId, executionTime, statusCode, error = null, requestInfo = {}) {
    const database = require('./database');
    
    try {
        // Format response body for logging based on MIME type
        let responseBodyLog = '';
        if (requestInfo.responseBody) {
            const contentType = (requestInfo.responseHeaders?.['content-type'] || '').toLowerCase();
            
            // Text-based MIME types that should be logged
            const isTextContent = 
                contentType.startsWith('text/') ||
                contentType.includes('application/json') ||
                contentType.includes('application/xml') ||
                contentType.includes('application/javascript') ||
                contentType.includes('application/x-www-form-urlencoded') ||
                contentType.includes('+json') ||
                contentType.includes('+xml');
            
            if (isTextContent) {
                if (Buffer.isBuffer(requestInfo.responseBody)) {
                    responseBodyLog = requestInfo.responseBody.toString('utf8');
                } else if (typeof requestInfo.responseBody === 'string') {
                    responseBodyLog = requestInfo.responseBody;
                } else {
                    responseBodyLog = JSON.stringify(requestInfo.responseBody);
                }
                
                // Truncate if exceeds max size
                if (responseBodyLog.length > MAX_RESPONSE_LOG_SIZE) {
                    const sizeMB = (MAX_RESPONSE_LOG_SIZE / (1024 * 1024)).toFixed(1);
                    responseBodyLog = responseBodyLog.substring(0, MAX_RESPONSE_LOG_SIZE) + 
                        `...<TRUNCATED at ${sizeMB}MB>`;
                }
            } else {
                // Binary content (images, videos, etc.)
                responseBodyLog = '<BINARY>';
            }
        }
        
        const { ExecutionLog, Function: FunctionModel } = database.models;

        await ExecutionLog.create({
            function_id: functionId,
            status_code: statusCode,
            execution_time_ms: executionTime,
            request_size: requestInfo.requestSize || 0,
            response_size: requestInfo.responseSize || 0,
            error_message: error,
            client_ip: requestInfo.clientIp || null,
            user_agent: requestInfo.userAgent || null,
            console_logs: requestInfo.consoleOutput || [],
            request_headers: requestInfo.requestHeaders || {},
            response_headers: requestInfo.responseHeaders || {},
            request_body: requestInfo.requestBody || '',
            response_body: responseBodyLog,
            request_method: requestInfo.requestMethod || 'POST',
            request_url: requestInfo.requestUrl || '',
        });

        // Update function execution count atomically
        await FunctionModel.update(
            {
                execution_count: database.sequelize.literal('execution_count + 1'),
                last_executed: new Date(),
            },
            { where: { id: functionId } }
        );

    } catch (dbError) {
        console.error('Failed to log execution:', dbError);
    }
}

module.exports = {
    generateApiKey,
    hashApiKey,
    hashPassword,
    verifyPassword,
    generateFunctionId,
    validateEnvironment,
    formatFileSize,
    sanitizeFilename,
    createResponse,
    logExecution
};