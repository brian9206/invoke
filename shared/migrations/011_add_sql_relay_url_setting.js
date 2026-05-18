'use strict'

module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.bulkInsert('global_settings', [
      {
        setting_key: 'sql_relay_url',
        setting_value: 'ws://localhost:3010/sql/relay',
        description: 'WebSocket URL the CLI uses to connect to the SQL relay service',
        updated_at: new Date()
      }
    ])
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.bulkDelete('global_settings', {
      setting_key: 'sql_relay_url'
    })
  }
}
