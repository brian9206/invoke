-- Migration: Add Network Security Policies
-- Description: Adds project network policies table and default policy settings
-- Date: 2026-02-07

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

-- Insert default network policy into global_settings
-- Default policy: Block all private networks (RFC1918, RFC4193, loopback), allow public internet
INSERT INTO global_settings (setting_key, setting_value, description) VALUES 
(
    'default_network_policy', 
    '[
        {"action":"deny","target_type":"cidr","target_value":"10.0.0.0/8","description":"Block private network (RFC1918)","priority":1},
        {"action":"deny","target_type":"cidr","target_value":"172.16.0.0/12","description":"Block private network (RFC1918)","priority":2},
        {"action":"deny","target_type":"cidr","target_value":"192.168.0.0/16","description":"Block private network (RFC1918)","priority":3},
        {"action":"deny","target_type":"cidr","target_value":"127.0.0.0/8","description":"Block loopback","priority":4},
        {"action":"deny","target_type":"cidr","target_value":"fc00::/7","description":"Block IPv6 ULA (RFC4193)","priority":5},
        {"action":"deny","target_type":"cidr","target_value":"fe80::/10","description":"Block IPv6 link-local","priority":6},
        {"action":"deny","target_type":"cidr","target_value":"::1/128","description":"Block IPv6 loopback","priority":7},
        {"action":"allow","target_type":"cidr","target_value":"0.0.0.0/0","description":"Allow all public IPv4","priority":8}
    ]',
    'Default network security policy for new projects'
);

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
) AS rule(action, target_type, target_value, description, priority);

-- Verification query (uncomment to check results)
-- SELECT p.name, COUNT(pnp.id) as policy_count 
-- FROM projects p 
-- LEFT JOIN project_network_policies pnp ON p.id = pnp.project_id 
-- GROUP BY p.id, p.name;
