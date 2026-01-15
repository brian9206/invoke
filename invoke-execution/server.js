const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
require('dotenv').config();

const { validateEnvironment } = require('./services/utils');
const database = require('./services/database');
const cache = require('./services/cache');

// Routes
const executionRoutes = require('./routes/execution');
const healthRoutes = require('./routes/health');

/**
 * Invoke Execution Service
 * 
 * This service is responsible for:
 * - Executing user functions safely in isolated environments
 * - Downloading packages from MinIO object storage with local caching
 * - API key authentication for protected functions
 * - Rate limiting and DoS protection
 * - Cleanup of temporary files and cache management
 * 
 * This service supports horizontal scaling
 */

class ExecutionServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3001;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Security middleware
        this.app.use(helmet());
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
        }));

        // Rate limiting - prevent abuse
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: process.env.RATE_LIMIT || 100, // Limit each IP to 100 requests per windowMs
            message: {
                success: false,
                message: 'Too many requests, please try again later.'
            },
            standardHeaders: true,
            legacyHeaders: false
        });
        this.app.use('/invoke', limiter);

        // Slow down repeated requests
        /*const speedLimiter = slowDown({
            windowMs: 15 * 60 * 1000, // 15 minutes
            delayAfter: 50, // Allow 50 requests at normal speed
            delayMs: 100, // Add 100ms delay per request after delayAfter
            maxDelayMs: 5000 // Maximum delay of 5 seconds
        });
        this.app.use('/invoke', speedLimiter);*/
        
        // Performance middleware
        this.app.use(compression());
        
        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
            next();
        });
    }

    /**
     * Setup application routes
     */
    setupRoutes() {
        // Health check endpoint
        this.app.use('/health', healthRoutes);
        
        // Function execution endpoints
        this.app.use('/invoke', executionRoutes);
        
        // Root endpoint
        this.app.get('/', (req, res) => {
            res.json({
                service: 'invoke-execution',
                version: '1.0.0',
                status: 'running',
                endpoints: {
                    health: '/health',
                    execute: 'POST /invoke/:functionId',
                    executeGet: 'GET /invoke/:functionId'
                },
                features: {
                    apiKeyAuth: true,
                    rateLimiting: true,
                    isolation: true,
                    autoCleanup: true
                }
            });
        });
    }

    /**
     * Setup error handling middleware
     */
    setupErrorHandling() {
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                message: 'Endpoint not found',
                path: req.originalUrl
            });
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('Global error:', error);
            
            // Don't leak internal errors in production
            const message = process.env.NODE_ENV === 'production' 
                ? 'Internal server error' 
                : error.message;
            
            res.status(error.status || 500).json({
                success: false,
                message: message,
                ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
            });
        });
    }

    /**
     * Start the server
     */
    async start() {
        try {
            // Validate required environment variables
            validateEnvironment(['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY']);
            
            // Connect to database
            await database.connect();
            
            // Initialize cache service
            await cache.initialize();
            
            // Start HTTP server
            this.server = this.app.listen(this.port, () => {
                console.log(`⚡ Invoke Execution Service running on port ${this.port}`);
                console.log(`🗄️ MinIO Endpoint: ${process.env.MINIO_ENDPOINT}`);
                console.log(`💾 Cache Directory: ${process.env.CACHE_DIR || '/tmp/invoke-cache'}`);
                console.log(`🔒 API Key Authentication: ${process.env.REQUIRE_API_KEY === 'true' ? 'Required' : 'Optional'}`);
                console.log(`🚦 Rate Limit: ${process.env.RATE_LIMIT || 100} requests per 15 minutes`);
            });

            // Handle graceful shutdown
            process.on('SIGTERM', this.shutdown.bind(this));
            process.on('SIGINT', this.shutdown.bind(this));
            
        } catch (error) {
            console.error('❌ Failed to start Execution Service:', error);
            process.exit(1);
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        console.log('🔄 Shutting down Execution Service...');
        
        if (this.server) {
            this.server.close(() => {
                console.log('⚡ Execution Service stopped');
            });
        }
        
        await database.close();
        process.exit(0);
    }
}

// Start the server if this file is run directly
if (require.main === module) {
    const server = new ExecutionServer();
    server.start();
}

module.exports = ExecutionServer;