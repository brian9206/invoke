const { createDatabase } = require('./database');
const { initModels } = require('./models');

/**
 * Factory that creates a fully-initialised Sequelize database singleton
 * for an Invoke service.
 *
 * Usage (per-service database.js):
 *   const { createServiceDatabase } = require('invoke-shared');
 *   module.exports = createServiceDatabase({ poolMax: 20 });
 *
 * @param {object} [options]
 * @param {number} [options.poolMax=20]  Max Sequelize pool connections.
 * @returns {{ sequelize: import('sequelize').Sequelize, models: object, getConnectionConfig: () => object, close: () => Promise<void> }}
 */
function createServiceDatabase({ poolMax = 20 } = {}) {
  const sequelize = createDatabase({ pool: { max: poolMax } });
  const models = initModels(sequelize);

  return {
    sequelize,
    models,

    /**
     * Returns the pg connection configuration derived from environment variables.
     * Useful for building raw connection strings (e.g. Keyv/KeyvPostgres).
     */
    getConnectionConfig() {
      return {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'invoke_db',
        password: process.env.DB_PASSWORD || 'postgres',
        port: parseInt(process.env.DB_PORT || '5432', 10),
      };
    },

    /** Close the Sequelize connection pool. */
    async close() {
      await sequelize.close();
    },
  };
}

module.exports = { createServiceDatabase };
