'use strict'

module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.createTable('project_databases', {
      id: {
        type: 'UUID',
        primaryKey: true,
        defaultValue: queryInterface.sequelize.literal('gen_random_uuid()')
      },
      project_id: {
        type: 'UUID',
        allowNull: false,
        unique: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE'
      },
      db_name: {
        type: 'VARCHAR(63)',
        allowNull: false
      },
      app_username: {
        type: 'VARCHAR(63)',
        allowNull: false
      },
      admin_username: {
        type: 'VARCHAR(63)',
        allowNull: false
      },
      app_password_encrypted: {
        type: 'TEXT',
        allowNull: false
      },
      admin_password_encrypted: {
        type: 'TEXT',
        allowNull: false
      },
      status: {
        type: 'VARCHAR(20)',
        allowNull: false,
        defaultValue: 'initialized'
      },
      initialized_at: {
        type: 'TIMESTAMP WITH TIME ZONE',
        allowNull: true
      },
      initialized_by: {
        type: 'INTEGER',
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      storage_locked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_at: {
        type: 'TIMESTAMP WITH TIME ZONE',
        allowNull: false,
        defaultValue: queryInterface.sequelize.literal('NOW()')
      },
      updated_at: {
        type: 'TIMESTAMP WITH TIME ZONE',
        allowNull: false,
        defaultValue: queryInterface.sequelize.literal('NOW()')
      }
    })

    await queryInterface.addIndex('project_databases', ['project_id'], { unique: true })
    await queryInterface.addIndex('project_databases', ['db_name'], { unique: true })

    await queryInterface.addColumn('projects', 'sql_storage_limit_bytes', {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 1073741824
    })

    await queryInterface.bulkInsert('global_settings', [
      {
        setting_key: 'sql_relay_url',
        setting_value: 'ws://localhost:3010/sql/relay',
        description: 'WebSocket URL the CLI uses to connect to the SQL relay service',
        updated_at: new Date()
      },
      {
        setting_key: 'sql_storage_limit_bytes',
        setting_value: '1073741824',
        description: 'Maximum storage size for project SQL databases in bytes (default 1GB)'
      }
    ])
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.bulkDelete('global_settings', {
      setting_key: 'sql_relay_url'
    })

    await queryInterface.bulkDelete('global_settings', {
      setting_key: 'sql_storage_limit_bytes'
    })

    await queryInterface.dropTable('project_databases')
    await queryInterface.removeColumn('projects', 'sql_storage_limit_bytes')
  }
}
