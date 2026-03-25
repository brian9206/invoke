const nearley = require("nearley");
import { QueryTypes } from "sequelize";

const grammar = require("./grammar.js");

type Primitive = string | number | boolean | null;

type WildcardValue = {
  type: "wildcard";
  value: string;
};

type TermValue = Primitive | WildcardValue;

type AstNode =
  | { type: "AND"; left: AstNode; right: AstNode }
  | { type: "OR"; left: AstNode; right: AstNode }
  | { type: "NOT"; expr: AstNode }
  | { type: "TERM"; field: string; value: TermValue }
  | { type: "COMPARE"; op: ">=" | "<=" | ">" | "<"; field: string; value: number }
  | { type: "BARE"; value: TermValue };

type QueryRow = Record<string, unknown>;

type AstResult = {
  sql: string;
  predicate: (row: QueryRow) => boolean;
};

type DslConfig = {
  jsonbColumn: string;
  tsvectorColumn: string;
};

type DslQueryResult = {
  sql: string;
  bind: unknown[];
  type: typeof QueryTypes.SELECT;
  predicate: (row: QueryRow) => boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Sanitise a SQL identifier (column / table name) by allowing only
 * letters, digits and underscores. Throws on anything else.
 */
function sanitiseIdentifier(name: string, label: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid ${label} identifier: '${name}'`);
  }
  return name;
}

/**
 * Sanitise a single JSONB key segment: allow letters, digits, _ - .
 * No single-quotes, backslashes or other SQL-special characters.
 */
function sanitiseJsonbKey(key: string): string {
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(key)) {
    throw new Error(`Invalid JSONB key segment: '${key}'`);
  }
  return key;
}

/**
 * Build a JSONB text-extraction path: "payload"->'a'->'b'->>'c'
 */
function jsonbPath(col: string, field: string): string {
  const parts = field.split(".").map(sanitiseJsonbKey);
  if (parts.length === 1) return `"${col}"->>'${parts[0]}'`;
  const head = parts.slice(0, -1).map((p: string) => `'${p}'`).join("->");
  const tail = parts[parts.length - 1];
  return `"${col}"->${head}->>'${tail}'`;
}

/**
 * Wrap jsonbPath in a numeric cast for comparisons.
 */
function jsonbPathNumeric(col: string, field: string): string {
  return `(${jsonbPath(col, field)})::numeric`;
}

/**
 * Strip wildcard chars to extract core search terms for plainto_tsquery.
 */
function extractSearchTerms(pattern: string): string {
  return pattern.replace(/[*?]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Convert a Kibana wildcard pattern to a JS RegExp (anchored).
 */
function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/([.+^${}()|[\]\\])/g, "\\$1");
  const re = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${re}$`, "i");
}

/**
 * Traverse an object by a dot-separated path. Returns undefined if missing.
 */
