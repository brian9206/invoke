'use strict'

module.exports = {
  async up({ context: { queryInterface } }) {
    const [[{ setting_value: function_base_url }]] = await queryInterface.sequelize.query(
      "SELECT setting_value FROM global_settings WHERE setting_key = 'function_base_url'"
    )

    if (function_base_url.endsWith('/invoke') || function_base_url.endsWith('/invoke/')) {
      await queryInterface.bulkUpdate(
        'global_settings',
        {
          setting_value: function_base_url.replace(/\/invoke\/?$/, '')
        },
        {
          setting_key: 'function_base_url'
        }
      )
    }
  },

  async down({ context: { queryInterface } }) {
    // do nothing - we don't want to revert the URL back to the old value if we roll back this migration
  }
}
