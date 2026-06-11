'use strict'

module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.addColumn('api_gateway_routes', 'redirect_trailing_slash', {
      type: 'BOOLEAN',
      allowNull: false,
      defaultValue: true
    })
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.removeColumn('api_gateway_routes', 'redirect_trailing_slash')
  }
}
