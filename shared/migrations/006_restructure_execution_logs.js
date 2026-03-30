'use strict';

/** @type {import('umzug').MigrationFn} */
module.exports = {
  async up({ context: { queryInterface, Sequelize } }) {
    // ── Drop old execution_logs table (all data is discarded) ────────────────
    await queryInterface.dropTable('execution_logs');
  },

  async down({ context: { queryInterface, Sequelize } }) {
    // ── Restore original execution_logs table (from migration 001) ───────────
    await queryInterface.createTable('execution_logs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      function_id: {
        type: Sequelize.UUID,
        references: { model: 'functions', key: 'id' },
        onDelete: 'CASCADE',
      },
      status_code: { type: Sequelize.INTEGER },
      execution_time_ms: { type: Sequelize.INTEGER },
      request_size: { type: Sequelize.BIGINT },
      response_size: { type: Sequelize.BIGINT },
      request_headers: { type: Sequelize.JSONB },
      response_headers: { type: Sequelize.JSONB },
      request_body: { type: Sequelize.TEXT },
      response_body: { type: Sequelize.TEXT },
      request_method: { type: Sequelize.STRING(10) },
      request_url: { type: Sequelize.TEXT },
      console_logs: { type: Sequelize.JSONB },
      error_message: { type: Sequelize.TEXT },
      client_ip: { type: 'INET' },
      user_agent: { type: Sequelize.TEXT },
      api_key_used: { type: Sequelize.BOOLEAN, defaultValue: false },
      executed_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });
  },
};
