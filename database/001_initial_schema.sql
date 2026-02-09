-- Migration: Initial Schema
-- Description: Complete base schema for Invoke application including all core tables
-- Date: 2026-02-09
-- 
-- This migration creates the foundational database structure including:
-- - User authentication and management
-- - Projects and project memberships  
-- - Functions and function versions
-- - Execution logs and metrics
-- - API keys and authentication
-- - Global settings and configuration
-- - Function environment variables
--
-- Invoke Application Database Schema
-- PostgreSQL Database Schema for Invoke Microservices
-- Complete schema including versioning system

-- Create database (run this command separately)
-- CREATE DATABASE invoke_db;

-- Users table for admin authentication
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT false,  -- Changed default to false for regular users
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- Projects table for organizing functions
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    kv_storage_limit_bytes BIGINT DEFAULT 1073741824,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project memberships table for user-project relationships with roles
CREATE TABLE project_memberships (
    id SERIAL PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id),
    UNIQUE(project_id, user_id)
);

-- Functions table for deployed packages metadata
CREATE TABLE functions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,  -- Link to project
    deployed_by INTEGER REFERENCES users(id),
    requires_api_key BOOLEAN DEFAULT false,
    api_key VARCHAR(255), -- API key for function access
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_executed TIMESTAMP WITH TIME ZONE,
    execution_count INTEGER DEFAULT 0,
    active_version_id UUID, -- Will reference function_versions(id)
    -- Retention settings for log cleanup
    retention_type VARCHAR(10) CHECK (retention_type IN ('time', 'count', 'none')),
    retention_value INTEGER,
    retention_enabled BOOLEAN DEFAULT false,
    -- Scheduling settings
    schedule_enabled BOOLEAN DEFAULT false,
    schedule_cron VARCHAR(100), -- Cron expression (minute precision)
    next_execution TIMESTAMP WITH TIME ZONE,
    last_scheduled_execution TIMESTAMP WITH TIME ZONE
);

-- Function versions table for versioning system
CREATE TABLE function_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_id UUID NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    file_size BIGINT NOT NULL,
    package_path VARCHAR(500), -- Path in MinIO storage
    package_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of the package
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id),
    UNIQUE(function_id, version)
);

-- Add foreign key constraint for active_version_id
ALTER TABLE functions ADD CONSTRAINT fk_functions_active_version 
    FOREIGN KEY (active_version_id) REFERENCES function_versions(id);

-- API Keys table for authentication
CREATE TABLE api_keys (
    id SERIAL PRIMARY KEY,
    key_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of the API key
    name VARCHAR(100) NOT NULL,
    created_by INTEGER REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0
);

-- Execution logs table with enhanced logging
CREATE TABLE execution_logs (
    id SERIAL PRIMARY KEY,
    function_id UUID REFERENCES functions(id) ON DELETE CASCADE,
    status_code INTEGER,
    execution_time_ms INTEGER,
    request_size BIGINT,
    response_size BIGINT,
    request_headers JSONB,
    response_headers JSONB,
    request_body TEXT,
    response_body TEXT,
    request_method VARCHAR(10),
    request_url TEXT,
    console_logs JSONB, -- Array of console.log/warn/error outputs
    error_message TEXT,
    client_ip INET,
    user_agent TEXT,
    api_key_used BOOLEAN DEFAULT false,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function environment variables table
CREATE TABLE function_environment_variables (
    id SERIAL PRIMARY KEY,
    function_id UUID NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
    variable_name VARCHAR(255) NOT NULL,
    variable_value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(function_id, variable_name)
);

-- Indexes for better performance
CREATE INDEX idx_functions_name ON functions(name);
CREATE INDEX idx_functions_is_active ON functions(is_active);
CREATE INDEX idx_functions_active_version ON functions(active_version_id);
CREATE INDEX idx_functions_project_id ON functions(project_id);
CREATE INDEX idx_functions_schedule ON functions(schedule_enabled, next_execution) WHERE schedule_enabled = true;
CREATE INDEX idx_function_versions_function_id ON function_versions(function_id);
CREATE INDEX idx_function_versions_version ON function_versions(function_id, version);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active);
CREATE INDEX idx_execution_logs_function_id ON execution_logs(function_id);
CREATE INDEX idx_execution_logs_executed_at ON execution_logs(executed_at);
CREATE INDEX idx_execution_logs_status ON execution_logs(status_code);
CREATE INDEX idx_execution_logs_execution_time ON execution_logs(execution_time_ms);
CREATE INDEX idx_function_env_vars_function_id ON function_environment_variables(function_id);
CREATE INDEX idx_function_env_vars_name ON function_environment_variables(function_id, variable_name);
CREATE INDEX idx_projects_name ON projects(name);
CREATE INDEX idx_projects_is_active ON projects(is_active);
CREATE INDEX idx_project_memberships_project_id ON project_memberships(project_id);
CREATE INDEX idx_project_memberships_user_id ON project_memberships(user_id);
CREATE INDEX idx_project_memberships_role ON project_memberships(role);

-- Global settings table for application configuration
CREATE TABLE global_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Constraint to ensure only one active version per function
CREATE UNIQUE INDEX idx_functions_one_active_version 
ON functions(id) 
WHERE active_version_id IS NOT NULL;

-- Update timestamp triggers
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

-- Insert default global retention settings
INSERT INTO global_settings (setting_key, setting_value, description) VALUES 
('log_retention_type', 'time', 'Default log retention type: time, count, or none'),
('log_retention_value', '7', 'Default log retention value (7 days or 1000 count)'),
('log_retention_enabled', 'true', 'Whether log retention cleanup is enabled globally'),
('function_base_url', 'https://localhost:3001/invoke', 'Base URL for function invocation endpoints'),
('kv_storage_limit_bytes', '1073741824', 'Maximum storage size for project KV store in bytes (default 1GB)');

-- Create default project for migration purposes
INSERT INTO projects (id, name, description, created_by, created_at) VALUES 
('00000000-0000-0000-0000-000000000000', 'Default Project', 'Your first default project', NULL, NOW());

-- Grant permissions (adjust as needed for your environment)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO invoke_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO invoke_user;