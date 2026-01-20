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
        p.created_at,
        u.username as created_by,
        COUNT(pm.user_id) as member_count,
        COUNT(f.id) as function_count
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN project_memberships pm ON p.id = pm.project_id
      LEFT JOIN functions f ON p.id = f.project_id
      GROUP BY p.id, p.name, p.description, p.is_active, p.created_at, u.username
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

    // Create project
    const projectResult = await database.query(
      `INSERT INTO projects (name, description, created_by) 
       VALUES ($1, $2, $3) 
       RETURNING id, name, description, created_at`,
      [name, description || null, userId]
    );

    const project = projectResult.rows[0];

    // Add creator as owner
    await database.query(
      `INSERT INTO project_memberships (project_id, user_id, role, created_by)
       VALUES ($1, $2, 'owner', $3)`,
      [project.id, userId, userId]
    );

    res.status(201).json({ project });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
}

// Update project
async function updateProject(req: NextApiRequest, res: NextApiResponse) {
  const { id, name, description, is_active } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'Project ID and name are required' });
  }

  try {
    const result = await database.query(
      `UPDATE projects 
       SET name = $1, description = $2, is_active = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, description, is_active, updated_at`,
      [name, description || null, is_active ?? true, id]
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
