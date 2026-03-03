import dns from 'dns';
import ipaddr from 'ipaddr.js';
import { minimatch } from 'minimatch';

interface PolicyRule {
  action: 'allow' | 'deny';
  target_type: 'ip' | 'cidr' | 'domain';
  target_value: string;
  priority: number;
  description?: string;
}

interface PolicyResult {
  allowed: boolean;
  reason: string;
}

const dnsPromises = dns.promises;

/**
 * Network Policy Enforcement
 * Controls outbound network connections from VM-executed functions.
 */
class NetworkPolicy {
  private rules: PolicyRule[];

  constructor(globalRules: PolicyRule[], projectRules: PolicyRule[]) {
    const allRules = [...(globalRules || []), ...(projectRules || [])];
    this.rules = allRules;

    if (this.rules.length === 0) {
      this.rules = [
        {
          action: 'deny',
          target_type: 'cidr',
          target_value: '0.0.0.0/0',
          priority: 1,
          description: 'Default deny all',
        },
      ];
    }
  }

  hasIPv6Rules(): boolean {
    return this.rules.some((rule) => {
      if (rule.target_type === 'cidr' || rule.target_type === 'ip') {
        return rule.target_value.includes(':');
      }
      return false;
    });
  }

  async resolveDomainToIPs(domain: string): Promise<string[]> {
    const ips: string[] = [];

    try {
      const ipv4Addresses = await dnsPromises.resolve4(domain);
      ips.push(...ipv4Addresses);
    } catch {
      // IPv4 resolution failed — that's okay
    }

    try {
      const ipv6Addresses = await dnsPromises.resolve6(domain);
      ips.push(...ipv6Addresses);
    } catch {
      // IPv6 resolution failed — that's okay
    }

    return ips;
  }

  matchesCIDR(ip: string, cidr: string): boolean {
    try {
      const addr = ipaddr.process(ip);
      const range = ipaddr.parseCIDR(cidr);
      return addr.match(range as any);
    } catch {
      return false;
    }
  }

  matchesDomain(host: string, pattern: string): boolean {
    const lowerHost = host.toLowerCase();
    const lowerPattern = pattern.toLowerCase();
    return minimatch(lowerHost, lowerPattern);
  }

  async evaluatePolicy(
    host: string,
    consoleLog?: (message: string) => void,
  ): Promise<PolicyResult> {
    const isIP = ipaddr.isValid(host);
    let ipsToCheck: string[] = [];

    if (isIP) {
      ipsToCheck = [host];
    } else {
      try {
        ipsToCheck = await this.resolveDomainToIPs(host);

        if (ipsToCheck.length === 0) {
          return { allowed: true, reason: 'DNS resolution pending' };
        }
      } catch {
        return { allowed: true, reason: 'DNS resolution error' };
      }
    }

    const hasIPv6 = ipsToCheck.some((ip) => ip.includes(':'));

    if (hasIPv6 && !this.hasIPv6Rules()) {
      const blockedIP = ipsToCheck.find((ip) => ip.includes(':'));
      const message = `Network policy blocked connection to ${host} (resolved to ${blockedIP})`;
      if (consoleLog) consoleLog(message);
      return { allowed: false, reason: 'IPv6 connection blocked - no IPv6 rules configured' };
    }

    for (const rule of this.rules) {
      let matched = false;

      if (rule.target_type === 'domain') {
        if (!isIP && this.matchesDomain(host, rule.target_value)) {
          matched = true;
        }
      } else if (rule.target_type === 'ip') {
        if (ipsToCheck.includes(rule.target_value)) {
          matched = true;
        }
      } else if (rule.target_type === 'cidr') {
        for (const ip of ipsToCheck) {
          if (this.matchesCIDR(ip, rule.target_value)) {
            matched = true;
            break;
          }
        }
      }

      if (matched) {
        if (rule.action === 'deny') {
          const resolvedIP = ipsToCheck[0];
          const message = `Network policy blocked connection to ${host}${isIP ? '' : ` (resolved to ${resolvedIP})`}`;
          if (consoleLog) consoleLog(message);
          return { allowed: false, reason: 'Connection denied by policy rule' };
        } else {
          return { allowed: true, reason: 'Connection allowed by policy rule' };
        }
      }
    }

    // Default deny
    const resolvedIP = ipsToCheck[0];
    const message = `Network policy blocked connection to ${host}${isIP ? '' : ` (resolved to ${resolvedIP})`}`;
    if (consoleLog) consoleLog(message);
    return { allowed: false, reason: 'No matching policy rule - default deny' };
  }
}

export default NetworkPolicy;
