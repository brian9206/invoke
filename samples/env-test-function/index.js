// Test function to demonstrate environment variables
module.exports = function(req, res) {
    // Access environment variables that should be set by the function configuration
    const customMessage = process.env.MESSAGE || 'No MESSAGE variable set';
    const customNumber = process.env.NUMBER || 'No NUMBER variable set';
    const customSecret = process.env.SECRET || 'No SECRET variable set';
    
    // Also show the standard NODE_ENV
    const nodeEnv = process.env.NODE_ENV || 'No NODE_ENV set';
    
    // Return the environment variables
    res.json({
        message: `Hello from environment variables test!`,
        environment: {
            MESSAGE: customMessage,
            NUMBER: customNumber,
            SECRET: customSecret,
            NODE_ENV: nodeEnv
        },
        allEnvVars: Object.keys(process.env)
    });
};