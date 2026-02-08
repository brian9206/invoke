import { NextApiRequest, NextApiResponse } from 'next';
import { adminRequired } from '@/lib/middleware';
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
