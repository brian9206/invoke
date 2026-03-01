'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── projects: add slug column ─────────────────────────────────────────
    await queryInterface.addColumn('projects', 'slug', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    // Populate slug from existing names, make unique, add auto-set trigger
    await queryInterface.sequelize.query(`
      UPDATE projects
      SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
      WHERE slug IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);

      CREATE OR REPLACE FUNCTION set_project_slug()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.slug IS NULL OR NEW.slug = '' THEN
          NEW.slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trigger_set_project_slug
        BEFORE INSERT ON projects
        FOR EACH ROW EXECUTE FUNCTION set_project_slug();
    `);

    // ── api_gateway_configs ────────────────────────────────────────────────
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
    await queryInterface.addIndex('api_gateway_configs', ['project_id']);
    await queryInterface.addIndex('api_gateway_configs', ['custom_domain']);

    // ── api_gateway_routes ─────────────────────────────────────────────────
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
      allowed_methods: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: false,
        defaultValue: ['GET', 'POST'],
      },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addConstraint('api_gateway_routes', {
      fields: ['gateway_config_id', 'route_path'], type: 'unique', name: 'uq_gateway_route_path',
    });
    await queryInterface.addIndex('api_gateway_routes', ['gateway_config_id']);
    await queryInterface.addIndex('api_gateway_routes', ['function_id']);
    await queryInterface.addIndex('api_gateway_routes', ['gateway_config_id', 'sort_order']);

    // ── api_gateway_route_settings ─────────────────────────────────────────
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
    await queryInterface.addIndex('api_gateway_route_settings', ['route_id']);

    // ── api_gateway_auth_methods ───────────────────────────────────────────
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
      where: { type: ['basic_auth', 'bearer_jwt', 'api_key'] },
      name: 'api_gateway_auth_methods_type_check',
    });
    await queryInterface.addConstraint('api_gateway_auth_methods', {
      fields: ['gateway_config_id', 'name'], type: 'unique', name: 'uq_gateway_auth_method_name',
    });
    await queryInterface.addIndex('api_gateway_auth_methods', ['gateway_config_id']);

    // ── api_gateway_route_auth_methods (junction) ──────────────────────────
    await queryInterface.createTable('api_gateway_route_auth_methods', {
      route_id: {
        type: Sequelize.UUID, allowNull: false, primaryKey: true,
        references: { model: 'api_gateway_routes', key: 'id' }, onDelete: 'CASCADE',
      },
      auth_method_id: {
        type: Sequelize.UUID, allowNull: false, primaryKey: true,
        references: { model: 'api_gateway_auth_methods', key: 'id' }, onDelete: 'CASCADE',
      },
    });
    await queryInterface.addIndex('api_gateway_route_auth_methods', ['route_id']);
    await queryInterface.addIndex('api_gateway_route_auth_methods', ['auth_method_id']);

    // updated_at triggers for gateway tables
    await queryInterface.sequelize.query(`
      CREATE TRIGGER update_api_gateway_configs_updated_at
        BEFORE UPDATE ON api_gateway_configs
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_api_gateway_routes_updated_at
        BEFORE UPDATE ON api_gateway_routes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_api_gateway_route_settings_updated_at
        BEFORE UPDATE ON api_gateway_route_settings
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_api_gateway_auth_methods_updated_at
        BEFORE UPDATE ON api_gateway_auth_methods
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    // Default api_gateway_domain global setting
    await queryInterface.sequelize.query(`
      INSERT INTO global_settings (setting_key, setting_value, description)
      VALUES ('api_gateway_domain', '',
              'Default API Gateway domain (e.g., api.example.com). Used for the default URL pattern: <domain>/<project-slug>/<route>');
    `);

    // pg_notify triggers for gateway cache invalidation
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION notify_gateway_change()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('gateway_invalidated', json_build_object(
          'table', TG_TABLE_NAME,
          'action', TG_OP
        )::text);
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trig_notify_gateway_configs ON api_gateway_configs;
      CREATE TRIGGER trig_notify_gateway_configs
        AFTER INSERT OR UPDATE OR DELETE ON api_gateway_configs
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();

      DROP TRIGGER IF EXISTS trig_notify_gateway_routes ON api_gateway_routes;
      CREATE TRIGGER trig_notify_gateway_routes
        AFTER INSERT OR UPDATE OR DELETE ON api_gateway_routes
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();

      DROP TRIGGER IF EXISTS trig_notify_gateway_route_settings ON api_gateway_route_settings;
      CREATE TRIGGER trig_notify_gateway_route_settings
        AFTER INSERT OR UPDATE OR DELETE ON api_gateway_route_settings
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();

      DROP TRIGGER IF EXISTS trig_notify_gateway_auth_methods ON api_gateway_auth_methods;
      CREATE TRIGGER trig_notify_gateway_auth_methods
        AFTER INSERT OR UPDATE OR DELETE ON api_gateway_auth_methods
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();

      DROP TRIGGER IF EXISTS trig_notify_gateway_route_auth_methods ON api_gateway_route_auth_methods;
      CREATE TRIGGER trig_notify_gateway_route_auth_methods
        AFTER INSERT OR UPDATE OR DELETE ON api_gateway_route_auth_methods
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_change();

      CREATE OR REPLACE FUNCTION notify_gateway_domain_change()
      RETURNS TRIGGER AS $$
      BEGIN
        IF (TG_OP = 'DELETE' AND OLD.setting_key = 'api_gateway_domain') OR
           (TG_OP != 'DELETE' AND NEW.setting_key = 'api_gateway_domain') THEN
          PERFORM pg_notify('gateway_invalidated', json_build_object(
            'table', 'global_settings',
            'action', TG_OP
          )::text);
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trig_notify_gateway_domain ON global_settings;
      CREATE TRIGGER trig_notify_gateway_domain
        AFTER INSERT OR UPDATE OR DELETE ON global_settings
        FOR EACH ROW EXECUTE FUNCTION notify_gateway_domain_change();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trig_notify_gateway_domain ON global_settings;
      DROP TRIGGER IF EXISTS trig_notify_gateway_route_auth_methods ON api_gateway_route_auth_methods;
      DROP TRIGGER IF EXISTS trig_notify_gateway_auth_methods ON api_gateway_auth_methods;
      DROP TRIGGER IF EXISTS trig_notify_gateway_route_settings ON api_gateway_route_settings;
      DROP TRIGGER IF EXISTS trig_notify_gateway_routes ON api_gateway_routes;
      DROP TRIGGER IF EXISTS trig_notify_gateway_configs ON api_gateway_configs;
      DROP FUNCTION IF EXISTS notify_gateway_domain_change();
      DROP FUNCTION IF EXISTS notify_gateway_change();
      DROP TRIGGER IF EXISTS update_api_gateway_auth_methods_updated_at ON api_gateway_auth_methods;
      DROP TRIGGER IF EXISTS update_api_gateway_route_settings_updated_at ON api_gateway_route_settings;
      DROP TRIGGER IF EXISTS update_api_gateway_routes_updated_at ON api_gateway_routes;
      DROP TRIGGER IF EXISTS update_api_gateway_configs_updated_at ON api_gateway_configs;
      DROP TRIGGER IF EXISTS trigger_set_project_slug ON projects;
      DROP FUNCTION IF EXISTS set_project_slug();
    `);
    await queryInterface.sequelize.query(`DELETE FROM global_settings WHERE setting_key = 'api_gateway_domain';`);
    await queryInterface.dropTable('api_gateway_route_auth_methods');
    await queryInterface.dropTable('api_gateway_auth_methods');
    await queryInterface.dropTable('api_gateway_route_settings');
    await queryInterface.dropTable('api_gateway_routes');
    await queryInterface.dropTable('api_gateway_configs');
    await queryInterface.removeColumn('projects', 'slug');
  },
};
