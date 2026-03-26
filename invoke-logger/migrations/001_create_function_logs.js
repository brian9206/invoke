'use strict';

/** @type {import('umzug').MigrationFn} */
module.exports = {
  async up({ context: { queryInterface, Sequelize } }) {
    // ── Create function_logs table (no FK references — cross-DB constraints not possible) ──
    await queryInterface.createTable('function_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      function_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      type: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'request',
      },
      source: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'execution',
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
        type: 'TSVECTOR',
        allowNull: true,
      },
    });

    // ── Indexes ──────────────────────────────────────────────────────────────

    await queryInterface.addIndex('function_logs', {
      fields: ['executed_at'],
      name: 'idx_function_logs_executed_at',
    });

    await queryInterface.addIndex('function_logs', {
      fields: ['payload'],
      using: 'GIN',
      name: 'idx_function_logs_payload',
    });

    await queryInterface.addIndex('function_logs', {
      fields: ['payload_search'],
      using: 'GIN',
      name: 'idx_function_logs_payload_search',
    });

    await queryInterface.sequelize.query(
      `CREATE INDEX idx_function_logs_response_status ON function_logs (((payload->'response'->>'status')::int));`,
    );

    await queryInterface.addIndex('function_logs', {
      fields: ['project_id'],
      name: 'idx_function_logs_project_id',
    });

    await queryInterface.addIndex('function_logs', {
      fields: ['type'],
      name: 'idx_function_logs_type',
    });

    await queryInterface.addIndex('function_logs', {
      fields: ['source'],
      name: 'idx_function_logs_source',
    });

    // ── TSVECTOR trigger ─────────────────────────────────────────────────────
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

  async down({ context: { queryInterface } }) {
    await queryInterface.sequelize.query(
      `DROP TRIGGER IF EXISTS trg_update_payload_search ON function_logs;`,
    );
    await queryInterface.sequelize.query(`DROP FUNCTION IF EXISTS update_payload_search();`);
    await queryInterface.dropTable('function_logs');
  },
};
