-- Migration: Add API Gateway
-- Description: Adds per-project API gateway configuration with route management,
--              CORS settings per route, reusable named authentication methods
--              (Basic Auth, Bearer JWT, API Key) linked to routes via a junction
--              table. Also adds a slug column to the projects table for URL routing.
-- Date: 2026-02-26

-- =====================================================
-- Add slug to projects (used for default gateway URLs)
-- =====================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

-- Populate slug from existing project names
UPDATE projects
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Make slug unique and not null going forward
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);

-- Trigger to auto-set slug on insert if not provided
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

-- =====================================================
-- api_gateway_configs: Per-project gateway toggle + domain
-- =====================================================
CREATE TABLE api_gateway_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    custom_domain VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_gateway_project UNIQUE (project_id),
    CONSTRAINT uq_gateway_custom_domain UNIQUE (custom_domain)
);

CREATE INDEX idx_gateway_configs_project_id ON api_gateway_configs(project_id);
CREATE INDEX idx_gateway_configs_custom_domain ON api_gateway_configs(custom_domain);

CREATE TRIGGER update_api_gateway_configs_updated_at
    BEFORE UPDATE ON api_gateway_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- api_gateway_routes: Individual route definitions
-- =====================================================
CREATE TABLE api_gateway_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_config_id UUID NOT NULL REFERENCES api_gateway_configs(id) ON DELETE CASCADE,
    route_path VARCHAR(500) NOT NULL,
    function_id UUID REFERENCES functions(id) ON DELETE SET NULL,
    allowed_methods TEXT[] NOT NULL DEFAULT ARRAY['GET', 'POST'],
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_gateway_route_path UNIQUE (gateway_config_id, route_path)
);

CREATE INDEX idx_gateway_routes_gateway_config_id ON api_gateway_routes(gateway_config_id);
CREATE INDEX idx_gateway_routes_function_id ON api_gateway_routes(function_id);
CREATE INDEX idx_gateway_routes_sort_order ON api_gateway_routes(gateway_config_id, sort_order);

CREATE TRIGGER update_api_gateway_routes_updated_at
    BEFORE UPDATE ON api_gateway_routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- api_gateway_route_settings: Per-route CORS config only
-- =====================================================
CREATE TABLE api_gateway_route_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES api_gateway_routes(id) ON DELETE CASCADE,
    -- CORS settings
    cors_enabled BOOLEAN NOT NULL DEFAULT false,
    cors_allowed_origins TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    cors_allowed_headers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    cors_expose_headers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    cors_max_age INTEGER NOT NULL DEFAULT 86400,
    cors_allow_credentials BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_gateway_route_settings_route_id UNIQUE (route_id)
);

CREATE INDEX idx_gateway_route_settings_route_id ON api_gateway_route_settings(route_id);

CREATE TRIGGER update_api_gateway_route_settings_updated_at
    BEFORE UPDATE ON api_gateway_route_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- api_gateway_auth_methods: Reusable named auth configs
-- =====================================================
CREATE TABLE api_gateway_auth_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_config_id UUID NOT NULL REFERENCES api_gateway_configs(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('basic_auth', 'bearer_jwt', 'api_key')),
    -- config shape per type:
    --   basic_auth:  { "credentials": [{"username":"...","password":"..."}] }
    --   bearer_jwt:  { "jwtSecret": "..." }
    --   api_key:     { "apiKeys": ["..."] }
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_gateway_auth_method_name UNIQUE (gateway_config_id, name)
);

CREATE INDEX idx_gateway_auth_methods_config_id ON api_gateway_auth_methods(gateway_config_id);

CREATE TRIGGER update_api_gateway_auth_methods_updated_at
    BEFORE UPDATE ON api_gateway_auth_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- api_gateway_route_auth_methods: Route ↔ Auth junction
-- =====================================================
CREATE TABLE api_gateway_route_auth_methods (
    route_id UUID NOT NULL REFERENCES api_gateway_routes(id) ON DELETE CASCADE,
    auth_method_id UUID NOT NULL REFERENCES api_gateway_auth_methods(id) ON DELETE CASCADE,
    PRIMARY KEY (route_id, auth_method_id)
);

CREATE INDEX idx_gateway_route_auth_methods_route_id ON api_gateway_route_auth_methods(route_id);
CREATE INDEX idx_gateway_route_auth_methods_auth_id ON api_gateway_route_auth_methods(auth_method_id);

-- =====================================================
-- Global setting: default API gateway domain
-- =====================================================
INSERT INTO global_settings (setting_key, setting_value, description)
VALUES ('api_gateway_domain', '', 'Default API Gateway domain (e.g., api.example.com). Used for the default URL pattern: <domain>/<project-slug>/<route>');

-- =====================================================
-- pg_notify triggers for instant gateway cache invalidation
-- All gateway instances LISTEN on 'gateway_invalidated'
-- and call forceRefresh() within ~100ms of any change.
-- =====================================================

-- Function: fires on any mutation to gateway config / route tables
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

-- Function: fires only when the api_gateway_domain global setting changes
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
