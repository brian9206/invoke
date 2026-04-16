'use strict';

// Migration 009: Narrow the trig_notify_exec_functions trigger so it only
// fires when cache-relevant columns change, not on every UPDATE.
//
// Migration 008 created the trigger as AFTER INSERT OR UPDATE OR DELETE,
// which means the fire-and-forget FunctionModel.update() in execution.ts
// (updating execution_count + last_executed after every invocation) fires
// pg_notify and causes invoke-execution to flush the function-info cache on
// every single request — defeating the purpose of the cache.
//
// The new trigger restricts UPDATE firing to columns that actually affect
// execution behaviour.

module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trig_notify_exec_functions ON functions;

      CREATE TRIGGER trig_notify_exec_functions
        AFTER INSERT
          OR UPDATE OF active_version_id, is_active, requires_api_key,
                        custom_timeout_enabled, custom_timeout_seconds,
                        custom_memory_enabled, custom_memory_mb,
                        group_id, sort_order
          OR DELETE
        ON functions
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();
    `);
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trig_notify_exec_functions ON functions;

      -- Restore the broad trigger from migration 008
      CREATE TRIGGER trig_notify_exec_functions
        AFTER INSERT OR UPDATE OR DELETE ON functions
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();
    `);
  },
};
