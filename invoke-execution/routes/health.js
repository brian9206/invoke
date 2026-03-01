const express = require('express');
const { Op } = require('sequelize');
const database = require('../services/database');
const minioService = require('../services/minio');
const cache = require('../services/cache');

const router = express.Router();

/**
 * Health Check Endpoints for Execution Service
 */

/**
 * GET /health
 * Basic health check
 */
router.get('/', async (req, res) => {
    try {
        // Check database connectivity
        await database.sequelize.authenticate();
        
        // Check MinIO connectivity
        let minioStatus = 'unknown';
        try {
            await minioService.getClient().listBuckets();
            minioStatus = 'connected';
        } catch (error) {
            minioStatus = 'disconnected';
        }
        
        // Check cache system
        let cacheStatus = 'unknown';
        try {
            await cache.getCacheStats();
            cacheStatus = 'operational';
        } catch (error) {
            cacheStatus = 'error';
        }
        
        res.status(200).json({
            status: 'healthy',
            service: 'invoke-execution',
            timestamp: new Date().toISOString(),
            database: 'connected',
            minio: minioStatus,
            cache: cacheStatus
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            service: 'invoke-execution',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error.message
        });
    }
});

/**
 * GET /health/detailed
 * Detailed health check with system information
 */
router.get('/detailed', async (req, res) => {
    const os = require('os');
    
    try {
        // Check database
        const recentCount = await database.models.ExecutionLog.count({
            where: { executed_at: { [Op.gt]: new Date(Date.now() - 3600 * 1000) } },
        });
        
        // Check MinIO and get detailed info
        let minioInfo = { status: 'unknown' };
        try {
            const client = minioService.getClient();
            const buckets = await client.listBuckets();
            minioInfo = {
                status: 'connected',
                buckets: buckets.map(b => b.name)
            };
        } catch (error) {
            minioInfo = {
                status: 'disconnected',
                error: error.message
            };
        }
        
        // Check cache and get statistics
        let cacheInfo = { status: 'unknown' };
        try {
            const stats = await cache.getCacheStats();
            cacheInfo = {
                status: 'operational',
                stats
            };
        } catch (error) {
            cacheInfo = {
                status: 'error',
                error: error.message
            };
        }
        
        // System information
        const systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            uptime: process.uptime(),
            memory: {
                used: process.memoryUsage(),
                total: os.totalmem(),
                free: os.freemem()
            },
            cpu: {
                count: os.cpus().length,
                loadAvg: os.loadavg()
            }
        };
        
        res.status(200).json({
            status: 'healthy',
            service: 'invoke-execution',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            checks: {
                database: {
                    status: 'connected',
                    recentExecutions: recentCount
                },
                minio: minioInfo,
                cache: cacheInfo,
                system: systemInfo
            }
        });
        
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            service: 'invoke-execution',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

module.exports = router;