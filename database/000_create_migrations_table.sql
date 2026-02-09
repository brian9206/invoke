-- Migration: Create Schema Migrations Table
-- Description: Infrastructure table for tracking all database migrations
-- Date: 2026-02-09
-- 
-- This MUST be the first migration (version 000) and creates the tracking
-- system for all subsequent migrations.

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checksum VARCHAR(64) NOT NULL,
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT true
);

-- Index for efficient version lookups
CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);

-- Index for chronological queries
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at);

-- Add table comment for documentation
COMMENT ON TABLE schema_migrations IS 'Tracks all applied database migrations with checksums and execution details';
COMMENT ON COLUMN schema_migrations.version IS 'Migration version number from filename (e.g., 001, 002)';
COMMENT ON COLUMN schema_migrations.name IS 'Migration name/description from filename';
COMMENT ON COLUMN schema_migrations.checksum IS 'SHA-256 hash of migration file content for integrity verification';
COMMENT ON COLUMN schema_migrations.execution_time_ms IS 'Time taken to execute migration in milliseconds';
