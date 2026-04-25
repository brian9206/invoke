'use strict';

module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.addColumn('function_builds', 'build_context', {
      type: 'JSONB',
      allowNull: true,
      defaultValue: null,
    });
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.removeColumn('function_builds', 'build_context');
  },
};
