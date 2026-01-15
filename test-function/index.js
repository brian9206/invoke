/**
 * Sample Hello World Function
 * This is a test function for the Invoke platform
 * Compatible with Express route handler (req, res)
 */

module.exports = function(req, res) {
    console.log('Hello World function executed!');
    console.log('Method:', req.method);
    console.log('Query:', req.query);
    console.log('Body:', req.body);
    
    const response = {
        success: true,
        message: 'Hello from the Invoke platform!',
        timestamp: new Date().toISOString(),
        method: req.method,
        query: req.query,
        body: req.body,
        headers: req.headers
    };
    
    res.json(response);
};