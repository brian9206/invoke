import net from 'net'
import { Client as PgClient, ClientConfig } from 'pg'
import { Duplex } from 'stream'
import { createProxyFilter, LockState } from './pg-message-filter'

// Use pg-protocol's Writer for building protocol messages cleanly
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Writer } = require('pg-protocol/dist/buffer-writer')

// ── PostgreSQL protocol constants ──────────────────────────────────────────

/** Frontend (client→server) startup codes — untyped messages (no leading byte) */
const FrontendStartupCode = {
  SSLRequest: 80877103,
  ProtocolVersion3_0: 196608 // (3 << 16) | 0
} as const

/** Backend (server→client) message type bytes */
const BackendMessageCode = {
  Authentication: 'R'.charCodeAt(0), // 0x52
  ParameterStatus: 'S'.charCodeAt(0), // 0x53
  BackendKeyData: 'K'.charCodeAt(0), // 0x4b
  ReadyForQuery: 'Z'.charCodeAt(0) // 0x5a
} as const

/** Authentication sub-types (int32 after length field) */
const AuthType = {
  Ok: 0
} as const

/** Transaction status indicators for ReadyForQuery */
const TransactionStatus = {
  Idle: 'I'.charCodeAt(0)
} as const

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

// ── Backend message builders (using pg-protocol Writer) ────────────────────

function buildAuthenticationOk(): Buffer {
  const writer = new Writer()
  writer.addInt32(AuthType.Ok)
  return writer.flush(BackendMessageCode.Authentication)
}

function buildParameterStatus(name: string, value: string): Buffer {
  const writer = new Writer()
  writer.addCString(name).addCString(value)
  return writer.flush(BackendMessageCode.ParameterStatus)
}

function buildBackendKeyData(processID: number, secretKey: number): Buffer {
  const writer = new Writer()
  writer.addInt32(processID).addInt32(secretKey)
  return writer.flush(BackendMessageCode.BackendKeyData)
}

function buildReadyForQuery(): Buffer {
  const writer = new Writer()
  // Writer doesn't have addByte, so we use a single-byte buffer
  writer.add(Buffer.from([TransactionStatus.Idle]))
  return writer.flush(BackendMessageCode.ReadyForQuery)
}

// ── Client startup negotiation ─────────────────────────────────────────────

/**
 * Handle the initial PostgreSQL protocol messages from the client:
 *   1. Optional SSLRequest → reply 'N' (no SSL support)
 *   2. StartupMessage v3.0 → discarded (proxy supplies admin creds)
 *
 * Returns any trailing bytes that arrived in the same chunk(s) after the StartupMessage.
 */
function handleClientStartup(socket: Duplex): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let acc = Buffer.alloc(0)

    const cleanup = () => {
      socket.removeListener('data', onData)
      socket.removeListener('close', onClose)
      socket.removeListener('error', onError)
    }

    const onData = (chunk: Buffer) => {
      acc = Buffer.concat([acc, chunk])

      // Consume complete untyped startup messages from the front of the buffer.
      // Startup messages have format: int32(length including self) int32(code) ...payload
      while (acc.length >= 8) {
        const msgLen = acc.readInt32BE(0)
        if (acc.length < msgLen) return // incomplete message, wait for more data

        const code = acc.readInt32BE(4)
        const rest = acc.slice(msgLen)

        if (code === FrontendStartupCode.SSLRequest) {
          // Decline SSL — respond with single 'N' byte
          socket.write(Buffer.from('N'))
          acc = rest
        } else if (code === FrontendStartupCode.ProtocolVersion3_0) {
          // StartupMessage — discard client-supplied user/database params
          cleanup()
          resolve(rest)
          return
        } else {
          cleanup()
          reject(new Error(`Unexpected startup code: ${code} (0x${code.toString(16)})`))
          return
        }
      }
    }

    const onClose = () => {
      cleanup()
      reject(new Error('Client disconnected during startup'))
    }
    const onError = (err: Error) => {
      cleanup()
      reject(err)
    }

    socket.on('data', onData)
    socket.on('close', onClose)
    socket.on('error', onError)
  })
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface PostgresProxyOptions {
  /**
   * pg.Client constructor options.
   * Must include host, port, user, password, database at minimum.
   */
  options: ClientConfig

  /**
   * Client-side duplex stream (net.Socket, or ws's createWebSocketStream output).
   * The proxy reads the PG startup handshake from this stream and writes the
   * synthetic auth response back to it, then relays all subsequent bytes.
   */
  socket: Duplex

  /** Idle timeout in milliseconds. Default: 30 minutes. */
  idleTimeoutMs?: number

  /** Mutable lock-state reference; filter reads this per-message to block writes when locked. */
  lockState: LockState

  /** Called after each query cycle completes (ReadyForQuery received from server). */
  onQueryExecuted: () => void
}

export interface PostgresProxy {
  /** Immediately close both sides. Safe to call multiple times. */
  close(): void
}

/**
 * Create a PostgreSQL authentication bridge.
 *
 * Authenticates with postgres using the credentials in `options` (SCRAM-SHA-256 etc.),
 * then presents the client socket with a synthetic AuthenticationOk response.
 * After setup, all subsequent bytes are relayed transparently.
 *
 * ```ts
 * const proxy = await createPostgresProxy({ options: { host, port, user, password, database }, socket })
 * proxy.close() // or auto-closes on either side disconnect
 * ```
 */
