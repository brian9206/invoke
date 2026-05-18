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
      storage_limit_bytes: {
        type: 'BIGINT',
        allowNull: false,
        defaultValue: 1073741824
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
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.dropTable('project_databases')
  }
}
