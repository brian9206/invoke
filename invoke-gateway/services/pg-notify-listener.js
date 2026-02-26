const { Client } = require('pg');

/**
 * PostgreSQL LISTEN/NOTIFY listener for instant gateway cache invalidation.
 *
 * Uses a dedicated pg.Client (not a Pool) because LISTEN sessions must be
 * held open — pool connections are recycled between requests and would drop
 * the active LISTEN subscription.
 *
 * Channel: 'gateway_invalidated'
 * Triggers: any INSERT/UPDATE/DELETE on api_gateway_configs, api_gateway_routes,
 *           api_gateway_route_settings, and global_settings (api_gateway_domain only)
 *
 * The onNotify callback is debounced 100 ms so that burst operations like
 * route reordering (N simultaneous UPDATEs) collapse into a single refresh.
 */

const CHANNEL = 'gateway_invalidated';
const RECONNECT_DELAY_MS = 5000;
const DEBOUNCE_MS = 100;

let client = null;
let connected = false;
let stopped = false;
let debounceTimer = null;
let onNotifyCallback = null;

function dbConfig() {
  return {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
  };
}

function scheduleRefresh() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (onNotifyCallback) {
      console.log('[PgNotify] Received notification — refreshing gateway cache...');
      try {
        await onNotifyCallback();
      } catch (err) {
        console.error('[PgNotify] Cache refresh failed:', err.message);
      }
    }
  }, DEBOUNCE_MS);
}

async function connectClient() {
  if (stopped) return;

  client = new Client(dbConfig());

  client.on('notification', (msg) => {
    if (msg.channel === CHANNEL) scheduleRefresh();
  });

  client.on('error', (err) => {
    console.error('[PgNotify] Client error:', err.message);
    connected = false;
  });

  client.on('end', () => {
    connected = false;
    if (!stopped) {
      console.warn(`[PgNotify] Connection ended unexpectedly — reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
      setTimeout(connectClient, RECONNECT_DELAY_MS);
    }
  });

  try {
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    connected = true;
    console.log(`[PgNotify] Listening on channel "${CHANNEL}"`);
  } catch (err) {
    console.error('[PgNotify] Failed to connect:', err.message);
    connected = false;
    if (!stopped) {
      console.warn(`[PgNotify] Retrying in ${RECONNECT_DELAY_MS / 1000}s...`);
      setTimeout(connectClient, RECONNECT_DELAY_MS);
    }
  }
}

/**
 * Start listening. Must be called after the main DB pool is connected.
 * @param {() => Promise<void>} onNotify - callback invoked on cache invalidation
 */
async function connect(onNotify) {
  onNotifyCallback = onNotify;
  stopped = false;
  await connectClient();
}

/**
 * Stop listening and close the dedicated client.
 */
async function stop() {
  stopped = true;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (client) {
    try {
      await client.end();
    } catch (_) {
      // ignore errors during shutdown
    }
    client = null;
  }
  connected = false;
}

/**
 * Returns whether the LISTEN connection is currently active.
 */
function isConnected() {
  return connected;
}

module.exports = { connect, stop, isConnected };
