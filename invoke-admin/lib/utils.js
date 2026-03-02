const crypto = require('crypto');
const bcrypt = require('bcrypt');
const zxcvbn = require('zxcvbn');

/**
 * Utility functions for Invoke Admin service
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
 * Validate password strength using zxcvbn
 * @param {string} password - Plain text password to validate
 * @returns {Object} Validation result with success, score, and feedback
 */
function validatePasswordStrength(password) {
    const result = zxcvbn(password);
    
    if (result.score < 3) {
        return {
            success: false,
            score: result.score,
            feedback: result.feedback.warning || 
                      (result.feedback.suggestions.length > 0 
                        ? result.feedback.suggestions[0] 
                        : 'Password is too weak. Use a longer password with a mix of characters.')
        };
    }
    
    return {
        success: true,
        score: result.score,
        feedback: null
    };
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
    const database = require('@/lib/database');
    const { ExecutionLog, Function: FunctionModel } = database.models;

    try {
        await ExecutionLog.create({
            function_id: functionId,
            status_code: statusCode,
            execution_time_ms: executionTime,
            request_size: requestInfo.requestSize || 0,
            response_size: requestInfo.responseSize || 0,
            error_message: error,
            client_ip: requestInfo.clientIp || null,
            user_agent: requestInfo.userAgent || null,
        });

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

/**
 * Get the function base URL from global settings
 * @returns {Promise<string>} Function base URL
 */
async function getFunctionBaseUrl() {
    try {
        const database = require('@/lib/database');
        const { GlobalSetting } = database.models;
        const setting = await GlobalSetting.findOne({
            where: { setting_key: 'function_base_url' },
        });

        if (setting) {
            return setting.setting_value.replace(/\/+$/, '');
        }

        // Fallback to default if not found
        return 'https://localhost:3001/invoke';
    } catch (error) {
        console.error('Failed to get function base URL:', error);
        // Fallback to default on error
        return 'https://localhost:3001/invoke';
    }
}

/**
 * Generate a complete function URL
 * @param {string} functionId - Function ID
 * @returns {Promise<string>} Complete function URL
 */
async function getFunctionUrl(functionId) {
    const baseUrl = await getFunctionBaseUrl();
    return `${baseUrl}/${functionId}`;
}

module.exports = {
    generateApiKey,
    hashApiKey,
    hashPassword,
    verifyPassword,
    validatePasswordStrength,
    generateFunctionId,
    validateEnvironment,
    formatFileSize,
    sanitizeFilename,
    createResponse,
    logExecution,
    getFunctionBaseUrl,
    getFunctionUrl
};