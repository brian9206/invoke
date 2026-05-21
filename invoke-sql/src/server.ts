import 'dotenv/config'
import http from 'http'
import express from 'express'
import { WebSocketServer } from 'ws'

import database from './services/database'
import { handleHealthRoute } from './routes/health'
import { handleWsUpgrade } from './services/proxy'
import databasesRouter from './routes/databases'
import { requireInternalServiceAuth } from './middleware/internal-auth'
import { warmUp as warmUpSqlFilter } from './lib/sql-filter'

const PORT = parseInt(process.env.PORT ?? '3000', 10)

async function validateEnvironment(): Promise<void> {
  const required = [
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'SQL_ENCRYPTION_KEY',
    'USERDATA_DB_HOST',
    'USERDATA_DB_PORT',
    'USERDATA_DB_USER',
    'USERDATA_DB_PASSWORD',
    'INTERNAL_SERVICE_SECRET'
  ]
  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

async function main(): Promise<void> {
  await validateEnvironment()
  await warmUpSqlFilter()

  const app = express()
  const server = http.createServer(app)
  app.use(express.json())

  // Health check
  app.get('/health', handleHealthRoute)
  app.use('/databases', requireInternalServiceAuth, databasesRouter)

  // WebSocket server for PostgreSQL relay
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    // Only accept upgrades on /sql/relay path
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    if (url.pathname === '/sql/relay') {
      wss.handleUpgrade(request, socket, head, ws => {
        handleWsUpgrade(ws, request)
      })
    } else {
      socket.destroy()
    }
  })

  server.listen(PORT, () => {
    console.log(`[SQL Service] Running on port ${PORT}`)
  })

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[SQL Service] Shutting down...')
    wss.close()
    server.close()
    await database.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch(err => {
  console.error('[SQL Service] Fatal error:', err)
  process.exit(1)
})
