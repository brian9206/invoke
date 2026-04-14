'use strict';

// Migration 008: Add NOTIFY triggers on `functions` and `function_versions`
// so that invoke-execution's in-memory function-info cache is invalidated
// immediately when a new version is deployed (active_version_id changes) or
// when a function row itself is updated/deleted.
//
// Without these triggers, the 30-second TTL in execution.ts means a freshly
// deployed version can be silently ignored for up to 30 seconds — the old
// extracted package is served from cache instead.

module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.sequelize.query(`
      -- Extend the existing notify_execution_cache_change() function to also
      -- carry function_id for functions and function_versions rows.
      CREATE OR REPLACE FUNCTION notify_execution_cache_change()
      RETURNS TRIGGER AS $$
      DECLARE
        payload jsonb;
      BEGIN
        payload := jsonb_build_object('table', TG_TABLE_NAME, 'action', TG_OP);

        IF TG_TABLE_NAME = 'function_environment_variables' THEN
          payload := payload || jsonb_build_object('function_id', COALESCE(NEW.function_id, OLD.function_id));
        ELSIF TG_TABLE_NAME = 'project_network_policies' THEN
          payload := payload || jsonb_build_object('project_id', COALESCE(NEW.project_id, OLD.project_id));
        ELSIF TG_TABLE_NAME = 'functions' THEN
          payload := payload || jsonb_build_object('function_id', COALESCE(NEW.id, OLD.id));
        ELSIF TG_TABLE_NAME = 'function_versions' THEN
          payload := payload || jsonb_build_object('function_id', COALESCE(NEW.function_id, OLD.function_id));
        END IF;

        PERFORM pg_notify('execution_cache_invalidated', payload::text);
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

      -- Trigger on functions (catches active_version_id updates, soft-deletes, etc.)
      DROP TRIGGER IF EXISTS trig_notify_exec_functions ON functions;
      CREATE TRIGGER trig_notify_exec_functions
        AFTER INSERT OR UPDATE OR DELETE ON functions
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();

      -- Trigger on function_versions (catches new version inserts)
      DROP TRIGGER IF EXISTS trig_notify_exec_function_versions ON function_versions;
      CREATE TRIGGER trig_notify_exec_function_versions
        AFTER INSERT OR UPDATE OR DELETE ON function_versions
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();
    `);
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trig_notify_exec_functions ON functions;
      DROP TRIGGER IF EXISTS trig_notify_exec_function_versions ON function_versions;

      -- Restore the original function without the functions/function_versions branches
      CREATE OR REPLACE FUNCTION notify_execution_cache_change()
      RETURNS TRIGGER AS $$
      DECLARE
        payload jsonb;
      BEGIN
        payload := jsonb_build_object('table', TG_TABLE_NAME, 'action', TG_OP);
        IF TG_TABLE_NAME = 'function_environment_variables' THEN
          payload := payload || jsonb_build_object('function_id', COALESCE(NEW.function_id, OLD.function_id));
        ELSIF TG_TABLE_NAME = 'project_network_policies' THEN
          payload := payload || jsonb_build_object('project_id', COALESCE(NEW.project_id, OLD.project_id));
        END IF;
        PERFORM pg_notify('execution_cache_invalidated', payload::text);
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);
  },
};
