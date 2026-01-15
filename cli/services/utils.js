const crypto = require('crypto');
const bcrypt = require('bcrypt');

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
    if (bytes === 0) return '0 Bytes';
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
        await database.query(`
            INSERT INTO execution_logs (
                function_id, status_code, execution_time_ms, 
                request_size, response_size, error_message, client_ip, user_agent
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            functionId, 
            statusCode, 
            executionTime, 
            requestInfo.requestSize || 0,
            requestInfo.responseSize || 0,
            error,
            requestInfo.clientIp || null,
            requestInfo.userAgent || null
        ]);

        // Update function execution count
        await database.query(`
            UPDATE functions 
            SET execution_count = execution_count + 1, last_executed = NOW()
            WHERE id = $1
        `, [functionId]);

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