import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/lib/middleware';
import { checkProjectOwnerAccess } from '@/lib/project-access';
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

// Get security policies for a project (accessible to all authenticated users)
async function getSecurityPolicies(
  projectId: string,
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { ProjectNetworkPolicy } = database.models;
    const rules = await ProjectNetworkPolicy.findAll({
      where: { project_id: projectId },
      attributes: ['id', 'action', 'target_type', 'target_value', 'description', 'priority'],
      order: [['priority', 'ASC']]
    });
    res.json({ rules: rules.map((r: any) => r.get({ plain: true })) });
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
  // Only admins and project owners can modify security policies
  const user = (req as any).user;
  
  const ownerAccess = await checkProjectOwnerAccess(user?.id, projectId, user?.isAdmin);
  if (!ownerAccess.allowed) {
    return res.status(403).json({ error: ownerAccess.message || 'Insufficient permissions' });
  }

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
    await database.sequelize.transaction(async (t: any) => {
      const { ProjectNetworkPolicy } = database.models;
      // Delete existing rules for this project
      await ProjectNetworkPolicy.destroy({ where: { project_id: projectId }, transaction: t });
      // Insert new rules with sequential priorities
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        await ProjectNetworkPolicy.create({
          project_id: projectId,
          action: rule.action,
          target_type: rule.target_type,
          target_value: rule.target_value,
          description: rule.description || null,
          priority: i + 1
        }, { transaction: t });
      }
    });
    res.json({ success: true, message: 'Security policies updated successfully' });
  } catch (error) {
    console.error('Error updating security policies:', error);
    res.status(500).json({ error: 'Failed to update security policies' });
  }
}

// Use withAuth instead of adminRequired to allow GET requests for all authenticated users
export default withAuth(handler);
