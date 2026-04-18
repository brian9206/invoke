'use strict';

// Consolidated replacement for the former 007-009 execution-related migrations.

module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.bulkDelete('global_network_policies', {
      target_value: {
        [queryInterface.sequelize.Op.like]: '%:%',
      },
    });

    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS notify_project_network_policy_change();

      CREATE OR REPLACE FUNCTION notify_execution_cache_change()
      RETURNS TRIGGER AS $$
      DECLARE
        payload jsonb;
      BEGIN
        payload := jsonb_build_object('table', TG_TABLE_NAME, 'action', TG_OP);

        IF TG_TABLE_NAME = 'function_environment_variables' THEN
          payload := payload || jsonb_build_object('function_id', COALESCE(NEW.function_id, OLD.function_id));
        ELSIF TG_TABLE_NAME = 'functions' THEN
          payload := payload || jsonb_build_object('function_id', COALESCE(NEW.id, OLD.id));
        ELSIF TG_TABLE_NAME = 'function_versions' THEN
          payload := payload || jsonb_build_object('function_id', COALESCE(NEW.function_id, OLD.function_id));
        END IF;

        PERFORM pg_notify('execution_cache_invalidated', payload::text);
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

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

      DROP TRIGGER IF EXISTS trig_notify_exec_function_versions ON function_versions;
      CREATE TRIGGER trig_notify_exec_function_versions
        AFTER INSERT OR UPDATE OR DELETE ON function_versions
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();
    `);

    await queryInterface.dropTable('project_network_policies');
  },

  async down({ context: { queryInterface, Sequelize } }) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trig_notify_exec_function_versions ON function_versions;
      DROP TRIGGER IF EXISTS trig_notify_exec_functions ON functions;

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

    await queryInterface.createTable('project_network_policies', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      action: { type: Sequelize.STRING(10), allowNull: false },
      target_type: { type: Sequelize.STRING(10), allowNull: false },
      target_value: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.STRING(255) },
      priority: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addConstraint('project_network_policies', {
      fields: ['action'],
      type: 'check',
      where: { action: ['allow', 'deny'] },
      name: 'chk_project_network_policies_action',
    });

    await queryInterface.addConstraint('project_network_policies', {
      fields: ['target_type'],
      type: 'check',
      where: { target_type: ['ip', 'cidr', 'domain'] },
      name: 'chk_project_network_policies_target_type',
    });

    await queryInterface.addIndex('project_network_policies', ['project_id'], {
      name: 'idx_project_network_policies_project_id',
    });

    await queryInterface.addIndex('project_network_policies', ['project_id', 'priority'], {
      name: 'idx_project_network_policies_priority',
    });

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION notify_project_network_policy_change()
      RETURNS trigger AS $$
      BEGIN
        PERFORM pg_notify(
          'execution_cache_invalidate',
          json_build_object(
            'table', 'project_network_policies',
            'project_id', COALESCE(NEW.project_id, OLD.project_id)
          )::text
        );
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS notify_project_network_policy_change ON project_network_policies;
      CREATE TRIGGER notify_project_network_policy_change
        AFTER INSERT OR UPDATE OR DELETE ON project_network_policies
        FOR EACH ROW EXECUTE FUNCTION notify_project_network_policy_change();

      DROP TRIGGER IF EXISTS trig_notify_exec_project_policies ON project_network_policies;
      CREATE TRIGGER trig_notify_exec_project_policies
        AFTER INSERT OR UPDATE OR DELETE ON project_network_policies
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();
    `);
  },
};
