import { NextApiRequest, NextApiResponse } from 'next';
import { adminRequired } from '@/lib/middleware';
const database = require('@/lib/database');
const ipaddr = require('ipaddr.js');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return await getDefaultNetworkPolicy(req, res);
    case 'PUT':
      return await updateDefaultNetworkPolicy(req, res);
    case 'POST':
      // Test connection endpoint
      if (req.url?.includes('/test')) {
        return await testConnection(req, res);
      }
      return res.status(405).json({ error: 'Method not allowed' });
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get default network policy from global settings
async function getDefaultNetworkPolicy(req: NextApiRequest, res: NextApiResponse) {
  try {
    const result = await database.query(
      `SELECT setting_value
       FROM global_settings
       WHERE setting_key = 'default_network_policy'`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Default network policy not found' });
    }

    const rules = JSON.parse(result.rows[0].setting_value);
    res.json({ rules });
  } catch (error) {
    console.error('Error fetching default network policy:', error);
    res.status(500).json({ error: 'Failed to fetch default network policy' });
  }
}

// Update default network policy in global settings
async function updateDefaultNetworkPolicy(req: NextApiRequest, res: NextApiResponse) {
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
      if (!/^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(rule.target_value)) {
        return res.status(400).json({ error: `Invalid domain format: ${rule.target_value}` });
      }
    }
  }

  try {
    // Update the default_network_policy setting
    await database.query(
      `UPDATE global_settings 
       SET setting_value = $1, updated_at = NOW()
       WHERE setting_key = 'default_network_policy'`,
      [JSON.stringify(rules)]
    );

    res.json({ success: true, message: 'Default network policy updated successfully' });
  } catch (error) {
    console.error('Error updating default network policy:', error);
    res.status(500).json({ error: 'Failed to update default network policy' });
  }
}

// Test connection using default policy rules
async function testConnection(req: NextApiRequest, res: NextApiResponse) {
  const { host, rules } = req.body;

  if (!host || typeof host !== 'string') {
    return res.status(400).json({ error: 'Host is required' });
  }

  if (!Array.isArray(rules)) {
    return res.status(400).json({ error: 'Rules must be an array' });
  }

  try {
    // Use the same test logic as the project security test endpoint
    const dns = require('dns').promises;
    const minimatch = require('minimatch');

    const isIP = ipaddr.isValid(host);
    let ipsToCheck: string[] = [];

    if (isIP) {
      ipsToCheck = [host];
    } else {
      try {
        const ipv4Addresses = await dns.resolve4(host).catch(() => []);
        const ipv6Addresses = await dns.resolve6(host).catch(() => []);
        ipsToCheck = [...ipv4Addresses, ...ipv6Addresses];

        if (ipsToCheck.length === 0) {
          return res.json({ allowed: true, reason: 'DNS resolution pending' });
        }
      } catch (err) {
        return res.json({ allowed: true, reason: 'DNS resolution error' });
      }
    }

    const hasIPv6 = ipsToCheck.some((ip: string) => ip.includes(':'));
    const hasIPv6Rules = rules.some((rule: any) => 
      (rule.target_type === 'cidr' || rule.target_type === 'ip') && rule.target_value.includes(':')
    );

    if (hasIPv6 && !hasIPv6Rules) {
      return res.json({
        allowed: false,
        reason: 'IPv6 connection blocked - no IPv6 rules configured'
      });
    }

    // Evaluate rules
    for (const rule of rules) {
      let matched = false;

      if (rule.target_type === 'domain') {
        if (!isIP && minimatch(host.toLowerCase(), rule.target_value.toLowerCase())) {
          matched = true;
        }
      } else if (rule.target_type === 'ip') {
        if (ipsToCheck.includes(rule.target_value)) {
          matched = true;
        }
      } else if (rule.target_type === 'cidr') {
        for (const ip of ipsToCheck) {
          try {
            const addr = ipaddr.process(ip);
            const range = ipaddr.parseCIDR(rule.target_value);
            if (addr.match(range)) {
              matched = true;
              break;
            }
          } catch (e) {
            // Invalid format, skip
          }
        }
      }

      if (matched) {
        if (rule.action === 'deny') {
          return res.json({
            allowed: false,
            reason: `Denied by rule #${rule.priority}${rule.description ? ': ' + rule.description : ''}`
          });
        } else {
          return res.json({
            allowed: true,
            reason: `Allowed by rule #${rule.priority}${rule.description ? ': ' + rule.description : ''}`
          });
        }
      }
    }

    res.json({
      allowed: false,
      reason: 'No matching policy rule - default deny'
    });
  } catch (error) {
    console.error('Error testing connection:', error);
    res.status(500).json({ 
      allowed: false, 
      reason: 'Test failed: ' + (error instanceof Error ? error.message : String(error)) 
    });
  }
}

export default adminRequired(handler);
