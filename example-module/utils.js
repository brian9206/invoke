const crypto = require('crypto'); // Built-in module still works

/**
 * Process input data by adding metadata and hash
 * @param {Object} data - Input data to process
 * @returns {Object} Processed data with additional metadata
 */
function processData(data) {
    console.log('Processing data in utils module');
    
    const processedData = {
        ...data,
        processed_at: Date.now(),
        hash: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'),
        type: typeof data,
        size: JSON.stringify(data).length
    };
    
    console.log('Data processing completed, hash generated');
    return processedData;
}

/**
 * Validate input data
 * @param {*} data - Data to validate
 * @returns {boolean} True if valid
 */
function validateData(data) {
    return data !== null && data !== undefined;
}

/**
 * Clean sensitive data from object
 * @param {Object} data - Data to clean
 * @returns {Object} Cleaned data
 */
function cleanSensitiveData(data) {
    const cleaned = { ...data };
    const sensitiveKeys = ['password', 'token', 'secret', 'key'];
    
    sensitiveKeys.forEach(key => {
        if (cleaned[key]) {
            cleaned[key] = '[REDACTED]';
        }
    });
    
    return cleaned;
}

module.exports = { 
    processData, 
    validateData, 
    cleanSensitiveData 
};