import { NextApiResponse } from 'next';
import { AuthenticatedRequest, withAuth } from '@/lib/middleware';
const { createResponse } = require('@/lib/utils');
const database = require('@/lib/database');
const KeyvModule = require('keyv');
const Keyv = KeyvModule.default || KeyvModule;
const { KeyvPostgres } = require('@keyv/postgres');

/**
 * KV Store API - CRUD operations for project key-value store
 * GET - List all keys and values
 * POST - Create or update a key-value pair
 * DELETE - Remove a key
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    await database.connect();

    const { id: projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Project ID is required', 400));
    }

    // Prevent system project access
    if (projectId === 'system') {
      return res.status(403).json(createResponse(false, null, 'KV store not available for system project', 403));
    }

    // Check project access
    const hasAccess = await checkProjectAccess(req.user!.id, projectId, req.user!.isAdmin);
    if (!hasAccess.allowed) {
      return res.status(403).json(createResponse(false, null, hasAccess.message, 403));
    }

    // Check role for write operations
    if (req.method === 'POST' || req.method === 'DELETE') {
      if (!hasAccess.canWrite) {
        return res.status(403).json(createResponse(false, null, 'Owner role required for write operations', 403));
      }
    }

    // Create Keyv instance for this project
    const kvStore = createKVStore(projectId);

    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, projectId, kvStore);
      case 'POST':
        return await handlePost(req, res, projectId, kvStore);
      case 'DELETE':
        return await handleDelete(req, res, projectId, kvStore);
      default:
        return res.status(405).json(createResponse(false, null, 'Method not allowed', 405));
    }
  } catch (error) {
    console.error('KV Store API error:', error);
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500));
  }
}

/**
 * Check if user has access to project
 */
async function checkProjectAccess(userId: number, projectId: string, isAdmin: boolean) {
  if (isAdmin) {
    return { allowed: true, canWrite: true };
  }

  try {
    const result = await database.query(
      'SELECT role FROM project_memberships WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    );

    if (result.rows.length === 0) {
      return { allowed: false, canWrite: false, message: 'Access denied: not a member of this project' };
    }

    const role = result.rows[0].role;
    return {
      allowed: true,
      canWrite: role === 'owner',
      role
    };
  } catch (error) {
    console.error('Error checking project access:', error);
    return { allowed: false, canWrite: false, message: 'Error checking access' };
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

/**
 * GET - List keys with values and storage info (with pagination)
 */
async function handleGet(req: AuthenticatedRequest, res: NextApiResponse, projectId: string, kvStore: any) {
  try {
    // Parse pagination params
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string) || '';
    const offset = (page - 1) * limit;

    // Collect all keys (for counting and filtering)
    let allItems = [];
    let totalBytes = 0;

    for await (const [key, value] of kvStore.iterator()) {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      const entrySize = Buffer.byteLength(key, 'utf8') + Buffer.byteLength(valueStr, 'utf8');
      totalBytes += entrySize;

      // Apply key filter if search query provided
      if (search && !key.toLowerCase().includes(search.toLowerCase())) {
        continue;
      }

      let parsedValue;
      try {
        parsedValue = JSON.parse(valueStr);
      } catch {
        parsedValue = value;
      }

      allItems.push({
        key,
        value: parsedValue,
        size: entrySize
      });
    }

    // Sort by key and paginate
    allItems.sort((a, b) => a.key.localeCompare(b.key));
    const paginatedItems = allItems.slice(offset, offset + limit);
    const totalFiltered = allItems.length;

    // Get storage limit from project
    const limitResult = await database.query(
      `SELECT kv_storage_limit_bytes FROM projects WHERE id = $1`,
      [projectId]
    );
    const storageLimit = limitResult.rows.length > 0 ? parseInt(limitResult.rows[0].kv_storage_limit_bytes) : 1073741824;

    return res.status(200).json(createResponse(true, {
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit)
      },
      storage: {
        bytes: totalBytes,
        limit: storageLimit,
        percentage: storageLimit > 0 ? (totalBytes / storageLimit) * 100 : 0
      }
    }, 'KV store retrieved successfully', 200));

  } catch (error) {
    console.error('Error getting KV store:', error);
    return res.status(500).json(createResponse(false, null, 'Failed to retrieve KV store', 500));
  }
}

/**
 * POST - Create or update a key-value pair
 */
async function handlePost(req: AuthenticatedRequest, res: NextApiResponse, projectId: string, kvStore: any) {
  try {
    const { key, value, ttl } = req.body;

    if (!key || typeof key !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Key is required and must be a string', 400));
    }

    if (value === undefined || value === null) {
      return res.status(400).json(createResponse(false, null, 'Value is required', 400));
    }

    // Calculate size of new entry
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    const newEntrySize = Buffer.byteLength(key, 'utf8') + Buffer.byteLength(valueStr, 'utf8');

    // Get current storage usage and limit
    let currentUsage = 0;
    for await (const [k, v] of kvStore.iterator()) {
      const vStr = typeof v === 'string' ? v : JSON.stringify(v);
      currentUsage += Buffer.byteLength(k, 'utf8') + Buffer.byteLength(vStr, 'utf8');
    }

    const limitResult = await database.query(
      `SELECT kv_storage_limit_bytes FROM projects WHERE id = $1`,
      [projectId]
    );
    const limit = limitResult.rows.length > 0 ? parseInt(limitResult.rows[0].kv_storage_limit_bytes) : 1073741824;

    // Check if key already exists
    const existingValue = await kvStore.get(key);
    if (existingValue !== undefined) {
      const existingStr = typeof existingValue === 'string' ? existingValue : JSON.stringify(existingValue);
      const oldEntrySize = Buffer.byteLength(key, 'utf8') + Buffer.byteLength(existingStr, 'utf8');
      currentUsage -= oldEntrySize;
    }

    // Check quota
    const projectedUsage = currentUsage + newEntrySize;
    if (projectedUsage > limit) {
      const limitMB = (limit / (1024 * 1024)).toFixed(2);
      const projectedMB = (projectedUsage / (1024 * 1024)).toFixed(2);
      return res.status(413).json(createResponse(false, null, `Storage quota exceeded. Projected usage: ${projectedMB}MB, Limit: ${limitMB}MB`, 413));
    }

    // Set the value
    await kvStore.set(key, value, ttl);

    return res.status(200).json(createResponse(true, { key, value }, 'Key-value pair saved successfully', 200));

  } catch (error) {
    console.error('Error setting KV pair:', error);
    return res.status(500).json(createResponse(false, null, 'Failed to save key-value pair', 500));
  }
}

/**
 * DELETE - Remove a key
 */
async function handleDelete(req: AuthenticatedRequest, res: NextApiResponse, projectId: string, kvStore: any) {
  try {
    const { key } = req.query;

    if (!key || typeof key !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Key is required', 400));
    }

    const existed = await kvStore.delete(key);

    return res.status(200).json(createResponse(true, { existed }, 'Key deleted successfully', 200));

  } catch (error) {
    console.error('Error deleting KV pair:', error);
    return res.status(500).json(createResponse(false, null, 'Failed to delete key', 500));
  }
}

export default withAuth(handler);
