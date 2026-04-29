'use strict'

/** @type {import('umzug').MigrationFn} */
module.exports = {
  async up({ context: { queryInterface, Sequelize } }) {
    // ── Create function_logs table (no FK references — cross-DB constraints not possible) ──
    await queryInterface.createTable('function_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      function_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      type: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'request'
      },
      source: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'execution'
      },
      executed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      payload_search: {
        type: 'TSVECTOR',
        allowNull: true
      }
    })

    // ── Create payload_fields table ──────────────────────────────────────────
    await queryInterface.createTable('payload_fields', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      field_path: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      field_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'string'
      },
      first_seen_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      last_seen_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    })

    // ── payload_fields constraints & indexes ─────────────────────────────────
    await queryInterface.addConstraint('payload_fields', {
      fields: ['project_id', 'field_path'],
      type: 'unique',
      name: 'uq_payload_fields_project_path'
    })

    await queryInterface.addIndex('payload_fields', {
      fields: ['project_id'],
      name: 'idx_payload_fields_project_id'
    })

    // ── function_logs basic indexes ──────────────────────────────────────────
    await queryInterface.addIndex('function_logs', {
      fields: ['project_id'],
      name: 'idx_function_logs_project_id'
    })

    await queryInterface.addIndex('function_logs', {
      fields: ['executed_at'],
      name: 'idx_function_logs_executed_at'
    })

    await queryInterface.addIndex('function_logs', {
      fields: ['type'],
      name: 'idx_function_logs_type'
    })

    await queryInterface.addIndex('function_logs', {
      fields: ['source'],
      name: 'idx_function_logs_source'
    })

    await queryInterface.addIndex('function_logs', {
      fields: ['payload'],
      using: 'GIN',
      name: 'idx_function_logs_payload'
    })

    await queryInterface.addIndex('function_logs', {
      fields: ['payload_search'],
      using: 'GIN',
      name: 'idx_function_logs_payload_search'
    })

    // ── function_logs expression indexes (JSONB payload paths) ──────────────
    await queryInterface.sequelize.query(
      `CREATE INDEX idx_function_logs_response_status ON function_logs (((payload->'response'->>'status')::int));`
    )

    await queryInterface.sequelize.query(
      `CREATE INDEX idx_function_logs_execution_time_ms ON function_logs (((payload->>'execution_time_ms')::numeric));`
    )

    await queryInterface.sequelize.query(
      `CREATE INDEX idx_function_logs_payload_source ON function_logs ((payload->>'source'));`
    )

    await queryInterface.sequelize.query(
      `CREATE INDEX idx_function_logs_payload_function_id ON function_logs ((payload->'function'->>'id'));`
    )

    await queryInterface.sequelize.query(
      `CREATE INDEX idx_function_logs_payload_function_name ON function_logs ((payload->'function'->>'name'));`
    )

    await queryInterface.sequelize.query(
      `CREATE INDEX idx_function_logs_request_method ON function_logs ((payload->'request'->>'method'));`
    )

    await queryInterface.sequelize.query(
      `CREATE INDEX idx_function_logs_request_path ON function_logs ((payload->'request'->>'path'));`
    )

    await queryInterface.sequelize.query(
      `CREATE INDEX idx_function_logs_request_ip ON function_logs ((payload->'request'->>'ip'));`
    )

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
    `)

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_update_payload_search
      BEFORE INSERT OR UPDATE ON function_logs
      FOR EACH ROW EXECUTE FUNCTION update_payload_search();
    `)
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_update_payload_search ON function_logs;`)
    await queryInterface.sequelize.query(`DROP FUNCTION IF EXISTS update_payload_search();`)
    await queryInterface.dropTable('function_logs')
    await queryInterface.dropTable('payload_fields')
  }
}
