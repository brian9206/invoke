'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('api_gateway_route_auth_methods', 'sort_order', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addIndex('api_gateway_route_auth_methods', ['route_id', 'sort_order'], {
      name: 'idx_gateway_route_auth_methods_sort_order',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'api_gateway_route_auth_methods',
      'idx_gateway_route_auth_methods_sort_order'
    );
    await queryInterface.removeColumn('api_gateway_route_auth_methods', 'sort_order');
  },
};
