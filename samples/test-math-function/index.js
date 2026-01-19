/**
 * Test Math Function
 * Performs basic arithmetic operations
 * Compatible with Express route handler (req, res)
 */

module.exports = function(req, res) {
    console.log('Math function executed!');
    console.log('Method:', req.method);
    console.log('Query:', req.query);
    console.log('Body:', req.body);
    
    // Get operation parameters from query or body
    const params = { ...req.query, ...req.body };
    const { operation, a, b } = params;
    
    // Convert to numbers
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    
    if (isNaN(numA) || isNaN(numB)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid numbers provided',
            message: 'Please provide valid numbers for parameters a and b'
        });
    }
    
    let result;
    
    switch (operation) {
        case 'add':
            result = numA + numB;
            break;
        case 'subtract':
            result = numA - numB;
            break;
        case 'multiply':
            result = numA * numB;
            break;
        case 'divide':
            if (numB === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Division by zero',
                    message: 'Cannot divide by zero'
                });
            }
            result = numA / numB;
            break;
        default:
            return res.status(400).json({
                success: false,
                error: 'Unknown operation',
                message: 'Supported operations: add, subtract, multiply, divide'
            });
    }
    
    res.json({
        success: true,
        operation: operation,
        operands: { a: numA, b: numB },
        result: result,
        timestamp: new Date().toISOString()
    });
};