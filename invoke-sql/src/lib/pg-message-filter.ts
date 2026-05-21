import { checkSqlBlocked } from './sql-filter'

// ── Frontend (client→server) message type bytes ────────────────────────────
const MSG_SIMPLE_QUERY = 0x51 // 'Q'
const MSG_PARSE = 0x50 // 'P'
const MSG_BIND = 0x42 // 'B'
const MSG_EXECUTE = 0x45 // 'E'

// ── Backend (server→client) message type bytes ────────────────────────────
const MSG_DATA_ROW = 0x44 // 'D'
const MSG_ERROR_RESPONSE = 0x45 // 'E'  (same byte as MSG_EXECUTE but different direction)
const MSG_READY_FOR_QUERY = 0x5a // 'Z'

// ── Backend error response builder ────────────────────────────────────────

function buildErrorResponse(message: string): Buffer {
  const severity = 'ERROR'
  const sqlstate = '42501' // insufficient_privilege

  const fields = Buffer.concat([
    Buffer.from('S' + severity + '\0'),
    Buffer.from('V' + severity + '\0'),
    Buffer.from('C' + sqlstate + '\0'),
    Buffer.from('M' + message + '\0'),
    Buffer.alloc(1) // null field terminator
  ])

  const len = 4 + fields.length
  const buf = Buffer.allocUnsafe(1 + len)
  buf[0] = MSG_ERROR_RESPONSE
  buf.writeInt32BE(len, 1)
  fields.copy(buf, 5)
  return buf
}

function buildReadyForQuery(): Buffer {
  const buf = Buffer.allocUnsafe(6)
  buf[0] = MSG_READY_FOR_QUERY
  buf.writeInt32BE(5, 1)
  buf[5] = 0x49 // 'I' — idle
  return buf
}

const BLOCK_RESPONSE = Buffer.concat([buildReadyForQuery()])

// ── DataRow field scanner ──────────────────────────────────────────────────

/**
 * Returns true if any field in a DataRow message contains dbName as a
 * substring (case-sensitive). Used to drop rows from other databases.
 *
 * DataRow wire format:
 *   Byte1('D') + Int32(length) + Int16(numFields)
 *   + for each field: Int32(dataLen, -1=NULL) + ByteN(data)
 */
function dataRowContainsDb(msgBytes: Buffer, dbName: string): boolean {
  if (msgBytes.length < 7) return false
  const numFields = msgBytes.readInt16BE(5)
  let offset = 7
  for (let i = 0; i < numFields; i++) {
    if (offset + 4 > msgBytes.length) break
    const fieldLen = msgBytes.readInt32BE(offset)
    offset += 4
    if (fieldLen < 0) continue // NULL
    if (offset + fieldLen > msgBytes.length) break
    const value = msgBytes.slice(offset, offset + fieldLen).toString('utf8')
    if (value.includes(dbName)) return true
    offset += fieldLen
  }
  return false
}

// ── Proxy filter factory ───────────────────────────────────────────────────

export interface ProxyFilter {
  /**
   * Filter a chunk arriving from the client (→ postgres direction).
   * Async because AST parsing is invoked when regex pre-check hits.
   * Returns bytes to echo back to the client (errors) and bytes to forward to postgres.
   */
  filterFromClient(chunk: Buffer): Promise<{ toClient: Buffer; toServer: Buffer }>

  /**
   * Filter a chunk arriving from postgres (→ client direction).
   * Synchronous — raw byte framing with DataRow field scan.
   * Returns bytes to forward to the client (DataRows for other DBs are dropped).
   */
  filterFromServer(chunk: Buffer): Buffer
}

/** Mutable reference to the current storage-lock state, shared with the proxy. */
export interface LockState {
  isLocked: boolean
}

const STORAGE_QUOTA_ERROR = 'Storage quota exceeded. Write operation except DELETE has been disabled'
const WRITE_OP_PATTERN = /INSERT\s+INTO|UPDATE\s/i

/**
 * Create a stateful bidirectional proxy filter for a single connection.
 *
 * - Queries touching pg_database (rewrite-action) are forwarded as-is, but
 *   the response DataRows are filtered to only rows containing `dbName`.
 * - Queries touching pg_roles/pg_user/pg_shadow (rewrite-action) are forwarded
 *   as-is, but the response DataRows are filtered to only rows containing `roleName`.
 * - Queries touching other system catalogs (block-action) are rejected with
 *   an ErrorResponse + ReadyForQuery, never forwarded to postgres.
 * - When `lockState.isLocked` is true, INSERT/UPDATE queries are rejected
 *   with a storage-quota error.
 * - `onQueryExecuted` is called whenever a ReadyForQuery message arrives from
 *   the server (i.e. a query cycle has finished), suitable for scheduling a
 *   storage quota check.
 */
