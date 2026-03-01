import { NextApiRequest, NextApiResponse } from 'next';
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware';
const database = require('@/lib/database');
const ipaddr = require('ipaddr.js');

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return await getGlobalSecurityPolicies(res);
    case 'PUT':
      return await updateGlobalSecurityPolicies(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get global security policies
async function getGlobalSecurityPolicies(res: NextApiResponse) {
  try {
    const { GlobalNetworkPolicy } = database.models;
    const rules = await GlobalNetworkPolicy.findAll({
      attributes: ['id', 'action', 'target_type', 'target_value', 'description', 'priority'],
      order: [['priority', 'ASC']]
    });
    res.json({ rules: rules.map((r: any) => r.get({ plain: true })) });
  } catch (error) {
    console.error('Error fetching global security policies:', error);
    res.status(500).json({ error: 'Failed to fetch global security policies' });
  }
}

// Update global security policies
async function updateGlobalSecurityPolicies(
  req: AuthenticatedRequest,
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
    await database.sequelize.transaction(async (t: any) => {
      const { GlobalNetworkPolicy } = database.models;
      // Delete all existing global rules
      await GlobalNetworkPolicy.destroy({ where: {}, transaction: t });
      // Insert new rules with sequential priorities
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        await GlobalNetworkPolicy.create({
          action: rule.action,
          target_type: rule.target_type,
          target_value: rule.target_value,
          description: rule.description || null,
          priority: i + 1
        }, { transaction: t });
      }
    });
    res.json({ success: true, message: 'Global security policies updated successfully' });
  } catch (error) {
    console.error('Error updating global security policies:', error);
    res.status(500).json({ error: 'Failed to update global security policies' });
  }
}

// Admin-only access for both GET and PUT
export default withAuthAndMethods(['GET', 'PUT'], { adminRequired: true })(handler);
