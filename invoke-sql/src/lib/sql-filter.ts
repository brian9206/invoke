import { Parser } from '@pgsql/parser'

export interface SqlFilterResult {
  blocked: boolean
  action?: 'block' | 'rewrite'
  reason?: string
  /** For 'rewrite' actions: which connection value to use when row-filtering the response. */
  filterBy?: 'db' | 'role'
}

// ── Singleton parser instance (reuses WASM module after first init) ────────
const parser = new Parser()

/** Call once at startup to pre-warm the WASM module (~50-100ms). */
export async function warmUp(): Promise<void> {
  await parser.parse('SELECT 1')
}

// ── Regex pre-check (fast, synchronous) ────────────────────────────────────
// Only used to decide whether to invoke the AST parser. No false-negative risk:
// if the table name literally appears in the SQL text, the regex will catch it.

const ALLOWLIST_PATTERNS: RegExp[] = [/pg_database_size\s*\(\s*current_database\s*\(\s*\)\s*\)/i]

interface BlockRule {
  pattern: RegExp
  table: string
  action: 'block' | 'rewrite'
  reason?: string
  /** For 'rewrite', require datname in column/where/join to activate row filter */
  requiresDatname?: boolean
  /** For 'rewrite', which connection value to use when row-filtering the response. Defaults to 'db'. */
  filterBy?: 'db' | 'role'
}

const BLOCKLIST: BlockRule[] = [
  { pattern: /\bpg_database\b/i, table: 'pg_database', action: 'rewrite', requiresDatname: true },
  {
    pattern: /\bpg_stat_activity\b/i,
    table: 'pg_stat_activity',
    action: 'block',
    reason: 'Access to server activity catalog is restricted (pg_stat_activity)'
  },
  { pattern: /\bpg_roles\b/i, table: 'pg_roles', action: 'rewrite', filterBy: 'role' },
  { pattern: /\bpg_user\b/i, table: 'pg_user', action: 'rewrite', filterBy: 'role' },
  { pattern: /\bpg_shadow\b/i, table: 'pg_shadow', action: 'rewrite', filterBy: 'role' },
  {
    pattern: /\bpg_authid\b/i,
    table: 'pg_authid',
    action: 'block',
    reason: 'Access to credential catalog is restricted (pg_authid)'
  }
]

// ── AST walkers ────────────────────────────────────────────────────────────

/** Recursively extract all table names (RangeVar.relname) from an AST. */
function extractTableNames(node: any): Set<string> {
  const tables = new Set<string>()
  walk(node, (n: any) => {
    if (n && n.RangeVar && n.RangeVar.relname) {
      tables.add(n.RangeVar.relname)
    }
  })
  return tables
}

/** Check if 'datname' appears as a column reference anywhere in the AST,
 *  OR if a wildcard (*) is used which implicitly includes datname. */
function referencesDatnameColumn(node: any): boolean {
  let found = false
  walk(node, (n: any) => {
    if (found) return
    if (n && n.ColumnRef && n.ColumnRef.fields) {
      for (const field of n.ColumnRef.fields) {
        if (field && field.String && field.String.sval === 'datname') {
          found = true
          return
        }
        if (field && field.A_Star !== undefined) {
          found = true
          return
        }
      }
    }
  })
  return found
}

/**
 * Generic recursive AST walker. Visits every object/array node and calls
 * the visitor function on each object node.
 */
function walk(node: any, visitor: (n: any) => void): void {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visitor)
    return
  }
  if (typeof node === 'object') {
    visitor(node)
    for (const key of Object.keys(node)) {
      walk(node[key], visitor)
    }
  }
}

// ── Main filter function ───────────────────────────────────────────────────

export async function checkSqlBlocked(sql: string): Promise<SqlFilterResult> {
  if (!sql || typeof sql !== 'string') {
    return { blocked: false }
  }

  const trimmed = sql.trim()
  if (!trimmed) {
    return { blocked: false }
  }

  // Fast allowlist — skip entirely for known safe patterns
  for (const allowed of ALLOWLIST_PATTERNS) {
    if (allowed.test(trimmed)) {
      return { blocked: false }
    }
  }

  // Fast regex pre-check — find which rules might apply
  const hits: BlockRule[] = []
  for (const rule of BLOCKLIST) {
    if (rule.pattern.test(trimmed)) {
      hits.push(rule)
    }
  }

  // No regex match → allow immediately (zero async overhead)
  if (hits.length === 0) {
    return { blocked: false }
  }

  // Regex hit — invoke AST parser to confirm it's a real catalog reference
  let stmts: any[]
  try {
    const result = await parser.parse(trimmed)
    stmts = result.stmts || []
  } catch {
    // Parse failure → allow through (postgres will return proper syntax error)
    return { blocked: false }
  }

  const tableNames = extractTableNames(stmts)

  for (const rule of hits) {
    if (!tableNames.has(rule.table)) continue // regex was a false positive (e.g. user table name)

    if (rule.action === 'rewrite') {
      // For pg_database: only activate row-filter if datname is referenced
      if (rule.requiresDatname && !referencesDatnameColumn(stmts)) {
        continue
      }
      return { blocked: true, action: 'rewrite', filterBy: rule.filterBy ?? 'db' }
    }

    return { blocked: true, action: 'block', reason: rule.reason }
  }

  // AST didn't confirm any real catalog table hit — allow through
  return { blocked: false }
}
