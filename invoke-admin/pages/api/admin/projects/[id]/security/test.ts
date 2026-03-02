import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/lib/middleware';
const database = require('@/lib/database');

// Import the NetworkPolicy class from execution service
// Since we're in the admin service, we'll simulate the policy evaluation
const ipaddr = require('ipaddr.js');
const minimatch = require('minimatch');
const dns = require('dns').promises;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { host, rules } = req.body;

  if (!host || typeof host !== 'string') {
    return res.status(400).json({ error: 'Host is required' });
  }

  if (!Array.isArray(rules)) {
    return res.status(400).json({ error: 'Rules must be an array' });
  }

  try {
    // Fetch global policies from database
    const { GlobalNetworkPolicy } = database.models;
    const globalRules = (await GlobalNetworkPolicy.findAll({
      attributes: ['id', 'action', 'target_type', 'target_value', 'description', 'priority'],
      order: [['priority', 'ASC']]
    })).map((r: any) => ({ ...r.get({ plain: true }), is_global: true }));

    // Prepend global rules to the provided rules, marking project rules
    const projectRulesWithMarker = rules.map(rule => ({ ...rule, is_global: false }));
    const combinedRules = [...globalRules, ...projectRulesWithMarker];

    const result = await evaluatePolicy(host, combinedRules);
    res.json(result);
  } catch (error) {
    console.error('Error testing connection:', error);
    res.status(500).json({ 
      allowed: false, 
      reason: 'Test failed: ' + (error instanceof Error ? error.message : String(error)) 
    });
  }
}

// Simplified policy evaluation (mirrors the NetworkPolicy class logic)
async function evaluatePolicy(host: string, rules: any[]): Promise<{ allowed: boolean; reason: string }> {
  const isIP = ipaddr.isValid(host);
  let ipsToCheck: string[] = [];

  if (isIP) {
    ipsToCheck = [host];
  } else {
    // Resolve domain to IPs
    try {
      const ipv4Addresses = await dns.resolve4(host).catch(() => []);
      const ipv6Addresses = await dns.resolve6(host).catch(() => []);
      ipsToCheck = [...ipv4Addresses, ...ipv6Addresses];

      if (ipsToCheck.length === 0) {
        return { allowed: true, reason: 'DNS resolution pending' };
      }
    } catch (err) {
      return { allowed: true, reason: 'DNS resolution error' };
    }
  }

  // Check if IPv6 addresses are in the list
  const hasIPv6 = ipsToCheck.some(ip => ip.includes(':'));
  const hasIPv6Rules = rules.some(rule => 
    (rule.target_type === 'cidr' || rule.target_type === 'ip') && rule.target_value.includes(':')
  );

  if (hasIPv6 && !hasIPv6Rules) {
    return {
      allowed: false,
      reason: 'IPv6 connection blocked - no IPv6 rules configured'
    };
  }

  // Evaluate rules in priority order
  for (const rule of rules) {
    let matched = false;

    if (rule.target_type === 'domain') {
      if (!isIP && matchesDomain(host, rule.target_value)) {
        matched = true;
      }
    } else if (rule.target_type === 'ip') {
      if (ipsToCheck.includes(rule.target_value)) {
        matched = true;
      }
    } else if (rule.target_type === 'cidr') {
      for (const ip of ipsToCheck) {
        if (matchesCIDR(ip, rule.target_value)) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      const ruleType = rule.is_global ? 'global' : 'project';
      if (rule.action === 'deny') {
        return {
          allowed: false,
          reason: `Denied by ${ruleType} rule #${rule.priority}${rule.description ? ': ' + rule.description : ''}`
        };
      } else {
        return {
          allowed: true,
          reason: `Allowed by ${ruleType} rule #${rule.priority}${rule.description ? ': ' + rule.description : ''}`
        };
      }
    }
  }

  // No rule matched - default deny
  return {
    allowed: false,
    reason: 'No matching policy rule - default deny'
  };
}

function matchesCIDR(ip: string, cidr: string): boolean {
  try {
    const addr = ipaddr.process(ip);
    const range = ipaddr.parseCIDR(cidr);
    return addr.match(range);
  } catch (err) {
    return false;
  }
}

function matchesDomain(host: string, pattern: string): boolean {
  const lowerHost = host.toLowerCase();
  const lowerPattern = pattern.toLowerCase();
  return minimatch(lowerHost, lowerPattern);
}

export default withAuth(handler);
