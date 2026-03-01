const createSubscriber = require('pg-listen');

/**
 * Factory that creates a named PostgreSQL LISTEN/NOTIFY subscriber.
 *
 * Handles connection management, automatic reconnection, and per-key
 * debouncing. Both the gateway and execution cache-invalidation listeners
 * are built on top of this factory.
 *
 * @param {string} channel  PostgreSQL NOTIFY channel to listen on.
 * @param {object} [options]
 * @param {(raw: any) => any}          [options.parsePayload]
 *   Called on the raw notification value before passing it to the callback
 *   and to getDebounceKey. Defaults to identity (pass-through).
 * @param {(payload: any) => string}   [options.getDebounceKey]
 *   Returns a string key used for per-key debouncing. When two notifications
 *   arrive for the same key within the debounce window only one callback fires.
 *   Defaults to a single shared key, collapsing all notifications together.
 * @param {number}                     [options.debounceMs=100]
 *   Debounce window in milliseconds.
 *
 * @returns {{ connect(onNotify: Function): Promise<void>, stop(): Promise<void>, isConnected(): boolean }}
 *
 * @example Gateway (single debounce, no payload):
 *   module.exports = createNotifyListener('gateway_invalidated');
 *
 * @example Execution (per-key debounce, JSON payload):
 *   module.exports = createNotifyListener('execution_cache_invalidated', {
 *     parsePayload: (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw || {}),
 *     getDebounceKey: (p) => p.table === 'function_environment_variables'
 *       ? `function_environment_variables:${p.function_id}`
 *       : p.table === 'project_network_policies'
 *         ? `project_network_policies:${p.project_id}`
 *         : 'global_network_policies',
 *   });
 */
function createNotifyListener(channel, {
  parsePayload = (raw) => raw,
  getDebounceKey = () => '__default__',
  debounceMs = 100,
} = {}) {
  const label = `[PgNotify:${channel}]`;
  let subscriber = null;
  let onNotifyCallback = null;
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

  function scheduleNotify(payload) {
    const key = getDebounceKey(payload);
    if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
    debounceTimers.set(
      key,
      setTimeout(async () => {
        debounceTimers.delete(key);
        if (onNotifyCallback) {
          console.log(`${label} Notifying — key: ${key}`);
          try {
            await onNotifyCallback(payload);
          } catch (err) {
            console.error(`${label} Callback error:`, err.message);
          }
        }
      }, debounceMs),
    );
  }

  return {
    /**
     * Start listening. pg-listen handles reconnection automatically.
     * @param {(payload: any) => Promise<void>} onNotify
     */
    async connect(onNotify) {
      onNotifyCallback = onNotify;
      subscriber = createSubscriber(dbConfig());

      subscriber.events.on('error', (err) => {
        console.error(`${label} Subscriber error:`, err.message);
      });

      subscriber.events.on('reconnect', (attempt) => {
        console.warn(`${label} Reconnecting (attempt ${attempt})...`);
      });

      subscriber.notifications.on(channel, (rawPayload) => {
        try {
          const payload = parsePayload(rawPayload);
          scheduleNotify(payload);
        } catch (err) {
          console.error(`${label} Failed to parse payload:`, err.message);
        }
      });

      await subscriber.connect();
      await subscriber.listenTo(channel);
      console.log(`${label} Listening`);
    },

    /** Stop listening and close the subscriber. */
    async stop() {
      for (const timer of debounceTimers.values()) clearTimeout(timer);
      debounceTimers.clear();
      if (subscriber) {
        try { await subscriber.close(); } catch (_) {}
        subscriber = null;
      }
    },

    /** Returns whether the subscriber is currently connected. */
    isConnected() {
      return subscriber !== null;
    },
  };
}

module.exports = { createNotifyListener };
