import { IncomingMessage } from 'http'
import { WebSocket, createWebSocketStream } from 'ws'
import database from './database'
import { authenticateWsRequest } from './auth'
import { createPostgresProxy, PostgresProxy } from '../lib/pg-proxy'

const { decrypt } = require('invoke-shared')

/**
 * Handle a WebSocket upgrade for PostgreSQL protocol relay.
 * Authenticates the request via API key, looks up project database credentials,
 * then delegates to the pg-proxy auth bridge module.
 */
export async function handleWsUpgrade(ws: WebSocket, req: IncomingMessage): Promise<void> {
  // IMPORTANT: Create stream immediately and pause it so no incoming data is lost
  // during the async auth/lookup phase. Data from client (psql startup messages)
  // arrives as WebSocket messages and must be buffered until the proxy is ready.
  const socket = createWebSocketStream(ws, { allowHalfOpen: false })
  socket.pause()

  // Authenticate via API key + project membership
  const auth = await authenticateWsRequest(req)
  if (!auth.authenticated || !auth.projectId) {
    socket.destroy()
    ws.close(4001, auth.error || 'Authentication failed')
    return
  }

  // Look up project database record
  const { ProjectDatabase } = database.models
  const record = await ProjectDatabase.findOne({ where: { project_id: auth.projectId } })

  if (!record) {
    socket.destroy()
    ws.close(4004, 'Database not initialized for this project')
    return
  }

  if (record.status !== 'initialized') {
    socket.destroy()
    ws.close(4003, `Database is in '${record.status}' state`)
    return
  }

  // Decrypt admin credentials
  let adminPassword: string
  try {
    adminPassword = decrypt(record.admin_password_encrypted)
  } catch (err) {
    console.error('[Proxy] Failed to decrypt credentials:', err)
    socket.destroy()
    ws.close(4500, 'Internal error: cannot decrypt credentials')
    return
  }

  // Create the auth bridge — pg.Client authenticates with postgres, client gets AuthOk
  let proxy: PostgresProxy
  try {
    const proxyPromise = createPostgresProxy({
      options: {
        host: process.env.USERDATA_DB_HOST || 'localhost',
        port: parseInt(process.env.USERDATA_DB_PORT || '5432', 10),
        user: record.admin_username,
        password: adminPassword,
        database: record.db_name,
        ssl: false
      },
      socket
    })

    // Resume the stream now that handleClientStartup has its data listener attached
    socket.resume()

    proxy = await proxyPromise
  } catch (err: any) {
    console.error('[Proxy] Auth bridge failed:', err.message)
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(4500, 'Failed to connect to database')
    }
    return
  }

  // Additional WS-level teardown (the proxy already handles socket close events,
  // but we add WS error handling here for completeness)
  ws.on('error', err => {
    console.error('[Proxy] WebSocket error:', err.message)
    proxy.close()
  })
}
