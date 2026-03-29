'use strict';

/** @type {import('umzug').MigrationFn} */
module.exports = {
  async up({ context: { queryInterface, Sequelize } }) {
    await queryInterface.createTable('payload_fields', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      field_path: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      field_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'string',
      },
      first_seen_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      last_seen_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addConstraint('payload_fields', {
      fields: ['project_id', 'field_path'],
      type: 'unique',
      name: 'uq_payload_fields_project_path',
    });

    await queryInterface.addIndex('payload_fields', {
      fields: ['project_id'],
      name: 'idx_payload_fields_project_id',
    });
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.dropTable('payload_fields');
  },
};
