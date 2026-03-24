'use strict';

module.exports = {
  async up({ context: { queryInterface, Sequelize } }) {
    // ── realtime_namespaces ──────────────────────────────────────────────────
    await queryInterface.createTable('realtime_namespaces', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
      },
      gateway_config_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'api_gateway_configs', key: 'id' },
        onDelete: 'CASCADE',
      },
      namespace_path: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      auth_logic: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'or',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addConstraint('realtime_namespaces', {
      fields: ['gateway_config_id', 'namespace_path'],
      type: 'unique',
      name: 'realtime_namespaces_gateway_config_id_namespace_path_key',
    });

    // ── realtime_event_handlers ──────────────────────────────────────────────
    await queryInterface.createTable('realtime_event_handlers', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
      },
      realtime_namespace_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'realtime_namespaces', key: 'id' },
        onDelete: 'CASCADE',
      },
      event_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      function_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'functions', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addConstraint('realtime_event_handlers', {
      fields: ['realtime_namespace_id', 'event_name'],
      type: 'unique',
      name: 'realtime_event_handlers_namespace_event_key',
    });

    // ── realtime_namespace_auth_methods ──────────────────────────────────────
    await queryInterface.createTable('realtime_namespace_auth_methods', {
      realtime_namespace_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'realtime_namespaces', key: 'id' },
        onDelete: 'CASCADE',
      },
      auth_method_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'api_gateway_auth_methods', key: 'id' },
        onDelete: 'CASCADE',
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    });

    // ── socket_io_attachments ───────────────────────────────────────────────
    await queryInterface.createTable('socket_io_attachments', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      payload: {
        type: Sequelize.BLOB,
        allowNull: true,
      },
    });

    // ── PG notify triggers ───────────────────────────────────────────────────
    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_realtime_namespaces_notify
        AFTER INSERT OR UPDATE OR DELETE ON realtime_namespaces
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();
    `);

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_realtime_event_handlers_notify
        AFTER INSERT OR UPDATE OR DELETE ON realtime_event_handlers
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();
    `);

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_realtime_namespace_auth_methods_notify
        AFTER INSERT OR UPDATE OR DELETE ON realtime_namespace_auth_methods
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();
    `);
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.sequelize.query(
      'DROP TRIGGER IF EXISTS trg_realtime_namespace_auth_methods_notify ON realtime_namespace_auth_methods;',
    );
    await queryInterface.sequelize.query(
      'DROP TRIGGER IF EXISTS trg_realtime_event_handlers_notify ON realtime_event_handlers;',
    );
    await queryInterface.sequelize.query(
      'DROP TRIGGER IF EXISTS trg_realtime_namespaces_notify ON realtime_namespaces;',
    );
    await queryInterface.dropTable('realtime_namespace_auth_methods');
    await queryInterface.dropTable('realtime_event_handlers');
    await queryInterface.dropTable('realtime_namespaces');
    await queryInterface.dropTable('socket_io_attachments');
  },
};
