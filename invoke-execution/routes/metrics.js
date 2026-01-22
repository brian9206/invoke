const express = require('express');
const router = express.Router();

/**
 * Metrics endpoint - Provides real-time statistics about isolate pool and module cache
 * GET /metrics
 */
router.get('/', async (req, res) => {
    try {
        // Import ExecutionEngine to get metrics
        const { getMetrics } = require('../services/execution');
        
        const metrics = getMetrics();
        
        res.json({
            success: true,
            data: metrics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Metrics] Error retrieving metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve metrics',
            message: error.message
        });
    }
});

module.exports = router;
