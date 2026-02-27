const { Client } = require('pg');

/**
 * PostgreSQL LISTEN/NOTIFY listener for instant execution cache invalidation.
 *
 * Uses a dedicated pg.Client (not a Pool) because LISTEN sessions must be
 * held open — pool connections are recycled between requests and would drop
 * the active LISTEN subscription.
 *
 * Channel: 'execution_cache_invalidated'
 * Triggers: any INSERT/UPDATE/DELETE on:
 *   - function_environment_variables  (payload includes function_id)
 *   - project_network_policies        (payload includes project_id)
 *   - global_network_policies         (no extra ID — global flush)
 *
 * The onNotify callback receives the parsed payload object and is debounced
 * per unique key so that burst operations (e.g. bulk env var updates) collapse
 * into a single invalidation per affected function/project.
 */

const CHANNEL = 'execution_cache_invalidated';
const RECONNECT_DELAY_MS = 5000;
const DEBOUNCE_MS = 100;

let client = null;
let connected = false;
let stopped = false;
let onNotifyCallback = null;

// Debounce timers keyed by a string identifying the affected entity
// e.g. "function_environment_variables:uuid", "project_network_policies:uuid", "global_network_policies"
const debounceTimers = new Map();

function dbConfig() {
  return {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
  };
}

function scheduleInvalidation(payload) {
  const key =
    payload.table === 'function_environment_variables'
      ? `function_environment_variables:${payload.function_id}`
      : payload.table === 'project_network_policies'
        ? `project_network_policies:${payload.project_id}`
        : 'global_network_policies';

  if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));

  debounceTimers.set(
    key,
    setTimeout(async () => {
      debounceTimers.delete(key);
      if (onNotifyCallback) {
        console.log(`[ExecPgNotify] Invalidating cache for: ${key}`);
        try {
          await onNotifyCallback(payload);
        } catch (err) {
          console.error('[ExecPgNotify] Cache invalidation callback failed:', err.message);
        }
      }
    }, DEBOUNCE_MS),
  );
}

async function connectClient() {
  if (stopped) return;

  client = new Client(dbConfig());

  client.on('notification', (msg) => {
    if (msg.channel !== CHANNEL) return;
    try {
      const payload = msg.payload ? JSON.parse(msg.payload) : {};
      scheduleInvalidation(payload);
    } catch (err) {
      console.error('[ExecPgNotify] Failed to parse notification payload:', err.message);
    }
  });

  client.on('error', (err) => {
    console.error('[ExecPgNotify] Client error:', err.message);
    connected = false;
  });

  client.on('end', () => {
    connected = false;
    if (!stopped) {
      console.warn(
        `[ExecPgNotify] Connection ended unexpectedly — reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`,
      );
      setTimeout(connectClient, RECONNECT_DELAY_MS);
    }
  });

  try {
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    connected = true;
    console.log(`[ExecPgNotify] Listening on channel "${CHANNEL}"`);
  } catch (err) {
    console.error('[ExecPgNotify] Failed to connect:', err.message);
    connected = false;
    if (!stopped) {
      console.warn(`[ExecPgNotify] Retrying in ${RECONNECT_DELAY_MS / 1000}s...`);
      setTimeout(connectClient, RECONNECT_DELAY_MS);
    }
  }
}

/**
 * Start listening. Must be called after the main DB pool is connected.
 * @param {(payload: object) => Promise<void>} onNotify
 *        Called with the parsed notification payload on each cache-invalidation event.
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
  for (const timer of debounceTimers.values()) clearTimeout(timer);
  debounceTimers.clear();
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
