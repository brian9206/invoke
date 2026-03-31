// ============================================================================
// TAP Proxy — Minimal user-space network filter for gVisor sandbox TAP devices
// CIDR-only filtering + IP forwarding, no ARP/NAT/DNS
// ============================================================================

import ipaddr from 'ipaddr.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CIDRRule {
  action: 'allow' | 'deny';
  cidr: string;
  priority: number;
}

interface ProxyEntry {
  sandboxId: string;
  tapFd: number;
  rules: CIDRRule[];
  active: boolean;
}

// ---------------------------------------------------------------------------
// In-memory proxy registry
// ---------------------------------------------------------------------------

const proxies = new Map<string, ProxyEntry>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a new TAP proxy for a sandbox.
 * In the current implementation this just registers the CIDR whitelist;
 * actual packet I/O requires the native addon (future step).
 */
export function createProxy(sandboxId: string, tapFd: number, policies: CIDRRule[]): void {
  proxies.set(sandboxId, {
    sandboxId,
    tapFd,
    rules: sortByPriority(policies),
    active: true,
  });
}

/**
 * Hot-swap the CIDR whitelist for a sandbox. O(1) map swap.
 */
export function updatePolicies(sandboxId: string, policies: CIDRRule[]): void {
  const entry = proxies.get(sandboxId);
  if (!entry) return;
  entry.rules = sortByPriority(policies);
}

/**
 * Stop proxying and release the TAP fd registration for a sandbox.
 */
export function destroyProxy(sandboxId: string): void {
  const entry = proxies.get(sandboxId);
  if (!entry) return;
  entry.active = false;
  proxies.delete(sandboxId);
}

/**
 * Destroy all active proxies (for shutdown).
 */
export function destroyAllProxies(): void {
  for (const id of [...proxies.keys()]) {
    destroyProxy(id);
  }
}

// ---------------------------------------------------------------------------
// Packet evaluation — used by the native packet read loop
// ---------------------------------------------------------------------------

/**
 * Check whether a destination IP is allowed by the sandbox's CIDR rules.
 * Returns `true` if the packet should be forwarded, `false` if dropped.
 */
export function evaluatePacket(sandboxId: string, destIp: string): boolean {
  const entry = proxies.get(sandboxId);
  if (!entry || !entry.active) return false;
  return evaluateRules(entry.rules, destIp);
}

/**
 * Pure evaluation against a sorted rule list.
 * First matching rule wins. No match → default deny.
 */
export function evaluateRules(rules: CIDRRule[], destIp: string): boolean {
  for (const rule of rules) {
    if (matchesCIDR(destIp, rule.cidr)) {
      return rule.action === 'allow';
    }
  }
  // Default deny
  return false;
}

// ---------------------------------------------------------------------------
// CIDR matching — ported from network-policy.ts
// ---------------------------------------------------------------------------

function matchesCIDR(ip: string, cidr: string): boolean {
  try {
    const addr = ipaddr.process(ip);
    const range = ipaddr.parseCIDR(cidr);
    return addr.match(range as [ipaddr.IPv4 | ipaddr.IPv6, number]);
  } catch {
    return false;
  }
}

function sortByPriority(rules: CIDRRule[]): CIDRRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority);
}

// ---------------------------------------------------------------------------
// Conversion helper — from DB network policy rows to CIDRRule[]
// ---------------------------------------------------------------------------

interface PolicyRow {
  action: 'allow' | 'deny';
  target_type: 'ip' | 'cidr' | 'domain';
  target_value: string;
  priority: number;
}

/**
 * Convert network policy rows from the DB to CIDRRule[].
 * Only `ip` and `cidr` target types are used — domain rules are dropped
 * since the TAP proxy operates at the IP level (no DNS inspection).
 */
export function policyRowsToCIDRRules(rows: PolicyRow[]): CIDRRule[] {
  const rules: CIDRRule[] = [];
  for (const row of rows) {
    if (row.target_type === 'cidr') {
      rules.push({ action: row.action, cidr: row.target_value, priority: row.priority });
    } else if (row.target_type === 'ip') {
      // Treat bare IPs as /32 (IPv4) or /128 (IPv6) CIDR
      const isV6 = row.target_value.includes(':');
      const cidr = `${row.target_value}/${isV6 ? 128 : 32}`;
      rules.push({ action: row.action, cidr, priority: row.priority });
    }
    // Domain rules are ignored at the TAP level
  }
  return sortByPriority(rules);
}
