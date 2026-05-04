// ============================================================================
// RealtimeNamespace — Callable class matching the original _realtime.js API
//
// Usage in user code (RealtimeNamespace is a global):
//   const ns = new RealtimeNamespace('/chat');
//   ns.socket.on('$connect', function () { ... });
//   module.exports = ns;
//
// The returned instance is itself a request handler function so it can be
// used directly as module.exports — when the gateway dispatches a socket event
// it arrives as an internal HTTP POST to /socket.io and ns._dispatch handles it.
// ============================================================================

import type { RealtimeClient } from './client'
import { BroadcastOperator } from './broadcast-operator'
import { SocketProxy } from './socket-proxy'

/**
 * Realtime namespace API for socket event handlers and broadcast operations.
 */
export interface InvokeRealtimeNamespace {
  /** Socket proxy for the currently connected client during event dispatch. */
  socket: SocketProxy
  /**
   * Target a room for broadcast operations.
   * @param room Room identifier.
   * @returns A chainable broadcast operator.
   */
  to(room: string): BroadcastOperator
  /**
   * Alias of `to(room)`.
   * @param room Room identifier.
   * @returns A chainable broadcast operator.
   */
  in(room: string): BroadcastOperator
  /**
   * Exclude a room from broadcast operations.
   * @param room Room identifier.
   * @returns A chainable broadcast operator.
   */
  except(room: string): BroadcastOperator
  /**
   * Emit an event to the namespace.
   * @param event Event name.
   * @param args Event payload arguments.
   * @returns A promise that resolves when the command is accepted.
   */
  emit(event: string, ...args: unknown[]): Promise<void>
}

// Module-level client reference — set once by setClient() before any
// RealtimeNamespace is constructed.
let _client: RealtimeClient

/** @internal */
export function setClient(client: RealtimeClient): void {
  _client = client
}

// ─── RealtimeNamespace (callable-class pattern) ──────────────────────────────
//
// Matches the original behaviour: `new RealtimeNamespace(...)` returns a
// function `rs` whose prototype chain is `RealtimeNamespace.prototype`, so it
// has both callable semantics (req, res, next) and full method access.

function RealtimeNamespaceFactory(this: any, namespace?: string): any {
  const client = _client

  // rs doubles as the express-compatible handler AND the namespace instance
  const rs: any = function (req: any, res: any, next?: any) {
    return rs._dispatch(req, res, next)
  }

  Object.setPrototypeOf(rs, (RealtimeNamespaceFactory as any).prototype)

  rs._namespace = namespace || null
  rs._client = client
  rs.socket = new SocketProxy(client, '', [], { headers: {}, query: {}, auth: {} }, rs._namespace)

  return rs
}

// ─── Namespace-level methods ─────────────────────────────────────────────────

RealtimeNamespaceFactory.prototype.to = function (room: string): BroadcastOperator {
  const ns: string | null = this._namespace
  if (!ns) throw new Error('RealtimeNamespace.to() requires an explicit namespace in standalone mode')
  return new BroadcastOperator(this._client as RealtimeClient, ns, [room], [], null)
}
;(RealtimeNamespaceFactory.prototype as any)['in'] = RealtimeNamespaceFactory.prototype.to

RealtimeNamespaceFactory.prototype.except = function (room: string): BroadcastOperator {
  const ns: string | null = this._namespace
  if (!ns) throw new Error('RealtimeNamespace.except() requires an explicit namespace in standalone mode')
  return new BroadcastOperator(this._client as RealtimeClient, ns, [], [room], null)
}

RealtimeNamespaceFactory.prototype.emit = function (event: string, ...args: unknown[]): Promise<void> {
  const ns: string | null = this._namespace
  if (!ns) throw new Error('RealtimeNamespace.emit() requires an explicit namespace in standalone mode')
  return (this._client as RealtimeClient).send({
    command: 'ns-emit',
    namespace: ns,
    event,
    args
  })
}

for (const method of ['join', 'leave']) {
  ;(RealtimeNamespaceFactory.prototype as any)[method] = function () {
    throw new Error(`${method}() is not available on namespace — use ns.socket.${method}() inside an event handler`)
  }
}

Object.defineProperty(RealtimeNamespaceFactory.prototype, 'broadcast', {
  get() {
    throw new Error('broadcast is not available on namespace — use ns.socket.broadcast inside an event handler')
  },
  configurable: true
})

// ─── Internal request dispatch ───────────────────────────────────────────────

RealtimeNamespaceFactory.prototype._dispatch = async function (req: any, res: any, next?: any): Promise<void> {
  const self = this
  const headers: Record<string, string> = (req && req.headers) || {}

  const isSocketRequest = (req && req.path) === '/socket.io' && !!headers['x-realtime-socket-event']

  if (!isSocketRequest) {
    if (typeof next === 'function') {
      return next()
    }
    if (!res.headersSent) {
      res.status(404).json({ success: false, error: 'Invalid usage for RealtimeNamespace' })
    }
    return
  }

  const event: string = headers['x-realtime-socket-event'] || '$connect'
  const socketId: string = headers['x-realtime-socket-id'] || ''
  const namespace: string = headers['x-realtime-socket-namespace'] || self._namespace || ''
  const disconnectReasonHeader: string | null = headers['x-realtime-socket-disconnect-reason'] || null

  let rooms: string[] = []
  try {
    rooms = JSON.parse(headers['x-realtime-socket-rooms'] || '[]')
  } catch (_) {}

  let handshake: Record<string, unknown> = {}
  try {
    handshake = JSON.parse(headers['x-realtime-socket-handshake'] || '{}')
  } catch (_) {}

  // Disconnect reason may arrive in a header (legacy) or embedded in handshake
  const disconnectReason: string | null =
    disconnectReasonHeader || (event === '$disconnect' ? ((handshake as any).disconnectReason ?? null) : null)

  self.socket._hydrate(socketId, rooms, handshake as any, namespace || null, disconnectReason)

  const handler: ((...args: unknown[]) => unknown) | undefined = self.socket._handlers[event]

  if (!handler) {
    if (!res.headersSent) {
      res.status(200).end()
    }
    return
  }

  // body from the gateway is the serialized eventData array
  const eventArgs: unknown[] = Array.isArray(req.body) ? req.body : []

  try {
    const result = handler(...eventArgs)
    if (result && typeof (result as any).then === 'function') {
      await result
    }
  } catch (err) {
    console.error(`[RealtimeNamespace] Unhandled error in "${event}" handler:`, err)
  }

  if (!res.headersSent) {
    res.status(200).end()
  }
}

// Export as a newable constructor — TypeScript sees it as `new (namespace?: string) => any`
export const RealtimeNamespace = RealtimeNamespaceFactory as unknown as new (
  namespace?: string
) => InvokeRealtimeNamespace
