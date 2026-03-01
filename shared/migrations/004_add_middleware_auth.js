'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Extend auth method type check to include 'middleware'
    await queryInterface.sequelize.query(`
      ALTER TABLE api_gateway_auth_methods
        DROP CONSTRAINT IF EXISTS api_gateway_auth_methods_type_check;

      ALTER TABLE api_gateway_auth_methods
        ADD CONSTRAINT api_gateway_auth_methods_type_check
        CHECK (type IN ('basic_auth', 'bearer_jwt', 'api_key', 'middleware'));
    `);

    // Add auth_logic to routes
    await queryInterface.addColumn('api_gateway_routes', 'auth_logic', {
      type: Sequelize.STRING(3),
      allowNull: false,
      defaultValue: 'or',
    });
    await queryInterface.addConstraint('api_gateway_routes', {
      fields: ['auth_logic'],
      type: 'check',
      where: { auth_logic: ['or', 'and'] },
      name: 'api_gateway_routes_auth_logic_check',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('api_gateway_routes', 'api_gateway_routes_auth_logic_check');
    await queryInterface.removeColumn('api_gateway_routes', 'auth_logic');
    await queryInterface.sequelize.query(`
      ALTER TABLE api_gateway_auth_methods
        DROP CONSTRAINT IF EXISTS api_gateway_auth_methods_type_check;

      ALTER TABLE api_gateway_auth_methods
        ADD CONSTRAINT api_gateway_auth_methods_type_check
        CHECK (type IN ('basic_auth', 'bearer_jwt', 'api_key'));
    `);
  },
};
