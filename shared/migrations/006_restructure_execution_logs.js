'use strict';

/** @type {import('umzug').MigrationFn} */
module.exports = {
  async up({ context: { queryInterface, Sequelize } }) {
    // ── Drop old execution_logs table (all data is discarded) ────────────────
    await queryInterface.dropTable('execution_logs');

    // ── Create function_logs with JSONB payload schema ───────────────────────
    await queryInterface.createTable('function_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      function_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'functions', key: 'id' },
        onDelete: 'CASCADE',
      },
      executed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      payload_search: {
        // TSVECTOR — populated automatically by the trigger below.
        // Not writable via the Sequelize model; managed at the DB level.
        type: 'TSVECTOR',
        allowNull: true,
      },
    });

    // ── Indexes ──────────────────────────────────────────────────────────────

    // B-tree on executed_at for time-range queries and retention cleanup
    await queryInterface.addIndex('function_logs', {
      fields: ['executed_at'],
      name: 'idx_function_logs_executed_at',
    });

    // GIN on payload for JSONB key/value queries
    await queryInterface.addIndex('function_logs', {
      fields: ['payload'],
      using: 'GIN',
      name: 'idx_function_logs_payload',
    });

    // GIN on payload_search for full-text search
    await queryInterface.addIndex('function_logs', {
      fields: ['payload_search'],
      using: 'GIN',
      name: 'idx_function_logs_payload_search',
    });

    // B-tree on payload->response->status for status filtering
    await queryInterface.sequelize.query(
      `CREATE INDEX idx_function_logs_response_status ON function_logs (((payload->'response'->>'status')::int));`
    );

    // ── Trigger function: populate payload_search from payload JSONB values ──
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION update_payload_search()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        NEW.payload_search := to_tsvector(
          'english',
          COALESCE(
            (SELECT string_agg(value, ' ') FROM jsonb_each_text(NEW.payload)),
            ''
          )
        );
        RETURN NEW;
      END;
      $$;
    `);

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_update_payload_search
      BEFORE INSERT OR UPDATE ON function_logs
      FOR EACH ROW EXECUTE FUNCTION update_payload_search();
    `);
  },

  async down({ context: { queryInterface, Sequelize } }) {
    // ── Drop index on response.status ────────────────────────────────────────
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS idx_function_logs_response_status;'
    );

    // ── Drop trigger and trigger function ────────────────────────────────────
    await queryInterface.sequelize.query(
      'DROP TRIGGER IF EXISTS trg_update_payload_search ON function_logs;',
    );
    await queryInterface.sequelize.query(
      'DROP FUNCTION IF EXISTS update_payload_search();',
    );

    // ── Drop the new function_logs table ─────────────────────────────────────
    await queryInterface.dropTable('function_logs');

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
