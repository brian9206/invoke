import { NextApiResponse } from 'next';
import { AuthenticatedRequest, withAuth } from '@/lib/middleware';
import { checkProjectAccess } from '@/lib/project-access';
const { createResponse } = require('@/lib/utils');
const database = require('@/lib/database');
const KeyvModule = require('keyv');
const Keyv = KeyvModule.default || KeyvModule;
const { KeyvPostgres } = require('@keyv/postgres');

/**
 * KV Import API - Bulk import key-value pairs from JSON
 * POST - Import KV pairs with transaction support
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405));
  }

  try {
    await database.connect();

    const { id: projectId } = req.query;
    const { data, strategy = 'merge' } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Project ID is required', 400));
    }

    // Prevent system project access
    if (projectId === 'system') {
      return res.status(403).json(createResponse(false, null, 'KV store not available for system project', 403));
    }

    // Check project access (owner role required for import)
    const hasAccess = await checkProjectAccess(req.user!.id, projectId, req.user!.isAdmin);
    if (!hasAccess.allowed) {
      return res.status(403).json(createResponse(false, null, hasAccess.message, 403));
    }

    if (!hasAccess.canWrite) {
      return res.status(403).json(createResponse(false, null, 'Developer or owner role required for import operations', 403));
    }

    // Validate input data
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json(createResponse(false, null, 'Data must be a JSON object with key-value pairs', 400));
    }

    // Validate strategy
    if (strategy !== 'merge' && strategy !== 'replace') {
      return res.status(400).json(createResponse(false, null, 'Strategy must be either "merge" or "replace"', 400));
    }

    // Create Keyv instance for this project
    const kvStore = createKVStore(projectId);

    // Collect all current keys and values for quota calculation
    let currentUsage = 0;
    const currentEntries = new Map();

    for await (const [k, v] of kvStore.iterator()) {
      const vStr = typeof v === 'string' ? v : JSON.stringify(v);
      const size = Buffer.byteLength(k, 'utf8') + Buffer.byteLength(vStr, 'utf8');
      currentUsage += size;
      currentEntries.set(k, { value: v, size });
    }

    // If replace strategy, clear all existing keys first
    if (strategy === 'replace') {
      for (const k of currentEntries.keys()) {
        await kvStore.delete(k);
      }
      currentUsage = 0;
    }

    // Calculate total size of import data
    let totalImportSize = 0;
    const importEntries: Array<{ key: string; value: string }> = [];

    for (const [key, value] of Object.entries(data)) {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      const entrySize = Buffer.byteLength(key, 'utf8') + Buffer.byteLength(valueStr, 'utf8');
      totalImportSize += entrySize;
      importEntries.push({ key, value: valueStr });
    }

    // For merge strategy, subtract sizes of keys that will be replaced
    if (strategy === 'merge') {
      for (const entry of importEntries) {
        if (currentEntries.has(entry.key)) {
          currentUsage -= currentEntries.get(entry.key).size;
        }
      }
    }

    // Get storage limit
    const limitResult = await database.query(
      `SELECT setting_value FROM global_settings WHERE setting_key = 'kv_storage_limit_bytes'`
    );
    const limit = limitResult.rows.length > 0 ? parseInt(limitResult.rows[0].setting_value) : 1073741824;

    // Check if import would exceed quota
    const projectedUsage = currentUsage + totalImportSize;
    if (projectedUsage > limit) {
      const limitMB = (limit / (1024 * 1024)).toFixed(2);
      const projectedMB = (projectedUsage / (1024 * 1024)).toFixed(2);
      return res.status(413).json(createResponse(false, null, `Import would exceed storage quota. Projected usage: ${projectedMB}MB, Limit: ${limitMB}MB`, 413));
    }

    // Import all entries
    let imported = 0;
    let updated = 0;

    for (const entry of importEntries) {
      const existing = await kvStore.get(entry.key);
      if (existing !== undefined) {
        updated++;
      } else {
        imported++;
      }

      // Parse value if it's JSON
      let parsedValue;
      try {
        parsedValue = JSON.parse(entry.value);
      } catch {
        parsedValue = entry.value;
      }

      await kvStore.set(entry.key, parsedValue);
    }

    return res.status(200).json(createResponse(true, {
      imported,
      updated,
      total: imported + updated,
      strategy
    }, 'Import completed successfully', 200));

  } catch (error) {
    console.error('KV Import API error:', error);
    return res.status(500).json(createResponse(false, null, 'Failed to import KV store', 500));
  }
}

/**
 * Create Keyv instance for a project
 */
function createKVStore(projectId: string) {
  const config = database.pool.options;
  const connectionString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;

  return new Keyv({
    store: new KeyvPostgres({
      uri: connectionString,
      table: 'project_kv_store'
    }),
    namespace: projectId
  });
}

export default withAuth(handler);
