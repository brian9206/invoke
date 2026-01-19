const utils = require('./utils');
const helper = require('./lib/helper');

module.exports = async (req, res) => {
    console.log('Processing request for modular function');
    
    try {
        // Handle different request methods
        const inputData = req.method === 'GET' ? req.query : req.body;
        
        // Process the input data using utils
        const processed = utils.processData(inputData || { message: 'Hello from modular function!' });
        
        // Format the response using helper
        const result = await helper.formatResponse(processed);
        
        console.log('Successfully processed request');
        res.json(result);
        
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};