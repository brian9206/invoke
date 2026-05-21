import { IncomingMessage } from 'http'
import { WebSocket, createWebSocketStream } from 'ws'
import database from './database'
import { authenticateWsRequest } from './auth'
import { createPostgresProxy, PostgresProxy } from '../lib/pg-proxy'
import { scheduleQuotaCheck, onNextQuotaCheck } from '../lib/storage-quota'
import { decrypt } from '../lib/crypto'

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

  // Select credentials: internal connections with X-User-Type: app use the app user;
  // all other connections (API key auth) use the admin user.
  const useAppUser = auth.internal && (req.headers['x-user-type'] as string | undefined) === 'app'
  const dbUsername = useAppUser ? record.app_username : record.admin_username
  const dbPasswordEncrypted = useAppUser ? record.app_password_encrypted : record.admin_password_encrypted

  // Decrypt selected credentials
  let dbPassword: string
  try {
    dbPassword = decrypt(dbPasswordEncrypted)
  } catch (err) {
    console.error('[Proxy] Failed to decrypt credentials:', err)
    socket.destroy()
    ws.close(4500, 'Internal error: cannot decrypt credentials')
    return
  }

  // Create a mutable lock-state ref so the filter can see updated state during
  // the lifetime of a long-lived WS connection.
  const lockState = { isLocked: record.storage_locked === true }
  const projectId = auth.projectId

  // Called by the filter on every ReadyForQuery (= query cycle complete).
  // Schedules a debounced quota check and refreshes lockState when it resolves.
  const onQueryExecuted = () => {
    scheduleQuotaCheck(projectId)
    onNextQuotaCheck(projectId, async () => {
      try {
        const { ProjectDatabase } = database.models
        const fresh = await ProjectDatabase.findOne({ where: { project_id: projectId } })
        if (fresh) lockState.isLocked = fresh.storage_locked === true
      } catch (err) {
        console.error('[Proxy] Failed to refresh lockState:', err)
      }
    })
  }

  // Create the auth bridge — pg.Client authenticates with postgres, client gets AuthOk
  let proxy: PostgresProxy
  try {
    const proxyPromise = createPostgresProxy({
      options: {
        host: process.env.USERDATA_DB_HOST || 'localhost',
        port: parseInt(process.env.USERDATA_DB_PORT || '5432', 10),
        user: dbUsername,
        password: dbPassword,
        database: record.db_name,
        ssl: false
      },
      socket,
      lockState,
      onQueryExecuted
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