function getNestedValue(obj: unknown, dotPath: string): unknown {
  let cur: unknown = obj;
  for (const key of dotPath.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * Collect all leaf (non-object) values from a nested object.
 */
function allLeafValues(obj: unknown): string[] {
  const values: string[] = [];
  (function walk(o: unknown): void {
    if (o == null) return;
    if (typeof o !== "object") {
      values.push(String(o));
      return;
    }
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    Object.values(o as Record<string, unknown>).forEach(walk);
  })(obj);
  return values;
}

// ── AST → { sql, predicate }  (binds array threaded through) ────────

const COMPARE_SQL: Record<">=" | "<=" | ">" | "<", string> = {
  ">=": ">=",
  "<=": "<=",
  ">": ">",
  "<": "<",
};

function astToJsonb(node: AstNode, config: DslConfig, binds: unknown[]): AstResult {
  const { jsonbColumn: col, tsvectorColumn: tsCol } = config;
  sanitiseIdentifier(col, "jsonbColumn");
  sanitiseIdentifier(tsCol, "tsvectorColumn");

  // push value, return its $N placeholder
  function bind(val: unknown): string {
    binds.push(val);
    return `$${binds.length}`;
  }

  switch (node.type) {
    case "AND": {
      const l = astToJsonb(node.left, config, binds);
      const r = astToJsonb(node.right, config, binds);
      return {
        sql: `(${l.sql}) AND (${r.sql})`,
        predicate: (row: QueryRow): boolean => l.predicate(row) && r.predicate(row),
      };
    }
    case "OR": {
      const l = astToJsonb(node.left, config, binds);
      const r = astToJsonb(node.right, config, binds);
      return {
        sql: `(${l.sql}) OR (${r.sql})`,
        predicate: (row: QueryRow): boolean => l.predicate(row) || r.predicate(row),
      };
    }
    case "NOT": {
      const inner = astToJsonb(node.expr, config, binds);
      return {
        sql: `NOT (${inner.sql})`,
        predicate: (row: QueryRow): boolean => !inner.predicate(row),
      };
    }

    case "TERM": {
      const { field, value } = node;

      // Wildcard value → tsvector coarse filter + field-specific predicate
      if (value && typeof value === "object" && value.type === "wildcard") {
        const terms = extractSearchTerms(value.value);
        const re = wildcardToRegex(value.value);
        const p = bind(terms);
        return {
          sql: `"${tsCol}" @@ plainto_tsquery('english', ${p})`,
          predicate: (row: QueryRow): boolean => {
            const v = getNestedValue(row[col], field);
            return v != null && re.test(String(v));
          },
        };
      }

      // Exact value → JSONB path equality
      const p = bind(String(value));
      return {
        sql: `${jsonbPath(col, field)} = ${p}`,
        predicate: (row: QueryRow): boolean => {
          const v = getNestedValue(row[col], field);
          return v != null && String(v) === String(value);
        },
      };
    }

    case "COMPARE": {
      const sqlOp = COMPARE_SQL[node.op];
      if (!sqlOp) throw new Error(`Unsupported comparator: ${node.op}`);
      const p = bind(Number(node.value));
      return {
        sql: `${jsonbPathNumeric(col, node.field)} ${sqlOp} ${p}`,
        predicate: (row: QueryRow): boolean => {
          const v = Number(getNestedValue(row[col], node.field));
          if (Number.isNaN(v)) return false;
          switch (node.op) {
            case ">=":
              return v >= node.value;
            case "<=":
              return v <= node.value;
            case ">":
              return v > node.value;
            case "<":
              return v < node.value;
            default:
              return false;
          }
        },
      };
    }

    case "BARE": {
      const { value } = node;

      // Bare wildcard → tsvector + predicate scanning all leaf values
      if (value && typeof value === "object" && value.type === "wildcard") {
        const terms = extractSearchTerms(value.value);
        const re = wildcardToRegex(value.value);
        const p = bind(terms);
        return {
          sql: `"${tsCol}" @@ plainto_tsquery('english', ${p})`,
          predicate: (row: QueryRow): boolean => allLeafValues(row[col]).some((v: string) => re.test(v)),
        };
      }

      // Bare exact → tsvector + predicate scanning all leaf values
      const term = typeof value === "string" ? value : String(value);
      const p = bind(term);
      return {
        sql: `"${tsCol}" @@ plainto_tsquery('english', ${p})`,
        predicate: (row: QueryRow): boolean => allLeafValues(row[col]).some((v: string) => v === term),
      };
    }

    default:
      throw new Error(`Unknown AST node type: ${(node as { type: string }).type}`);
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Parse a Kibana field-filter string and return parameters for sequelize.query().
 *
 * Usage:
 *   const { sql, bind, type, predicate } = dslToSequelize(input, config);
 *   const rows = await sequelize.query(
 *     `SELECT * FROM function_logs WHERE ${sql}`,
 *     { bind, type }
 *   );
 *   const filtered = rows.filter(predicate); // exact post-filter for wildcards
 */
export function kqlToSequelizeQuery(input: string, config: Partial<DslConfig> = {}): DslQueryResult {
  if (!config.jsonbColumn) throw new Error("config.jsonbColumn is required");
  if (!config.tsvectorColumn) throw new Error("config.tsvectorColumn is required");

  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
  parser.feed(input);
  if (parser.results.length === 0) {
    throw new Error(`No parse result for: ${input}`);
  }

  const binds: unknown[] = [];
  const { sql, predicate } = astToJsonb(parser.results[0] as AstNode, config as DslConfig, binds);

  return { sql, bind: binds, type: QueryTypes.SELECT, predicate };
}