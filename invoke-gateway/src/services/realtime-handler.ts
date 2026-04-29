import { Server, Socket } from 'socket.io'
import type routeCacheType from './route-cache'
import { authenticate } from './auth'
import { invokeRealtimeSocketFunction } from './realtime-execution'

type RouteCache = typeof routeCacheType

/**
 * Build a minimal Express-Request-compatible object from a Socket.IO handshake
 * so we can pass it to the existing authenticate() function.
 */
function buildFakeRequest(socket: Socket): Record<string, any> {
  const handshake = socket.handshake
  return {
    headers: {
      ...handshake.headers,
      authorization: handshake.auth?.token
        ? `Bearer ${handshake.auth.token}`
        : (handshake.headers?.authorization as string | undefined)
    },
    query: handshake.query || {},
    ip: handshake.address
  }
}

/**
 * Configure a dynamic Socket.IO namespace handler for all realtime namespaces
 * registered in the route cache.
 */
export function setupRealtimeHandler(io: Server, routeCache: RouteCache): void {
  // Match all namespaces dynamically
  const connectionHandler = async (socket: Socket) => {
    const namespacePath = socket.nsp.name
    const gatewayDomain = routeCache.getDefaultDomain()

    // Determine hostname from handshake headers
    const hostname = (socket.handshake.headers.host ?? '').split(':')[0]

    const resolved = routeCache.resolveRealtimeNamespace(hostname, namespacePath, gatewayDomain)

    if (!resolved) {
      // No matching namespace configured — disconnect immediately
      socket.disconnect(true)
      return
    }

    const { projectConfig, namespace } = resolved

    // Authenticate using the namespace's auth methods
    const fakeReq = buildFakeRequest(socket)
    const authResult = await authenticate(fakeReq as any, namespace.authMethods, namespace.authLogic)

    if (!authResult.authenticated) {
      socket.disconnect(true)
      return
    }

    // Store resolved context on socket for later use
    socket.data.projectConfig = projectConfig
    socket.data.namespace = namespace

    // Find and invoke the $connect event handler function
    const connectHandler = namespace.eventHandlers.find(eh => eh.eventName === '$connect')
    if (connectHandler?.functionId) {
      try {
        await invokeRealtimeSocketFunction(
          connectHandler.functionId,
          socket.id,
          namespacePath,
          Array.from(socket.rooms),
          buildHandshakeMeta(socket),
          '$connect',
          [],
          socket.handshake.address
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[RealtimeHandler] Error in $connect handler:`, message)
      }
    }

    // Register listeners for all other event handlers
    for (const eh of namespace.eventHandlers) {
      if (eh.eventName === '$connect' || eh.eventName === '$disconnect') continue
      if (!eh.functionId) continue

      const { functionId, eventName } = eh

      socket.on(eventName, async (...args: unknown[]) => {
        try {
          await invokeRealtimeSocketFunction(
            functionId,
            socket.id,
            namespacePath,
            Array.from(socket.rooms),
            buildHandshakeMeta(socket),
            eventName,
            args,
            socket.handshake.address
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[RealtimeHandler] Error in "${eventName}" handler:`, message)
        }
      })
    }

    // Disconnect handler
    socket.on('disconnect', async (reason: string) => {
      const disconnectHandler = namespace.eventHandlers.find(eh => eh.eventName === '$disconnect')
      if (!disconnectHandler?.functionId) return

      try {
        await invokeRealtimeSocketFunction(
          disconnectHandler.functionId,
          socket.id,
          namespacePath,
          [],
          { ...buildHandshakeMeta(socket), disconnectReason: reason },
          '$disconnect',
          [reason],
          socket.handshake.address
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[RealtimeHandler] Error in $disconnect handler:`, message)
      }
    })
  }

  io.on('connection', connectionHandler)
  io.of(/^\/.*/).on('connection', connectionHandler)

  console.log('[RealtimeHandler] Dynamic namespace handler registered')
}

function buildHandshakeMeta(socket: Socket): Record<string, any> {
  return {
    address: socket.handshake.address,
    query: socket.handshake.query,
    auth: socket.handshake.auth,
    headers: socket.handshake.headers,
    time: socket.handshake.time
  }
}
