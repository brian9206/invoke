// ============================================================================
// SQL Bridge — Per-sandbox UDS server that proxies raw PostgreSQL bytes to
// invoke-sql's /sql/relay WebSocket endpoint using internal service auth.
// ============================================================================

import net from 'net'
import fs from 'fs/promises'
import { WebSocket } from 'ws'
import { joinUri } from 'invoke-shared/uri'

const SQL_SERVICE_URL = process.env.SQL_SERVICE_URL || 'http://invoke-sql:3000'

function getRelayUrl(): string {
  return joinUri(SQL_SERVICE_URL, '/sql/relay')
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://')
}

/**
 * Create a Unix domain socket server at `sockPath` that bridges raw
 * PostgreSQL wire-protocol bytes to invoke-sql's WebSocket relay.
 *
 * `getProjectId` is called on every new connection — if it returns null the
 * connection is immediately destroyed (sandbox is idle / no project assigned).
 */
export async function createSqlBridge(sockPath: string, getProjectId: () => string | null): Promise<net.Server> {
  const server = net.createServer(udsSocket => {
    const projectId = getProjectId()
    if (!projectId) {
      udsSocket.destroy()
      return
    }

    const internalSecret = process.env.INTERNAL_SERVICE_SECRET || ''

    const ws = new WebSocket(getRelayUrl(), {
      headers: {
        Authorization: `Bearer ${internalSecret}`,
        'X-Project-Id': projectId,
        'X-User-Type': 'app'
      }
    })

    ws.on('open', () => {
      // Forward raw bytes from postgres client → WebSocket
      udsSocket.on('data', chunk => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk, { binary: true })
        }
      })
    })

    // Forward raw bytes from WebSocket → postgres client
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      if (udsSocket.destroyed) return
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
      udsSocket.write(buf)
    })

    ws.on('error', err => {
      console.error('[SqlBridge] WebSocket error:', err.message)
      udsSocket.destroy()
    })

    ws.on('close', () => {
      udsSocket.destroy()
    })

    udsSocket.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'ECONNRESET') {
        console.error('[SqlBridge] UDS socket error:', err.message)
      }
      ws.terminate()
    })

    udsSocket.on('close', () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.terminate()
      }
    })
  })

  // Listen on the UDS path. The socket is created with 0700 (root-only) since
  // only the Docker bind-mount chain (which runs as root) needs host-level
  // access. The supervisor inside the chroot chowns/chmods the mounted path
  // to the worker UID with 0700 before the worker process starts.
  await new Promise<void>((resolve, reject) => {
    server.listen({ path: sockPath }, async () => {
      await fs.chown(sockPath, 65534, 65534)
      await fs.chmod(sockPath, 0o660)
      resolve()
    })
    server.on('error', reject)
  })
  await fs.chmod(sockPath, 0o700)

  server.on('error', err => {
    console.error('[SqlBridge] Server error:', err.message)
  })

  return server
}
