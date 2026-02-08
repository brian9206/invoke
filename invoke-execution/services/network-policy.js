const dns = require('dns').promises;
const ipaddr = require('ipaddr.js');
const minimatch = require('minimatch');

/**
 * Network Policy Enforcement
 * Controls outbound network connections from VM-executed functions
 * based on configurable allow/deny rules
 */
class NetworkPolicy {
    /**
     * @param {Array} rules - Array of policy rules sorted by priority
     * Each rule: { action: 'allow'|'deny', target_type: 'ip'|'cidr'|'domain', target_value: string, priority: number }
     */
    constructor(rules) {
        this.rules = rules || [];
        
        // If no rules provided, deny all connections
        if (this.rules.length === 0) {
            this.rules = [{ 
                action: 'deny', 
                target_type: 'cidr', 
                target_value: '0.0.0.0/0', 
                priority: 1,
                description: 'Default deny all'
            }];
        }
    }

    /**
     * Check if any rules contain IPv6 CIDR blocks
     * Used to determine if IPv6 connections should be allowed
     */
    hasIPv6Rules() {
        return this.rules.some(rule => {
            if (rule.target_type === 'cidr' || rule.target_type === 'ip') {
                return rule.target_value.includes(':');
            }
            return false;
        });
    }

    /**
     * Resolve domain name to IP addresses
     * @param {string} domain - Domain name to resolve
     * @returns {Promise<Array<string>>} Array of IP addresses
     */
    async resolveDomainToIPs(domain) {
        const ips = [];
        
        try {
            // Try to resolve IPv4 addresses
            const ipv4Addresses = await dns.resolve4(domain);
            ips.push(...ipv4Addresses);
        } catch (err) {
            // IPv4 resolution failed, that's okay
        }

        try {
            // Try to resolve IPv6 addresses
            const ipv6Addresses = await dns.resolve6(domain);
            ips.push(...ipv6Addresses);
        } catch (err) {
            // IPv6 resolution failed, that's okay
        }

        return ips;
    }

    /**
     * Check if an IP matches a CIDR block
     * @param {string} ip - IP address to check
     * @param {string} cidr - CIDR block (e.g., 192.168.0.0/16)
     * @returns {boolean} True if IP matches CIDR
     */
    matchesCIDR(ip, cidr) {
        try {
            const addr = ipaddr.process(ip);
            const range = ipaddr.parseCIDR(cidr);
            return addr.match(range);
        } catch (err) {
            // Invalid IP or CIDR format
            return false;
        }
    }

    /**
     * Check if a hostname matches a domain pattern (supports wildcards)
     * @param {string} host - Hostname to check
     * @param {string} pattern - Domain pattern (e.g., *.example.com)
     * @returns {boolean} True if hostname matches pattern
     */
    matchesDomain(host, pattern) {
        // Convert pattern to lowercase for case-insensitive matching
        const lowerHost = host.toLowerCase();
        const lowerPattern = pattern.toLowerCase();
        
        // Use minimatch for wildcard support
        return minimatch(lowerHost, lowerPattern);
    }

    /**
     * Evaluate if a connection to a host should be allowed
     * @param {string} host - Hostname or IP address
     * @param {Function} consoleLog - Function to log warnings to user console
     * @returns {Promise<{allowed: boolean, reason: string}>}
     */
    async evaluatePolicy(host, consoleLog) {
        // Determine if host is an IP address or domain name
        const isIP = ipaddr.isValid(host);
        let ipsToCheck = [];

        if (isIP) {
            ipsToCheck = [host];
        } else {
            // Resolve domain to IPs
            try {
                ipsToCheck = await this.resolveDomainToIPs(host);
                
                // If no IPs resolved, treat as native DNS error behavior
                if (ipsToCheck.length === 0) {
                    // Let the connection attempt proceed - DNS will fail naturally
                    return { allowed: true, reason: 'DNS resolution pending' };
                }
            } catch (err) {
                // DNS resolution error - let it fail naturally
                return { allowed: true, reason: 'DNS resolution error' };
            }
        }

        // Check if IPv6 addresses are in the list
        const hasIPv6 = ipsToCheck.some(ip => ip.includes(':'));
        
        // If connecting to IPv6 but no IPv6 rules exist, block the connection
        if (hasIPv6 && !this.hasIPv6Rules()) {
            const blockedIP = ipsToCheck.find(ip => ip.includes(':'));
            const message = `Network policy blocked connection to ${host} (resolved to ${blockedIP})`;
            if (consoleLog) {
                consoleLog(message);
            }
            return { 
                allowed: false, 
                reason: 'IPv6 connection blocked - no IPv6 rules configured'
            };
        }

        // Evaluate rules in priority order (first match wins)
        for (const rule of this.rules) {
            let matched = false;

            if (rule.target_type === 'domain') {
                // Check if domain matches pattern
                if (!isIP && this.matchesDomain(host, rule.target_value)) {
                    matched = true;
                }
            } else if (rule.target_type === 'ip') {
                // Check if any resolved IP matches exactly
                if (ipsToCheck.includes(rule.target_value)) {
                    matched = true;
                }
            } else if (rule.target_type === 'cidr') {
                // Check if any resolved IP matches CIDR block
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
                    if (consoleLog) {
                        consoleLog(message);
                    }
                    return { 
                        allowed: false, 
                        reason: `Connection denied by policy rule`
                    };
                } else {
                    // Allow - connection permitted
                    return { 
                        allowed: true, 
                        reason: 'Connection allowed by policy rule'
                    };
                }
            }
        }

        // No rule matched - default deny
        const resolvedIP = ipsToCheck[0];
        const message = `Network policy blocked connection to ${host}${isIP ? '' : ` (resolved to ${resolvedIP})`}`;
        if (consoleLog) {
            consoleLog(message);
        }
        return { 
            allowed: false, 
            reason: 'No matching policy rule - default deny'
        };
    }
}

module.exports = NetworkPolicy;
