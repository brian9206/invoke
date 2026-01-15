// Configuration settings for the example module
module.exports = {
    version: '1.2.0',
    environment: 'development',
    api: {
        timeout: 30000,
        retry_attempts: 3,
        rate_limit: 100
    },
    database: {
        version: '2.1.0',
        connection_timeout: 5000,
        max_connections: 10,
        retry_attempts: 3
    },
    logging: {
        level: 'info',
        format: 'json',
        include_stack_trace: true
    },
    security: {
        hash_algorithm: 'sha256',
        max_request_size: '10mb',
        allowed_origins: ['*']
    },
    features: {
        caching_enabled: true,
        metrics_enabled: true,
        debug_mode: false
    }
};