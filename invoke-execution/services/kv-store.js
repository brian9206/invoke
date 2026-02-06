/**
 * KV Store Service for Project-Scoped Key-Value Storage
 * Provides Keyv-backed storage with PostgreSQL persistence
 * and quota enforcement
 */

const KeyvModule = require('keyv');
const Keyv = KeyvModule.default || KeyvModule;
const { KeyvPostgres } = require('@keyv/postgres');
const database = require('./database');

/**
 * Calculate the storage size of a key-value pair in bytes
 * @param {string} key - The key
 * @param {*} value - The value (will be JSON stringified)
 * @returns {number} Size in bytes
 */
function calculateSize(key, value) {
  const keySize = Buffer.byteLength(key, 'utf8');
  const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
  const valueSize = Buffer.byteLength(valueStr, 'utf8');
  return keySize + valueSize;
}

/**
 * Get total storage used by a project's KV store
 * @param {string} projectId - The project UUID
 * @param {object} kvStore - The Keyv instance for the project
 * @returns {Promise<number>} Total bytes used
 */
async function getProjectStorageUsage(projectId, kvStore) {
  try {
    let totalBytes = 0;
    const allKeys = await kvStore.store.getMany(await kvStore.store.keys());
    
    for (const key of Object.keys(allKeys || {})) {
      const value = allKeys[key];
      totalBytes += Buffer.byteLength(key, 'utf8') + Buffer.byteLength(value, 'utf8');
    }
    return totalBytes;
  } catch (error) {
    console.error('Error calculating KV storage usage:', error);
    throw error;
  }
}

/**
 * Get the storage limit from global settings
 * @returns {Promise<number>} Storage limit in bytes
 */
async function getStorageLimit() {
  try {
    const result = await database.query(
      `SELECT setting_value FROM global_settings WHERE setting_key = 'kv_storage_limit_bytes'`
    );
    if (result.rows.length === 0) {
      return 1073741824; // Default 1GB if not set
    }
    return parseInt(result.rows[0].setting_value);
  } catch (error) {
    console.error('Error fetching KV storage limit:', error);
    return 1073741824; // Default 1GB on error
  }
}

/**
 * Create a project-scoped KV store with quota enforcement
 * @param {string} projectId - The project UUID
 * @param {object} dbPool - PostgreSQL connection pool
 * @returns {object} Keyv-compatible KV store interface
 */
function createProjectKV(projectId, dbPool) {
  // Build PostgreSQL connection string from pool config
  const config = dbPool.options;
  const connectionString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
  
  // Create Keyv instance with PostgreSQL backend and project namespace
  const keyv = new Keyv({
    store: new KeyvPostgres({
      uri: connectionString,
      table: 'project_kv_store'
    }),
    namespace: projectId // Automatically prefixes all keys with projectId
  });

  // Handle connection errors
  keyv.on('error', (err) => {
    console.error('KV Store Error:', err);
  });

  // Return Keyv instance (quota enforcement happens in admin APIs)
  return keyv;
}

module.exports = {
  createProjectKV,
  getProjectStorageUsage,
  getStorageLimit,
  calculateSize
};
