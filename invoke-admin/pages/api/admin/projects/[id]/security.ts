import { NextApiRequest, NextApiResponse } from 'next';
import { adminRequired } from '@/lib/middleware';
const database = require('@/lib/database');
const ipaddr = require('ipaddr.js');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id: projectId } = req.query;

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  switch (req.method) {
    case 'GET':
      return await getSecurityPolicies(projectId, req, res);
    case 'PUT':
      return await updateSecurityPolicies(projectId, req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get security policies for a project
async function getSecurityPolicies(
  projectId: string,
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const result = await database.query(
      `SELECT id, action, target_type, target_value, description, priority
       FROM project_network_policies
       WHERE project_id = $1
       ORDER BY priority ASC`,
      [projectId]
    );

    res.json({ rules: result.rows });
  } catch (error) {
    console.error('Error fetching security policies:', error);
    res.status(500).json({ error: 'Failed to fetch security policies' });
  }
}

// Update security policies for a project
async function updateSecurityPolicies(
  projectId: string,
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { rules } = req.body;

  if (!Array.isArray(rules)) {
    return res.status(400).json({ error: 'Rules must be an array' });
  }

  if (rules.length === 0) {
    return res.status(400).json({ error: 'At least one policy rule is required' });
  }

  // Validate each rule
  for (const rule of rules) {
    if (!rule.action || !['allow', 'deny'].includes(rule.action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "allow" or "deny"' });
    }

    if (!rule.target_type || !['ip', 'cidr', 'domain'].includes(rule.target_type)) {
      return res.status(400).json({ error: 'Invalid target_type. Must be "ip", "cidr", or "domain"' });
    }

    if (!rule.target_value || typeof rule.target_value !== 'string') {
      return res.status(400).json({ error: 'target_value is required' });
    }

    // Validate target value format
    if (rule.target_type === 'ip') {
      if (!ipaddr.isValid(rule.target_value)) {
        return res.status(400).json({ error: `Invalid IP address: ${rule.target_value}` });
      }
    } else if (rule.target_type === 'cidr') {
      try {
        ipaddr.parseCIDR(rule.target_value);
      } catch (e) {
        return res.status(400).json({ error: `Invalid CIDR notation: ${rule.target_value}` });
      }
    } else if (rule.target_type === 'domain') {
      // Basic domain validation (allows wildcards)
      if (!/^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(rule.target_value)) {
        return res.status(400).json({ error: `Invalid domain format: ${rule.target_value}` });
      }
    }
  }

  try {
    // Use a transaction to delete old rules and insert new ones
    await database.query('BEGIN');

    // Delete existing rules for this project
    await database.query(
      'DELETE FROM project_network_policies WHERE project_id = $1',
      [projectId]
    );

    // Insert new rules with sequential priorities
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      await database.query(
        `INSERT INTO project_network_policies 
         (project_id, action, target_type, target_value, description, priority)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          projectId,
          rule.action,
          rule.target_type,
          rule.target_value,
          rule.description || null,
          i + 1, // Sequential priority starting from 1
        ]
      );
    }

    await database.query('COMMIT');

    res.json({ success: true, message: 'Security policies updated successfully' });
  } catch (error) {
    await database.query('ROLLBACK');
    console.error('Error updating security policies:', error);
    res.status(500).json({ error: 'Failed to update security policies' });
  }
}

export default adminRequired(handler);
