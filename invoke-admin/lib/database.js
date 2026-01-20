const { Pool } = require('pg');

/**
 * PostgreSQL Database Connection Pool
 * For Invoke Admin service
 */
class Database {
    constructor() {
        this.pool = null;
    }

    /**
     * Initialize database connection pool
     */
    async connect() {
        if (this.pool) return this.pool;

        this.pool = new Pool({
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'invoke_db',
            password: process.env.DB_PASSWORD || 'postgres',
            port: process.env.DB_PORT || 5432,
            max: 20, // Maximum number of connections
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Test connection
        try {
            const client = await this.pool.connect();
            console.log('✅ Database connected successfully');
            client.release();
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }

        return this.pool;
    }

    /**
     * Execute a query
     * @param {string} text - SQL query
     * @param {Array} params - Query parameters
     */
    async query(text, params = []) {
        try {
            // Auto-connect if not already connected
            if (!this.pool) {
                await this.connect();
            }
            
            const result = await this.pool.query(text, params);
            return result;
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }

    /**
     * Execute a transaction
     * @param {Function} callback - Transaction callback
     */
    async transaction(callback) {
        // Auto-connect if not already connected
        if (!this.pool) {
            await this.connect();
        }
        
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Close database connections
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
}

module.exports = new Database();