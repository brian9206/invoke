import { NextApiRequest, NextApiResponse } from 'next';
import { adminRequired, AuthenticatedRequest } from '@/lib/middleware';
const database = require('@/lib/database');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return await getProjects(req, res);
    case 'POST':
      return await createProject(req, res);
    case 'PUT':
      return await updateProject(req, res);
    case 'DELETE':
      return await deleteProject(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get all projects with member counts
async function getProjects(req: NextApiRequest, res: NextApiResponse) {
  try {
    const result = await database.query(`
      SELECT 
        p.id, 
        p.name, 
        p.description, 
        p.is_active,
        p.kv_storage_limit_bytes,
        p.created_at,
        u.username as created_by,
        COUNT(pm.user_id) as member_count,
        COUNT(f.id) as function_count
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN project_memberships pm ON p.id = pm.project_id
      LEFT JOIN functions f ON p.id = f.project_id
      GROUP BY p.id, p.name, p.description, p.is_active, p.kv_storage_limit_bytes, p.created_at, u.username
      ORDER BY p.created_at DESC
    `);
    
    res.json({ projects: result.rows });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
}

// Create new project
async function createProject(req: AuthenticatedRequest, res: NextApiResponse) {
  const { name, description } = req.body;
  const userId = req.user?.id;

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    // Check if project name already exists
    const existingProject = await database.query(
      'SELECT id FROM projects WHERE name = $1',
      [name]
    );

    if (existingProject.rows.length > 0) {
      return res.status(400).json({ error: 'Project name already exists' });
    }

    // Get default KV storage limit from global settings
    const limitResult = await database.query(
      `SELECT setting_value FROM global_settings WHERE setting_key = 'kv_storage_limit_bytes'`
    );
    const defaultLimit = limitResult.rows.length > 0 ? parseInt(limitResult.rows[0].setting_value) : 1073741824;

    // Create project
    const projectResult = await database.query(
      `INSERT INTO projects (name, description, created_by, kv_storage_limit_bytes) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, name, description, created_at, kv_storage_limit_bytes`,
      [name, description || null, userId, defaultLimit]
    );

    const project = projectResult.rows[0];

    // Add creator as owner
    await database.query(
      `INSERT INTO project_memberships (project_id, user_id, role, created_by)
       VALUES ($1, $2, 'owner', $3)`,
      [project.id, userId, userId]
    );

    // Add default allow all security policies (IPv4 and IPv6)
    await database.query(
      `INSERT INTO project_network_policies (project_id, action, target_type, target_value, description, priority)
       VALUES ($1, 'allow', 'cidr', '0.0.0.0/0', 'Allow all public IPv4', 1),
              ($1, 'allow', 'cidr', '::/0', 'Allow all public IPv6', 2)`,
      [project.id]
    );

    res.status(201).json({ project });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
}

// Update project
async function updateProject(req: NextApiRequest, res: NextApiResponse) {
  const { id, name, description, is_active, kv_storage_limit_bytes } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'Project ID and name are required' });
  }

  try {
    const result = await database.query(
      `UPDATE projects 
       SET name = $1, description = $2, is_active = $3, kv_storage_limit_bytes = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, description, is_active, kv_storage_limit_bytes, updated_at`,
      [name, description || null, is_active ?? true, kv_storage_limit_bytes ?? 1073741824, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project: result.rows[0] });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
}

// Delete project
async function deleteProject(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  try {
    // Get all functions for the project
    const functionsResult = await database.query(
      'SELECT id FROM functions WHERE project_id = $1',
      [id]
    );

    const { deleteFunction } = require('@/lib/delete-utils')
    let totalDeletedPackages = 0

    // Delete each function using centralized helper (removes MinIO packages and DB rows)
    for (const fnRow of functionsResult.rows) {
      const functionId = fnRow.id
      try {
        const deleted = await deleteFunction(functionId)
        totalDeletedPackages += deleted || 0
      } catch (err) {
        console.error(`Failed to delete function ${functionId}:`, err)
        // continue deleting other functions/projects even if one fails
      }
    }

    // Delete project (memberships will cascade)
    const result = await database.query(
      'DELETE FROM projects WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ success: true, message: `Project deleted successfully (removed ${functionsResult.rows.length} functions and ${totalDeletedPackages} MinIO packages)` });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
}

export default adminRequired(handler);