export async function createPostgresProxy(opts: PostgresProxyOptions): Promise<PostgresProxy> {
  const { options, socket, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS, lockState, onQueryExecuted } = opts

  // ── 1. Create pg.Client and tap internal Connection events BEFORE connect ──
  // pg.Client always creates `this.connection = new Connection(...)` in its constructor,
  // and Connection emits parsed pg-protocol message events by name.
  const pgClient = new PgClient(options)
  const pgConn = (pgClient as any).connection as any

  const collectedParams: { name: string; value: string }[] = []
  let keyData: { processID: number; secretKey: number } | undefined

  pgConn.on('parameterStatus', (msg: any) => {
    collectedParams.push({ name: msg.parameterName, value: msg.parameterValue })
  })
  pgConn.on('backendKeyData', (msg: any) => {
    keyData = { processID: msg.processID, secretKey: msg.secretKey }
  })

  // ── 2. Run pg auth + client startup negotiation in parallel ────────────────
  const pgConnectPromise = pgClient.connect()
  const startupPromise = handleClientStartup(socket)

  let pendingData: Buffer
  try {
    const [, pending] = await Promise.all([pgConnectPromise, startupPromise])
    pendingData = pending
  } catch (err) {
    // Suppress secondary rejection from the other side
    startupPromise.catch(() => {})
    pgClient.end().catch(() => {})
    if (!socket.destroyed) socket.destroy()
    throw err
  }

  // ── 3. Steal raw socket from pg.Client ─────────────────────────────────────
  // pgConn.stream is the underlying net.Socket (set in pg Connection constructor).
  // Removing all listeners gives us full control while keeping the TCP link alive.
  const pgStream: net.Socket = pgConn.stream

  pgConn.removeAllListeners()
  pgStream.removeAllListeners('data')
  pgStream.removeAllListeners('error')
  pgStream.removeAllListeners('close')
  pgStream.removeAllListeners('end')
  pgStream.removeAllListeners('drain')

  // ── 4. Send synthetic auth response to client ──────────────────────────────
  const parts: Buffer[] = [buildAuthenticationOk()]
  for (const { name, value } of collectedParams) {
    parts.push(buildParameterStatus(name, value))
  }
  if (keyData) {
    parts.push(buildBackendKeyData(keyData.processID, keyData.secretKey))
  }
  parts.push(buildReadyForQuery())

  socket.write(Buffer.concat(parts))

  // ── 5. Enter relay mode ────────────────────────────────────────────────────
  let idleTimer: NodeJS.Timeout | null = null
  let closed = false

  const proxy: PostgresProxy = {
    close() {
      if (closed) return
      closed = true
      if (idleTimer) clearTimeout(idleTimer)
      pgStream.destroy()
      if (!socket.destroyed) socket.destroy()
    }
  }

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      proxy.close()
    }, idleTimeoutMs)
  }

  resetIdleTimer()

  // Per-connection stateful filter (tracks rowFilterValue, pending buffers, etc.)
  const filter = createProxyFilter(options.database as string, options.user as string, lockState, onQueryExecuted)

  // ── Async queue for client→server direction ────────────────────────────────
  // filterFromClient is async (invokes WASM parser on regex hits).
  // We process chunks sequentially to preserve message ordering.
  let processing = false
  const queue: Buffer[] = []

  async function drainQueue(): Promise<void> {
    if (processing) return
    processing = true
    while (queue.length > 0 && !closed) {
      const chunk = queue.shift()!
      try {
        const { toClient, toServer } = await filter.filterFromClient(chunk)
        if (toClient.length > 0 && !socket.destroyed) socket.write(toClient)
        if (toServer.length > 0 && pgStream.writable) pgStream.write(toServer)
      } catch {
        // Filter error — forward raw bytes to not break the connection
        if (pgStream.writable) pgStream.write(chunk)
      }
    }
    processing = false
    // Resume socket if it was paused for backpressure
    if (queue.length === 0 && !closed && !socket.destroyed) {
      socket.resume()
    }
  }

  function enqueueClientData(data: Buffer): void {
    resetIdleTimer()
    queue.push(data)
    // Pause socket if queue grows too large (backpressure)
    if (queue.length > 16) socket.pause()
    drainQueue()
  }

  // Flush any bytes that arrived after the StartupMessage in the same chunk
  if (pendingData.length > 0 && pgStream.writable) {
    enqueueClientData(pendingData)
  }

  // Client → PostgreSQL (async SQL filter with queue)
  socket.on('data', enqueueClientData)

  // PostgreSQL → Client (row filter — synchronous, drops DataRows not belonging to this database)
  pgStream.on('data', (data: Buffer) => {
    resetIdleTimer()
    const out = filter.filterFromServer(data)
    if (out.length > 0 && !socket.destroyed) socket.write(out)
  })

  pgStream.on('error', (err: Error) => {
    proxy.close()
  })

  pgStream.on('close', () => {
    if (idleTimer) clearTimeout(idleTimer)
    if (!socket.destroyed) socket.end()
  })

  socket.on('error', (err: Error) => {
    proxy.close()
  })

  socket.on('close', () => {
    if (idleTimer) clearTimeout(idleTimer)
    pgStream.destroy()
  })

  // Restore flowing mode (removing pg's 'data' listener may have paused the stream)
  pgStream.resume()

  return proxy
}
