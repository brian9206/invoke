'use strict';

// pg_notify triggers for execution cache invalidation.
// Sequelize has no abstraction for triggers/functions — raw SQL only.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION notify_execution_cache_change()
      RETURNS TRIGGER AS $$
      DECLARE
        payload jsonb;
      BEGIN
        payload := json_build_object('table', TG_TABLE_NAME, 'action', TG_OP);

        IF TG_TABLE_NAME = 'function_environment_variables' THEN
          payload := payload || json_build_object(
            'function_id', COALESCE(NEW.function_id, OLD.function_id)
          );
        ELSIF TG_TABLE_NAME = 'project_network_policies' THEN
          payload := payload || json_build_object(
            'project_id', COALESCE(NEW.project_id, OLD.project_id)
          );
        END IF;

        PERFORM pg_notify('execution_cache_invalidated', payload::text);
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trig_notify_exec_env_vars ON function_environment_variables;
      CREATE TRIGGER trig_notify_exec_env_vars
        AFTER INSERT OR UPDATE OR DELETE ON function_environment_variables
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();

      DROP TRIGGER IF EXISTS trig_notify_exec_project_policies ON project_network_policies;
      CREATE TRIGGER trig_notify_exec_project_policies
        AFTER INSERT OR UPDATE OR DELETE ON project_network_policies
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();

      DROP TRIGGER IF EXISTS trig_notify_exec_global_policies ON global_network_policies;
      CREATE TRIGGER trig_notify_exec_global_policies
        AFTER INSERT OR UPDATE OR DELETE ON global_network_policies
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trig_notify_exec_global_policies ON global_network_policies;
      DROP TRIGGER IF EXISTS trig_notify_exec_project_policies ON project_network_policies;
      DROP TRIGGER IF EXISTS trig_notify_exec_env_vars ON function_environment_variables;
      DROP FUNCTION IF EXISTS notify_execution_cache_change();
    `);
  },
};
