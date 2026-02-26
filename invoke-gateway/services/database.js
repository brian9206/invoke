const { Pool } = require('pg');

/**
 * Database singleton for the API Gateway service.
 * Mirrors the pattern used in invoke-execution/services/database.js.
 */
class Database {
  constructor() {
    this.pool = null;
  }

  async connect() {
    if (this.pool) return;

    this.pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT || '5432'),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Verify connection
    const client = await this.pool.connect();
    client.release();
    console.log('[Database] Connected to PostgreSQL');
  }

  async query(text, params = []) {
    if (!this.pool) await this.connect();
    return this.pool.query(text, params);
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

module.exports = new Database();
