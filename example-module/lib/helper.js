const config = require('../config/settings'); // Relative requires work
const database = require('./database'); // Sibling file require

/**
 * Format response with standard structure
 * @param {Object} data - Data to format
 * @returns {Promise<Object>} Formatted response
 */
async function formatResponse(data) {
    console.log('Formatting response in helper module');
    
    // Simulate some async operation
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const response = {
        success: true,
        data: data,
        metadata: {
            timestamp: new Date().toISOString(),
            version: config.version,
            environment: config.environment,
            request_id: generateRequestId()
        },
        statistics: await database.getStats()
    };
    
    console.log('Response formatting completed');
    return response;
}

/**
 * Generate unique request ID
 * @returns {string} Request ID
 */
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format error response
 * @param {string} message - Error message
 * @param {number} code - Error code
 * @returns {Object} Formatted error response
 */
function formatError(message, code = 500) {
    return {
        success: false,
        error: {
            message: message,
            code: code,
            timestamp: new Date().toISOString(),
            version: config.version
        }
    };
}

module.exports = { 
    formatResponse, 
    generateRequestId, 
    formatError 
};