require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');

const database = require('./services/database');
const routeCache = require('./services/route-cache');
const pgNotifyListener = require('./services/pg-notify-listener');
const healthRoutes = require('./routes/health');
const gatewayRoutes = require('./routes/gateway');

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

const PORT = parseInt(process.env.PORT || '3002');
const CACHE_REFRESH_INTERVAL = parseInt(process.env.CACHE_REFRESH_INTERVAL || '60000');

async function validateEnvironment() {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (!process.env.INTERNAL_GATEWAY_SECRET) {
    console.warn('[Gateway] WARNING: INTERNAL_GATEWAY_SECRET is not set. Requests to invoke-execution will not carry a signed x-invoke-data token. Set this variable in both gateway and execution to enable trusted header verification.');
  }
}

async function main() {
  await validateEnvironment();

  // Connect DB
  await database.connect();

  // Warm route cache
  await routeCache.forceRefresh();
  routeCache.start(CACHE_REFRESH_INTERVAL);

  // Start pg LISTEN for instant cache invalidation on any gateway data change
  await pgNotifyListener.connect(routeCache.forceRefresh);

  const app = express();

  // Security + compression
  app.use(helmet());
  app.use(compression());

  // Trust proxy
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', true);
  }

  // Parse raw body as Buffer (we re-stream it to the upstream)
  app.use(express.raw({ type: '*/*', limit: '50mb' }));

  // Request logging
  app.use((req, _res, next) => {
    console.log(
      `${new Date().toISOString()} - ${req.method} ${req.hostname}${req.path} - ${req.ip}`,
    );
    next();
  });

  // Routes
  app.use(healthRoutes);
  app.use(gatewayRoutes);

  // Start server
  const server = app.listen(PORT, () => {
    console.log(`[Gateway] Listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Gateway] Shutting down...');
    routeCache.stop();
    await pgNotifyListener.stop();
    await database.close();
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[Gateway] Fatal startup error:', err.message);
  process.exit(1);
});
