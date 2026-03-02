/**
 * Sequelize connection factory for Invoke services.
 *
 * Usage:
 *   const { createDatabase } = require('invoke-shared');
 *   const sequelize = createDatabase({ pool: { max: 10 } });
 *
 * All services share this factory; per-service pool sizes are passed via options.
 */

const { Sequelize } = require('sequelize');

/**
 * @param {object} [options]
 * @param {{ max?: number, min?: number, acquire?: number, idle?: number }} [options.pool]
 * @returns {Sequelize}
 */
function createDatabase(options = {}) {
  const pool = {
    max: 20,
    min: 0,
    acquire: 30000,
    idle: 10000,
    ...options.pool,
  };

  return new Sequelize(
    process.env.DB_NAME || 'invoke_db',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'postgres',
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      dialect: 'postgres',
      pool,
      logging: process.env.SEQUELIZE_LOG === 'true' ? console.log : false,
      define: {
        // Applied globally; individual models can override.
        underscored: true,
        timestamps: false,
        freezeTableName: true,
      },
    }
  );
}

module.exports = { createDatabase };
