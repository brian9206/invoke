import { NextApiResponse } from 'next';
import { AuthenticatedRequest, withAuth } from '@/lib/middleware';
const { createResponse } = require('@/lib/utils');
const database = require('@/lib/database');
const KeyvModule = require('keyv');
const Keyv = KeyvModule.default || KeyvModule;
const { KeyvPostgres } = require('@keyv/postgres');

/**
 * KV Export API - Export all key-value pairs as JSON
 * GET - Export all KV pairs
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405));
  }

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

    // Check project access (viewer role is sufficient for export)
    const hasAccess = await checkProjectAccess(req.user!.id, projectId, req.user!.isAdmin);
    if (!hasAccess.allowed) {
      return res.status(403).json(createResponse(false, null, hasAccess.message, 403));
    }

    // Create Keyv instance for this project
    const kvStore = createKVStore(projectId);

    // Get all keys from Keyv using iterator
    const exportData: Record<string, any> = {};
    for await (const [key, value] of kvStore.iterator()) {
      // Parse value as JSON
      try {
        exportData[key] = JSON.parse(typeof value === 'string' ? value : JSON.stringify(value));
      } catch {
        exportData[key] = value;
      }
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="kv-export-${projectId}-${Date.now()}.json"`);
    
    return res.status(200).send(JSON.stringify(exportData, null, 2));

  } catch (error) {
    console.error('KV Export API error:', error);
    return res.status(500).json(createResponse(false, null, 'Failed to export KV store', 500));
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
 * Check if user has access to project
 */
async function checkProjectAccess(userId: number, projectId: string, isAdmin: boolean) {
  if (isAdmin) {
    return { allowed: true };
  }

  try {
    const result = await database.query(
      'SELECT role FROM project_memberships WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    );

    if (result.rows.length === 0) {
      return { allowed: false, message: 'Access denied: not a member of this project' };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking project access:', error);
    return { allowed: false, message: 'Error checking access' };
  }
}

export default withAuth(handler);
