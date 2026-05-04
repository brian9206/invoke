'use strict'

module.exports = {
  async up({ context: { queryInterface } }) {
    const { DataTypes } = require('sequelize')

    // 1. Create function_groups table
    await queryInterface.createTable('function_groups', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4
      },
      name: {
        type: DataTypes.STRING(512),
        allowNull: false
      },
      project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    })

    // Unique constraint: group names must be unique per project
    await queryInterface.addConstraint('function_groups', {
      fields: ['project_id', 'name'],
      type: 'unique',
      name: 'function_groups_project_id_name_unique'
    })

    // Index for fast lookup by project
    await queryInterface.addIndex('function_groups', ['project_id'], {
      name: 'function_groups_project_id_idx'
    })

    // 2. Add group_id column to functions
    await queryInterface.addColumn('functions', 'group_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'function_groups', key: 'id' },
      onDelete: 'SET NULL'
    })

    // 3. Add sort_order column to functions
    await queryInterface.addColumn('functions', 'sort_order', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    })

    // Index for fast lookup of functions by group
    await queryInterface.addIndex('functions', ['group_id'], {
      name: 'functions_group_id_idx'
    })
  },

  async down({ context: { queryInterface } }) {
    // Reverse in reverse order
    await queryInterface.removeIndex('functions', 'functions_group_id_idx')
    await queryInterface.removeColumn('functions', 'sort_order')
    await queryInterface.removeColumn('functions', 'group_id')
    await queryInterface.dropTable('function_groups')
  }
}
