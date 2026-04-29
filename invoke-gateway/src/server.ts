import 'dotenv/config'
import http from 'http'
import express from 'express'
import helmet from 'helmet'
import compression from 'compression'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/postgres-adapter'
import pg from 'pg'

import { createNotifyListener } from 'invoke-shared'
import database from './services/database'
import routeCache from './services/route-cache'
import healthRoutes from './routes/health'
import gatewayRoutes from './routes/gateway'
import realtimeSocketCommandRoute, { registerIo } from './routes/realtime-socket-command'
import { setupRealtimeHandler } from './services/realtime-handler'

const pgNotifyListener = createNotifyListener('gateway_invalidated')

/**
 * Invoke API Gateway Service
 *
 * Accepts external HTTP requests, resolves routes to upstream functions,
 * enforces per-route CORS / auth / method restrictions, and proxies to
 * invoke-execution.
 *
 * URL patterns supported:
 *   - <custom domain>/<route>
 *   - <API_GATEWAY_DOMAIN>/<project-slug>/<route>
 */

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const CACHE_REFRESH_INTERVAL = parseInt(process.env.CACHE_REFRESH_INTERVAL ?? '60000', 10)

async function validateEnvironment(): Promise<void> {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  if (!process.env.INTERNAL_SERVICE_SECRET) {
    console.warn(
      '[Gateway] WARNING: INTERNAL_SERVICE_SECRET is not set. Requests to invoke-execution will not carry a signed x-invoke-data token. Set this variable in both gateway and execution to enable trusted header verification.'
    )
  }
}

async function main(): Promise<void> {
  await validateEnvironment()

  // Warm route cache
  await routeCache.forceRefresh()
  routeCache.start(CACHE_REFRESH_INTERVAL)

  // Start pg LISTEN for instant cache invalidation on any gateway data change
  await pgNotifyListener.connect(routeCache.forceRefresh)

  const app = express()

  // Security + compression
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(compression())

  // Trust proxy
  let trustProxy: boolean | number | string = false
  if (process.env.TRUST_PROXY === 'true') {
    trustProxy = true
  } else if (process.env.TRUST_PROXY === 'false') {
    trustProxy = false
  } else if (process.env.TRUST_PROXY && !isNaN(Number(process.env.TRUST_PROXY))) {
    trustProxy = parseInt(process.env.TRUST_PROXY, 10)
  } else {
    trustProxy = process.env.TRUST_PROXY || false
  }
  app.set('trust proxy', trustProxy)

  // Parse raw body as Buffer (we re-stream it to the upstream)
  app.use(express.raw({ type: '*/*', limit: '50mb' }))

  // Request logging
  app.use((req, _res, next) => {
    if (req.path === '/health') return next() // skip health checks
    console.log(`${new Date().toISOString()} - ${req.method} ${req.hostname}${req.path} - ${req.ip}`)
    next()
  })

  // Routes
  app.use(healthRoutes)
  app.use(realtimeSocketCommandRoute)
  app.use(gatewayRoutes)

  // Create HTTP server and attach Socket.IO
  const server = http.createServer(app)

  const dbConfig = database.getConnectionConfig()
  const pgPool = new pg.Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    max: 5
  })

  const io = new Server(server, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling']
  })
  io.adapter(createAdapter(pgPool))

  registerIo(io)
  setupRealtimeHandler(io, routeCache)

  server.listen(PORT, () => {
    console.log(`[Gateway] Listening on port ${PORT}`)
  })

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log('[Gateway] Shutting down...')
    routeCache.stop()
    await pgNotifyListener.stop()
    await database.close()
    await pgPool.end()
    server.close(() => process.exit(0))
  }

  process.on('SIGTERM', () => void shutdown())
  process.on('SIGINT', () => void shutdown())
}

main().catch((err: Error) => {
  console.error('[Gateway] Fatal startup error:', err)
  process.exit(1)
})
