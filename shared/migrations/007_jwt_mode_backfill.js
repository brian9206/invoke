'use strict';

// Backfill jwtMode for existing bearer_jwt auth methods.
// No queryInterface equivalent — raw SQL data migration.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE api_gateway_auth_methods
      SET config = config || '{"jwtMode": "fixed_secret"}'::jsonb
      WHERE type = 'bearer_jwt'
        AND config->>'jwtMode' IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE api_gateway_auth_methods
      SET config = config - 'jwtMode'
      WHERE type = 'bearer_jwt'
        AND config->>'jwtMode' = 'fixed_secret';
    `);
  },
};
