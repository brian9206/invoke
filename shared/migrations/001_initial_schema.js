'use strict';

/** @type {import('umzug').MigrationFn} */
module.exports = {
  async up({ context: { queryInterface, Sequelize } }) {
    // ── users ─────────────────────────────────────────────────────────────
    await queryInterface.createTable('users', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      is_admin: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      last_login: { type: Sequelize.DATE },
    });

    // ── projects ──────────────────────────────────────────────────────────
    await queryInterface.createTable('projects', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT },
      created_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      kv_storage_limit_bytes: { type: Sequelize.BIGINT, defaultValue: 1073741824 },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });

    // ── project_memberships ───────────────────────────────────────────────
    await queryInterface.createTable('project_memberships', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      project_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' }, onDelete: 'CASCADE',
      },
      role: { type: Sequelize.STRING(20), allowNull: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      created_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
    });
    await queryInterface.addConstraint('project_memberships', {
      fields: ['project_id', 'user_id'], type: 'unique', name: 'uq_membership_project_user',
    });
    await queryInterface.addConstraint('project_memberships', {
      fields: ['role'], type: 'check',
      where: { role: ['owner', 'developer'] },
    });

    // ── functions (without active_version_id FK — added after function_versions) ──
    await queryInterface.createTable('functions', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT },
      project_id: { type: Sequelize.UUID, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
      deployed_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
      requires_api_key: { type: Sequelize.BOOLEAN, defaultValue: false },
      api_key: { type: Sequelize.STRING(255) },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      last_executed: { type: Sequelize.DATE },
      execution_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      active_version_id: { type: Sequelize.UUID }, // FK added below after function_versions
      retention_type: { type: Sequelize.STRING(10) },
      retention_value: { type: Sequelize.INTEGER },
      retention_enabled: { type: Sequelize.BOOLEAN, defaultValue: false },
      schedule_enabled: { type: Sequelize.BOOLEAN, defaultValue: false },
      schedule_cron: { type: Sequelize.STRING(100) },
      next_execution: { type: Sequelize.DATE },
      last_scheduled_execution: { type: Sequelize.DATE },
    });

    // ── function_versions ─────────────────────────────────────────────────
    await queryInterface.createTable('function_versions', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      function_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'functions', key: 'id' }, onDelete: 'CASCADE',
      },
      version: { type: Sequelize.INTEGER, allowNull: false },
      file_size: { type: Sequelize.BIGINT, allowNull: false },
      package_path: { type: Sequelize.STRING(500) },
      package_hash: { type: Sequelize.STRING(64), allowNull: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      created_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
    });
    await queryInterface.addConstraint('function_versions', {
      fields: ['function_id', 'version'], type: 'unique', name: 'uq_function_version',
    });

    // Now add the circular FK from functions → function_versions
    await queryInterface.addConstraint('functions', {
      fields: ['active_version_id'], type: 'foreign key',
      name: 'fk_functions_active_version',
      references: { table: 'function_versions', field: 'id' },
    });

    // ── api_keys ──────────────────────────────────────────────────────────
    await queryInterface.createTable('api_keys', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      key_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      created_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      last_used: { type: Sequelize.DATE },
      usage_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    });

    // ── execution_logs ────────────────────────────────────────────────────
    await queryInterface.createTable('execution_logs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      function_id: { type: Sequelize.UUID, references: { model: 'functions', key: 'id' }, onDelete: 'CASCADE' },
      status_code: { type: Sequelize.INTEGER },
      execution_time_ms: { type: Sequelize.INTEGER },
      request_size: { type: Sequelize.BIGINT },
      response_size: { type: Sequelize.BIGINT },
      request_headers: { type: Sequelize.JSONB },
      response_headers: { type: Sequelize.JSONB },
      request_body: { type: Sequelize.TEXT },
      response_body: { type: Sequelize.TEXT },
      request_method: { type: Sequelize.STRING(10) },
      request_url: { type: Sequelize.TEXT },
      console_logs: { type: Sequelize.JSONB },
      error_message: { type: Sequelize.TEXT },
      client_ip: { type: 'INET' },
      user_agent: { type: Sequelize.TEXT },
      api_key_used: { type: Sequelize.BOOLEAN, defaultValue: false },
      executed_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });

    // ── function_environment_variables ────────────────────────────────────
    await queryInterface.createTable('function_environment_variables', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      function_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'functions', key: 'id' }, onDelete: 'CASCADE',
      },
      variable_name: { type: Sequelize.STRING(255), allowNull: false },
      variable_value: { type: Sequelize.TEXT, allowNull: false },
      description: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addConstraint('function_environment_variables', {
      fields: ['function_id', 'variable_name'], type: 'unique', name: 'uq_env_var',
    });

    // ── global_settings ───────────────────────────────────────────────────
    await queryInterface.createTable('global_settings', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      setting_key: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      setting_value: { type: Sequelize.TEXT, allowNull: false },
      description: { type: Sequelize.TEXT },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });

    // ── project_network_policies (migration 002) ──────────────────────────
    await queryInterface.createTable('project_network_policies', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      project_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
      },
      action: { type: Sequelize.STRING(10), allowNull: false },
      target_type: { type: Sequelize.STRING(10), allowNull: false },
      target_value: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.STRING(255) },
      priority: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addConstraint('project_network_policies', {
      fields: ['action'], type: 'check', where: { action: ['allow', 'deny'] },
      name: 'chk_project_network_policies_action',
    });
    await queryInterface.addConstraint('project_network_policies', {
      fields: ['target_type'], type: 'check', where: { target_type: ['ip', 'cidr', 'domain'] },
      name: 'chk_project_network_policies_target_type',
    });

    // ── global_network_policies (migration 002) ───────────────────────────
    await queryInterface.createTable('global_network_policies', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      action: { type: Sequelize.STRING(10), allowNull: false },
      target_type: { type: Sequelize.STRING(10), allowNull: false },
      target_value: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.STRING(255) },
      priority: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addConstraint('global_network_policies', {
      fields: ['action'], type: 'check', where: { action: ['allow', 'deny'] },
      name: 'chk_global_network_policies_action',
    });
    await queryInterface.addConstraint('global_network_policies', {
      fields: ['target_type'], type: 'check', where: { target_type: ['ip', 'cidr', 'domain'] },
      name: 'chk_global_network_policies_target_type',
    });

    // ── api_gateway_configs (migration 003) ───────────────────────────────
    await queryInterface.createTable('api_gateway_configs', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      project_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
      },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      custom_domain: { type: Sequelize.STRING(255) },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addConstraint('api_gateway_configs', {
      fields: ['project_id'], type: 'unique', name: 'uq_gateway_project',
    });
    await queryInterface.addConstraint('api_gateway_configs', {
      fields: ['custom_domain'], type: 'unique', name: 'uq_gateway_custom_domain',
    });

    // ── api_gateway_routes (migrations 003 + 004) ─────────────────────────
    // auth_logic ('or'|'and') incorporated from migration 004
    await queryInterface.createTable('api_gateway_routes', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      gateway_config_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'api_gateway_configs', key: 'id' }, onDelete: 'CASCADE',
      },
      route_path: { type: Sequelize.STRING(500), allowNull: false },
      function_id: {
        type: Sequelize.UUID,
        references: { model: 'functions', key: 'id' }, onDelete: 'SET NULL',
      },
      allowed_methods: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: false, defaultValue: ['GET', 'POST'] },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      auth_logic: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'or' },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addConstraint('api_gateway_routes', {
      fields: ['gateway_config_id', 'route_path'], type: 'unique', name: 'uq_gateway_route_path',
    });
    await queryInterface.addConstraint('api_gateway_routes', {
      fields: ['auth_logic'], type: 'check', where: { auth_logic: ['or', 'and'] },
      name: 'chk_gateway_routes_auth_logic',
    });

    // ── api_gateway_route_settings (migration 003) ────────────────────────
    await queryInterface.createTable('api_gateway_route_settings', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      route_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'api_gateway_routes', key: 'id' }, onDelete: 'CASCADE',
      },
      cors_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      cors_allowed_origins: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: false, defaultValue: [] },
      cors_allowed_headers: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: false, defaultValue: [] },
      cors_expose_headers: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: false, defaultValue: [] },
      cors_max_age: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 86400 },
      cors_allow_credentials: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addConstraint('api_gateway_route_settings', {
      fields: ['route_id'], type: 'unique', name: 'uq_gateway_route_settings_route_id',
    });

    // ── api_gateway_auth_methods (migrations 003 + 004) ───────────────────
    // 'middleware' type incorporated from migration 004
    await queryInterface.createTable('api_gateway_auth_methods', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      gateway_config_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'api_gateway_configs', key: 'id' }, onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      type: { type: Sequelize.STRING(20), allowNull: false },
      config: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addConstraint('api_gateway_auth_methods', {
      fields: ['type'], type: 'check',
      where: { type: ['basic_auth', 'bearer_jwt', 'api_key', 'middleware'] },
      name: 'api_gateway_auth_methods_type_check',
    });
    await queryInterface.addConstraint('api_gateway_auth_methods', {
      fields: ['gateway_config_id', 'name'], type: 'unique', name: 'uq_gateway_auth_method_name',
    });

    // ── api_gateway_route_auth_methods (migrations 003 + 005) ────────────
    // sort_order incorporated from migration 005; composite PK on (route_id, auth_method_id)
    await queryInterface.createTable('api_gateway_route_auth_methods', {
      route_id: {
        type: Sequelize.UUID, primaryKey: true, allowNull: false,
        references: { model: 'api_gateway_routes', key: 'id' }, onDelete: 'CASCADE',
      },
      auth_method_id: {
        type: Sequelize.UUID, primaryKey: true, allowNull: false,
        references: { model: 'api_gateway_auth_methods', key: 'id' }, onDelete: 'CASCADE',
      },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    });

    // ── Indexes ───────────────────────────────────────────────────────────
    await queryInterface.addIndex('functions', ['name']);
    await queryInterface.addIndex('functions', ['is_active']);
    await queryInterface.addIndex('functions', ['active_version_id']);
    await queryInterface.addIndex('functions', ['project_id']);
    await queryInterface.addIndex('function_versions', ['function_id']);
    await queryInterface.addIndex('function_versions', ['function_id', 'version']);
    await queryInterface.addIndex('api_keys', ['key_hash']);
    await queryInterface.addIndex('api_keys', ['is_active']);
    await queryInterface.addIndex('execution_logs', ['function_id']);
    await queryInterface.addIndex('execution_logs', ['executed_at']);
    await queryInterface.addIndex('execution_logs', ['status_code']);
    await queryInterface.addIndex('execution_logs', ['execution_time_ms']);
    await queryInterface.addIndex('function_environment_variables', ['function_id']);
    await queryInterface.addIndex('function_environment_variables', ['function_id', 'variable_name']);
    await queryInterface.addIndex('projects', ['name']);
    await queryInterface.addIndex('projects', ['is_active']);
    await queryInterface.addIndex('project_memberships', ['project_id']);
    await queryInterface.addIndex('project_memberships', ['user_id']);
    await queryInterface.addIndex('project_memberships', ['role']);
    await queryInterface.addIndex('functions', {
      fields: ['schedule_enabled', 'next_execution'],
      name: 'idx_functions_schedule',
      where: { schedule_enabled: true },
    });
    await queryInterface.addIndex('project_network_policies', ['project_id'],
      { name: 'idx_project_network_policies_project_id' });
    await queryInterface.addIndex('project_network_policies', ['project_id', 'priority'],
      { name: 'idx_project_network_policies_priority' });
    await queryInterface.addIndex('global_network_policies', ['priority'],
      { name: 'idx_global_network_policies_priority' });
    await queryInterface.addIndex('api_gateway_configs', ['project_id'],
      { name: 'idx_gateway_configs_project_id' });
    await queryInterface.addIndex('api_gateway_configs', ['custom_domain'],
      { name: 'idx_gateway_configs_custom_domain' });
    await queryInterface.addIndex('api_gateway_routes', ['gateway_config_id'],
      { name: 'idx_gateway_routes_gateway_config_id' });
    await queryInterface.addIndex('api_gateway_routes', ['function_id'],
      { name: 'idx_gateway_routes_function_id' });
    await queryInterface.addIndex('api_gateway_routes', ['gateway_config_id', 'sort_order'],
      { name: 'idx_gateway_routes_sort_order' });
    await queryInterface.addIndex('api_gateway_route_settings', ['route_id'],
      { name: 'idx_gateway_route_settings_route_id' });
    await queryInterface.addIndex('api_gateway_auth_methods', ['gateway_config_id'],
      { name: 'idx_gateway_auth_methods_config_id' });
    await queryInterface.addIndex('api_gateway_route_auth_methods', ['route_id'],
      { name: 'idx_gateway_route_auth_methods_route_id' });
    await queryInterface.addIndex('api_gateway_route_auth_methods', ['auth_method_id'],
      { name: 'idx_gateway_route_auth_methods_auth_id' });
    await queryInterface.addIndex('api_gateway_route_auth_methods', ['route_id', 'sort_order'],
      { name: 'idx_gateway_route_auth_methods_sort_order' });

    // ── PL/pgSQL functions + triggers (raw SQL — no queryInterface equivalent) ──
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_projects_updated_at
        BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_functions_updated_at
        BEFORE UPDATE ON functions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_function_env_vars_updated_at
        BEFORE UPDATE ON function_environment_variables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_api_gateway_configs_updated_at
        BEFORE UPDATE ON api_gateway_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_api_gateway_routes_updated_at
        BEFORE UPDATE ON api_gateway_routes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_api_gateway_route_settings_updated_at
        BEFORE UPDATE ON api_gateway_route_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER update_api_gateway_auth_methods_updated_at
        BEFORE UPDATE ON api_gateway_auth_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      -- Gateway cache invalidation via pg_notify (migration 003)
      CREATE OR REPLACE FUNCTION notify_gateway_change()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('gateway_invalidated', json_build_object(
          'table', TG_TABLE_NAME, 'action', TG_OP
        )::text);
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trig_notify_gateway_configs
        AFTER INSERT OR UPDATE OR DELETE ON api_gateway_configs
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();
      CREATE TRIGGER trig_notify_gateway_routes
        AFTER INSERT OR UPDATE OR DELETE ON api_gateway_routes
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();
      CREATE TRIGGER trig_notify_gateway_route_settings
        AFTER INSERT OR UPDATE OR DELETE ON api_gateway_route_settings
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();
      CREATE TRIGGER trig_notify_gateway_auth_methods
        AFTER INSERT OR UPDATE OR DELETE ON api_gateway_auth_methods
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();
      CREATE TRIGGER trig_notify_gateway_route_auth_methods
        AFTER INSERT OR UPDATE OR DELETE ON api_gateway_route_auth_methods
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();

      CREATE OR REPLACE FUNCTION notify_gateway_domain_change()
      RETURNS TRIGGER AS $$
      BEGIN
        IF (TG_OP = 'DELETE' AND OLD.setting_key = 'api_gateway_domain') OR
           (TG_OP != 'DELETE' AND NEW.setting_key = 'api_gateway_domain') THEN
          PERFORM pg_notify('gateway_invalidated', json_build_object(
            'table', 'global_settings', 'action', TG_OP
          )::text);
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trig_notify_gateway_domain
        AFTER INSERT OR UPDATE OR DELETE ON global_settings
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_domain_change();

      -- Execution cache invalidation via pg_notify (migration 006)
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

      CREATE TRIGGER trig_notify_exec_env_vars
        AFTER INSERT OR UPDATE OR DELETE ON function_environment_variables
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();
      CREATE TRIGGER trig_notify_exec_project_policies
        AFTER INSERT OR UPDATE OR DELETE ON project_network_policies
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();
      CREATE TRIGGER trig_notify_exec_global_policies
        AFTER INSERT OR UPDATE OR DELETE ON global_network_policies
        FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();
    `);

    // ── Seed data ─────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('global_settings', [
      { setting_key: 'log_retention_type',    setting_value: 'time',                          description: 'Default log retention type: time, count, or none' },
      { setting_key: 'log_retention_value',   setting_value: '7',                             description: 'Default log retention value (7 days or 1000 count)' },
      { setting_key: 'log_retention_enabled', setting_value: 'true',                          description: 'Whether log retention cleanup is enabled globally' },
      { setting_key: 'function_base_url',     setting_value: 'http://localhost:3001/invoke', description: 'Base URL for function invocation endpoints' },
      { setting_key: 'kv_storage_limit_bytes',setting_value: '1073741824',                   description: 'Maximum storage size for project KV store in bytes (default 1GB)' },
      { setting_key: 'api_gateway_domain',    setting_value: '',                              description: 'Default API Gateway domain (e.g., api.example.com). Used for the default URL pattern: <domain>/<project-slug>/<route>' },
    ]);

    await queryInterface.bulkInsert('projects', [
      { id: '00000000-0000-0000-0000-000000000000', name: 'Default Project', description: 'Your first default project', created_by: null, created_at: new Date(), updated_at: new Date() },
    ]);

    await queryInterface.bulkInsert('global_network_policies', [
      { action: 'deny', target_type: 'cidr', target_value: '10.0.0.0/8',     description: 'Block private network (RFC1918)', priority: 1, created_at: new Date() },
      { action: 'deny', target_type: 'cidr', target_value: '172.16.0.0/12',  description: 'Block private network (RFC1918)', priority: 2, created_at: new Date() },
      { action: 'deny', target_type: 'cidr', target_value: '192.168.0.0/16', description: 'Block private network (RFC1918)', priority: 3, created_at: new Date() },
      { action: 'deny', target_type: 'cidr', target_value: '127.0.0.0/8',    description: 'Block loopback',                 priority: 4, created_at: new Date() },
      { action: 'deny', target_type: 'cidr', target_value: 'fc00::/7',       description: 'Block IPv6 ULA (RFC4193)',        priority: 5, created_at: new Date() },
      { action: 'deny', target_type: 'cidr', target_value: 'fe80::/10',      description: 'Block IPv6 link-local',           priority: 6, created_at: new Date() },
      { action: 'deny', target_type: 'cidr', target_value: '::1/128',        description: 'Block IPv6 loopback',             priority: 7, created_at: new Date() },
    ]);

    await queryInterface.bulkInsert('project_network_policies', [
      { project_id: '00000000-0000-0000-0000-000000000000', action: 'allow', target_type: 'cidr', target_value: '0.0.0.0/0', description: 'Allow all public IPv4', priority: 1, created_at: new Date() },
      { project_id: '00000000-0000-0000-0000-000000000000', action: 'allow', target_type: 'cidr', target_value: '::/0',       description: 'Allow all public IPv6', priority: 2, created_at: new Date() },
    ]);
  },

  async down({ context: { queryInterface } }) {
    // Drop all triggers and functions first
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trig_notify_exec_global_policies ON global_network_policies;
      DROP TRIGGER IF EXISTS trig_notify_exec_project_policies ON project_network_policies;
      DROP TRIGGER IF EXISTS trig_notify_exec_env_vars ON function_environment_variables;
      DROP FUNCTION IF EXISTS notify_execution_cache_change();

      DROP TRIGGER IF EXISTS trig_notify_gateway_domain ON global_settings;
      DROP FUNCTION IF EXISTS notify_gateway_domain_change();
      DROP TRIGGER IF EXISTS trig_notify_gateway_route_auth_methods ON api_gateway_route_auth_methods;
      DROP TRIGGER IF EXISTS trig_notify_gateway_auth_methods ON api_gateway_auth_methods;
      DROP TRIGGER IF EXISTS trig_notify_gateway_route_settings ON api_gateway_route_settings;
      DROP TRIGGER IF EXISTS trig_notify_gateway_routes ON api_gateway_routes;
      DROP TRIGGER IF EXISTS trig_notify_gateway_configs ON api_gateway_configs;
      DROP FUNCTION IF EXISTS notify_gateway_change();

      DROP TRIGGER IF EXISTS update_api_gateway_auth_methods_updated_at ON api_gateway_auth_methods;
      DROP TRIGGER IF EXISTS update_api_gateway_route_settings_updated_at ON api_gateway_route_settings;
      DROP TRIGGER IF EXISTS update_api_gateway_routes_updated_at ON api_gateway_routes;
      DROP TRIGGER IF EXISTS update_api_gateway_configs_updated_at ON api_gateway_configs;
      DROP TRIGGER IF EXISTS update_function_env_vars_updated_at ON function_environment_variables;
      DROP TRIGGER IF EXISTS update_functions_updated_at ON functions;
      DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      DROP FUNCTION IF EXISTS update_updated_at_column();
    `);

    await queryInterface.removeIndex('functions', 'idx_functions_schedule');
    await queryInterface.removeConstraint('functions', 'fk_functions_active_version');

    // Drop in reverse dependency order
    await queryInterface.dropTable('api_gateway_route_auth_methods');
    await queryInterface.dropTable('api_gateway_auth_methods');
    await queryInterface.dropTable('api_gateway_route_settings');
    await queryInterface.dropTable('api_gateway_routes');
    await queryInterface.dropTable('api_gateway_configs');
    await queryInterface.dropTable('global_network_policies');
    await queryInterface.dropTable('project_network_policies');
    await queryInterface.dropTable('global_settings');
    await queryInterface.dropTable('function_environment_variables');
    await queryInterface.dropTable('execution_logs');
    await queryInterface.dropTable('api_keys');
    await queryInterface.dropTable('function_versions');
    await queryInterface.dropTable('functions');
    await queryInterface.dropTable('project_memberships');
    await queryInterface.dropTable('projects');
    await queryInterface.dropTable('users');
  },
};
