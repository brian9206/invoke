'use strict'

const { Sequelize } = require('sequelize')

module.exports = {
  async up({ context: { queryInterface, Sequelize } }) {
    // ── project_environment_variables ─────────────────────────────────────
    await queryInterface.createTable('project_environment_variables', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE'
      },
      variable_name: { type: Sequelize.STRING(255), allowNull: false },
      variable_value: { type: Sequelize.TEXT, allowNull: false },
      description: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
    })

    await queryInterface.addConstraint('project_environment_variables', {
      fields: ['project_id', 'variable_name'],
      type: 'unique',
      name: 'uq_project_env_var'
    })

    await queryInterface.addIndex('project_environment_variables', ['project_id'])

    // updated_at trigger (reuses the existing update_updated_at_column function)
    await queryInterface.sequelize.query(`
      CREATE TRIGGER update_project_env_vars_updated_at
        BEFORE UPDATE ON project_environment_variables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `)

    // Extend notify_execution_cache_change to include project_environment_variables
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION notify_execution_cache_change()
      RETURNS TRIGGER AS $$
      DECLARE
        payload jsonb;
      BEGIN
        payload := jsonb_build_object('table', TG_TABLE_NAME, 'action', TG_OP);
        IF TG_TABLE_NAME = 'function_environment_variables' THEN
          payload := payload || jsonb_build_object('function_id', COALESCE(NEW.function_id, OLD.function_id));
        ELSIF TG_TABLE_NAME = 'project_environment_variables' THEN
          payload := payload || jsonb_build_object('project_id', COALESCE(NEW.project_id, OLD.project_id));
        ELSIF TG_TABLE_NAME = 'project_network_policies' THEN
          payload := payload || jsonb_build_object('project_id', COALESCE(NEW.project_id, OLD.project_id));
        END IF;
        PERFORM pg_notify('execution_cache_invalidated', payload::text);
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trig_notify_exec_project_env_vars
        AFTER INSERT OR UPDATE OR DELETE ON project_environment_variables
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();
    `)
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trig_notify_exec_project_env_vars ON project_environment_variables;
      DROP TRIGGER IF EXISTS update_project_env_vars_updated_at ON project_environment_variables;
    `)

    // Restore notify_execution_cache_change without the project_environment_variables branch
    await queryInterface.sequelize.query(`
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
    `)

    await queryInterface.dropTable('project_environment_variables')
  }
}
