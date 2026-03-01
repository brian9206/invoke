'use strict';

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface, Sequelize) {
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

    // Partial index: scheduled functions lookup
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_functions_schedule ON functions(schedule_enabled, next_execution)
        WHERE schedule_enabled = true;
    `);

    // updated_at trigger function + triggers (no queryInterface equivalent)
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

      CREATE TRIGGER update_projects_updated_at
        BEFORE UPDATE ON projects
        FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

      CREATE TRIGGER update_functions_updated_at
        BEFORE UPDATE ON functions
        FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

      CREATE TRIGGER update_function_env_vars_updated_at
        BEFORE UPDATE ON function_environment_variables
        FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    `);

    // Default global settings
    await queryInterface.sequelize.query(`
      INSERT INTO global_settings (setting_key, setting_value, description) VALUES
        ('log_retention_type',    'time',                              'Default log retention type: time, count, or none'),
        ('log_retention_value',   '7',                                 'Default log retention value (7 days or 1000 count)'),
        ('log_retention_enabled', 'true',                              'Whether log retention cleanup is enabled globally'),
        ('function_base_url',     'https://localhost:3001/invoke',     'Base URL for function invocation endpoints'),
        ('kv_storage_limit_bytes','1073741824',                        'Maximum storage size for project KV store in bytes (default 1GB)');
    `);

    // Default project
    await queryInterface.sequelize.query(`
      INSERT INTO projects (id, name, description, created_by, created_at) VALUES
        ('00000000-0000-0000-0000-000000000000', 'Default Project', 'Your first default project', NULL, NOW());
    `);
  },

  async down(queryInterface) {
    // Drop triggers and function first
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
      DROP TRIGGER IF EXISTS update_functions_updated_at ON functions;
      DROP TRIGGER IF EXISTS update_function_env_vars_updated_at ON function_environment_variables;
      DROP FUNCTION IF EXISTS update_updated_at_column();
    `);

    // Drop partial index manually (not tied to a table via removeIndex)
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_functions_schedule;');

    // Remove circular FK before dropping tables
    await queryInterface.removeConstraint('functions', 'fk_functions_active_version');

    // Drop in reverse dependency order
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
