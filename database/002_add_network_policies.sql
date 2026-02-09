-- Migration: Add Network Security Policies
-- Description: Combined migration - Adds project network policies and global network policies tables with default policy settings
-- Date: 2026-02-07 / 2026-02-09

-- Create project_network_policies table
CREATE TABLE project_network_policies (
    id SERIAL PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    action VARCHAR(10) NOT NULL CHECK (action IN ('allow', 'deny')),
    target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('ip', 'cidr', 'domain')),
    target_value VARCHAR(255) NOT NULL,
    description VARCHAR(255),
    priority INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient project-based queries
CREATE INDEX idx_project_network_policies_project_id ON project_network_policies(project_id);
CREATE INDEX idx_project_network_policies_priority ON project_network_policies(project_id, priority);

-- Create global_network_policies table
CREATE TABLE global_network_policies (
    id SERIAL PRIMARY KEY,
    action VARCHAR(10) NOT NULL CHECK (action IN ('allow', 'deny')),
    target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('ip', 'cidr', 'domain')),
    target_value VARCHAR(255) NOT NULL,
    description VARCHAR(255),
    priority INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient priority-based queries
CREATE INDEX idx_global_network_policies_priority ON global_network_policies(priority);

-- Insert default global network policies
-- These policies block private networks and loopback addresses, allow public internet
INSERT INTO global_network_policies (action, target_type, target_value, description, priority) VALUES
    ('deny', 'cidr', '10.0.0.0/8', 'Block private network (RFC1918)', 1),
    ('deny', 'cidr', '172.16.0.0/12', 'Block private network (RFC1918)', 2),
    ('deny', 'cidr', '192.168.0.0/16', 'Block private network (RFC1918)', 3),
    ('deny', 'cidr', '127.0.0.0/8', 'Block loopback', 4),
    ('deny', 'cidr', 'fc00::/7', 'Block IPv6 ULA (RFC4193)', 5),
    ('deny', 'cidr', 'fe80::/10', 'Block IPv6 link-local', 6),
    ('deny', 'cidr', '::1/128', 'Block IPv6 loopback', 7);

-- Apply default network policy to all existing projects
-- This ensures existing projects have security policies applied
INSERT INTO project_network_policies (project_id, action, target_type, target_value, description, priority)
SELECT 
    p.id AS project_id,
    rule.action,
    rule.target_type,
    rule.target_value,
    rule.description,
    rule.priority
FROM projects p
CROSS JOIN (
    VALUES 
        ('deny', 'cidr', '10.0.0.0/8', 'Block private network (RFC1918)', 1),
        ('deny', 'cidr', '172.16.0.0/12', 'Block private network (RFC1918)', 2),
        ('deny', 'cidr', '192.168.0.0/16', 'Block private network (RFC1918)', 3),
        ('deny', 'cidr', '127.0.0.0/8', 'Block loopback', 4),
        ('deny', 'cidr', 'fc00::/7', 'Block IPv6 ULA (RFC4193)', 5),
        ('deny', 'cidr', 'fe80::/10', 'Block IPv6 link-local', 6),
        ('deny', 'cidr', '::1/128', 'Block IPv6 loopback', 7),
        ('allow', 'cidr', '0.0.0.0/0', 'Allow all public IPv4', 8)
) AS rule(action, target_type, target_value, description, priority)
WHERE NOT EXISTS (
    SELECT 1 FROM project_network_policies WHERE project_id = p.id
);

-- Verification query (uncomment to check results)
-- SELECT p.name, COUNT(pnp.id) as policy_count 
-- FROM projects p 
-- LEFT JOIN project_network_policies pnp ON p.id = pnp.project_id 
-- GROUP BY p.id, p.name;