export function createProxyFilter(
  dbName: string,
  roleName: string,
  lockState: LockState,
  onQueryExecuted: () => void
): ProxyFilter {
  let clientPending = Buffer.alloc(0)
  let serverPending = Buffer.alloc(0)

  // Value to filter DataRows by when a row-filtered result set is in progress (null = inactive).
  let rowFilterValue: string | null = null

  // Extended query protocol tracking:
  //   stmtName  → filterBy value ('db' or 'role') when executed
  //   portalName → bound from a filter-needed statement, activate on Execute
  const filterStatements = new Map<string, 'db' | 'role'>()
  const filterPortals = new Map<string, 'db' | 'role'>()

  async function filterFromClient(chunk: Buffer): Promise<{ toClient: Buffer; toServer: Buffer }> {
    clientPending = Buffer.concat([clientPending, chunk])
    const toClientParts: Buffer[] = []
    const toServerParts: Buffer[] = []

    while (clientPending.length >= 5) {
      const msgType = clientPending[0]
      const msgLen = clientPending.readInt32BE(1)
      if (msgLen < 4) break
      const totalLen = 1 + msgLen
      if (clientPending.length < totalLen) break

      const msgBytes = clientPending.slice(0, totalLen)
      clientPending = clientPending.slice(totalLen)

      // ── Simple Query (Q) ──────────────────────────────────────────────────
      if (msgType === MSG_SIMPLE_QUERY) {
        const nullPos = msgBytes.indexOf(0, 5)
        if (nullPos >= 0) {
          const sql = msgBytes.slice(5, nullPos).toString('utf8')

          // Storage quota: reject write ops when DB is locked
          if (lockState.isLocked && WRITE_OP_PATTERN.test(sql)) {
            toClientParts.push(buildErrorResponse(STORAGE_QUOTA_ERROR), BLOCK_RESPONSE)
            continue
          }

          const check = await checkSqlBlocked(sql)
          if (check.blocked) {
            if (check.action === 'rewrite') {
              rowFilterValue = check.filterBy === 'role' ? roleName : dbName
              toServerParts.push(msgBytes)
            } else {
              const reason = check.reason || 'Query blocked by policy'
              toClientParts.push(buildErrorResponse(reason), BLOCK_RESPONSE)
            }
            continue
          }
        }
        toServerParts.push(msgBytes)
        continue
      }

      // ── Parse (P) — Extended Query Protocol ──────────────────────────────
      if (msgType === MSG_PARSE) {
        const nameEnd = msgBytes.indexOf(0, 5)
        if (nameEnd >= 0) {
          const queryStart = nameEnd + 1
          const queryEnd = msgBytes.indexOf(0, queryStart)
          if (queryEnd >= 0) {
            const sql = msgBytes.slice(queryStart, queryEnd).toString('utf8')

            // Storage quota: reject write ops when DB is locked
            if (lockState.isLocked && WRITE_OP_PATTERN.test(sql)) {
              toClientParts.push(buildErrorResponse(STORAGE_QUOTA_ERROR), BLOCK_RESPONSE)
              continue
            }

            const check = await checkSqlBlocked(sql)
            if (check.blocked) {
              if (check.action === 'rewrite') {
                const stmtName = msgBytes.slice(5, nameEnd).toString('utf8')
                filterStatements.set(stmtName, check.filterBy ?? 'db')
                toServerParts.push(msgBytes)
              } else {
                const reason = check.reason || 'Query blocked by policy'
                toClientParts.push(buildErrorResponse(reason), BLOCK_RESPONSE)
              }
              continue
            }
          }
        }
        toServerParts.push(msgBytes)
        continue
      }

      // ── Bind (B) — Extended Query Protocol ───────────────────────────────
      if (msgType === MSG_BIND) {
        const portalEnd = msgBytes.indexOf(0, 5)
        if (portalEnd >= 0) {
          const stmtStart = portalEnd + 1
          const stmtEnd = msgBytes.indexOf(0, stmtStart)
          if (stmtEnd >= 0) {
            const stmtName = msgBytes.slice(stmtStart, stmtEnd).toString('utf8')
            const portalName = msgBytes.slice(5, portalEnd).toString('utf8')
            const stmtFilterBy = filterStatements.get(stmtName)
            if (stmtFilterBy !== undefined) {
              filterPortals.set(portalName, stmtFilterBy)
            }
          }
        }
        toServerParts.push(msgBytes)
        continue
      }

      // ── Execute (E) — Extended Query Protocol ────────────────────────────
      if (msgType === MSG_EXECUTE) {
        const portalEnd = msgBytes.indexOf(0, 5)
        if (portalEnd >= 0) {
          const portalName = msgBytes.slice(5, portalEnd).toString('utf8')
          const portalFilterBy = filterPortals.get(portalName)
          if (portalFilterBy !== undefined) {
            rowFilterValue = portalFilterBy === 'role' ? roleName : dbName
            filterPortals.delete(portalName)
          }
        }
        toServerParts.push(msgBytes)
        continue
      }

      toServerParts.push(msgBytes)
    }

    return {
      toClient: toClientParts.length > 0 ? Buffer.concat(toClientParts) : Buffer.alloc(0),
      toServer: toServerParts.length > 0 ? Buffer.concat(toServerParts) : Buffer.alloc(0)
    }
  }

  function filterFromServer(chunk: Buffer): Buffer {
    serverPending = Buffer.concat([serverPending, chunk])
    const toClientParts: Buffer[] = []

    while (serverPending.length >= 5) {
      const msgType = serverPending[0]
      const msgLen = serverPending.readInt32BE(1)
      if (msgLen < 4) break
      const totalLen = 1 + msgLen
      if (serverPending.length < totalLen) break

      const msgBytes = serverPending.slice(0, totalLen)
      serverPending = serverPending.slice(totalLen)

      // ReadyForQuery signals end of the command cycle — deactivate row filter
      // and notify the proxy that a query has completed (for quota checking)
      if (msgType === MSG_READY_FOR_QUERY) {
        rowFilterValue = null
        toClientParts.push(msgBytes)
        onQueryExecuted()
        continue
      }

      // Drop DataRow messages that don't match the active row filter value
      if (rowFilterValue !== null && msgType === MSG_DATA_ROW) {
        if (!dataRowContainsDb(msgBytes, rowFilterValue)) continue
      }

      toClientParts.push(msgBytes)
    }

    return toClientParts.length > 0 ? Buffer.concat(toClientParts) : Buffer.alloc(0)
  }

  return { filterFromClient, filterFromServer }
}
