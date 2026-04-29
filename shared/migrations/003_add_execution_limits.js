'use strict'

module.exports = {
  async up({ context: { queryInterface } }) {
    // ── 1. Add new columns to functions table ─────────────────────────────────
    await queryInterface.addColumn('functions', 'custom_timeout_enabled', {
      type: 'BOOLEAN',
      allowNull: false,
      defaultValue: false
    })
    await queryInterface.addColumn('functions', 'custom_timeout_seconds', {
      type: 'INTEGER',
      allowNull: true,
      defaultValue: null
    })
    await queryInterface.addColumn('functions', 'custom_memory_enabled', {
      type: 'BOOLEAN',
      allowNull: false,
      defaultValue: false
    })
    await queryInterface.addColumn('functions', 'custom_memory_mb', {
      type: 'INTEGER',
      allowNull: true,
      defaultValue: null
    })

    // ── 2. Insert global execution settings ───────────────────────────────────
    const now = new Date()
    await queryInterface.bulkInsert('global_settings', [
      {
        setting_key: 'execution_default_timeout_seconds',
        setting_value: '30',
        description: 'Default function execution timeout in seconds (used when the function has no custom timeout)',
        updated_at: now
      },
      {
        setting_key: 'execution_max_timeout_seconds',
        setting_value: '60',
        description: 'Maximum allowed function execution timeout in seconds',
        updated_at: now
      },
      {
        setting_key: 'execution_default_memory_mb',
        setting_value: '256',
        description: 'Default isolate memory limit in MB (must be a multiple of 256)',
        updated_at: now
      },
      {
        setting_key: 'execution_max_memory_mb',
        setting_value: '1024',
        description: 'Maximum allowed isolate memory limit in MB (must be a multiple of 256)',
        updated_at: now
      }
    ])

    // ── 3. PL/pgSQL trigger to NOTIFY on execution setting changes ─────────────
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION notify_execution_settings_change()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.setting_key LIKE 'execution_%' THEN
          PERFORM pg_notify('execution_settings_invalidated', '{}');
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trig_notify_execution_settings
      AFTER INSERT OR UPDATE ON global_settings
      FOR EACH ROW EXECUTE FUNCTION notify_execution_settings_change();
    `)
  },

  async down({ context: { queryInterface } }) {
    // Remove trigger and function
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trig_notify_execution_settings ON global_settings;')
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS notify_execution_settings_change();')

    // Remove global settings rows
    await queryInterface.bulkDelete('global_settings', {
      setting_key: [
        'execution_default_timeout_seconds',
        'execution_max_timeout_seconds',
        'execution_default_memory_mb',
        'execution_max_memory_mb'
      ]
    })

    // Remove columns from functions table
    await queryInterface.removeColumn('functions', 'custom_memory_mb')
    await queryInterface.removeColumn('functions', 'custom_memory_enabled')
    await queryInterface.removeColumn('functions', 'custom_timeout_seconds')
    await queryInterface.removeColumn('functions', 'custom_timeout_enabled')
  }
}
