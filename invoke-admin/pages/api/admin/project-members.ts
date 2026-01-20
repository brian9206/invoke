import { NextApiResponse } from 'next';
import { adminRequired, AuthenticatedRequest } from '@/lib/middleware';
const database = require('@/lib/database');

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return await getProjectMembers(req, res);
    case 'POST':
      return await addProjectMember(req, res);
    case 'PUT':
      return await updateMemberRole(req, res);
    case 'DELETE':
      return await removeMember(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get project members
async function getProjectMembers(req: AuthenticatedRequest, res: NextApiResponse) {
  const { projectId } = req.query;

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  try {
    const result = await database.query(`
      SELECT 
        pm.id,
        pm.role,
        pm.created_at,
        u.id as user_id,
        u.username,
        u.email,
        creator.username as added_by
      FROM project_memberships pm
      JOIN users u ON pm.user_id = u.id
      LEFT JOIN users creator ON pm.created_by = creator.id
      WHERE pm.project_id = $1
      ORDER BY pm.created_at ASC
    `, [projectId]);

    res.json({ members: result.rows });
  } catch (error) {
    console.error('Error fetching project members:', error);
    res.status(500).json({ error: 'Failed to fetch project members' });
  }
}

// Add member to project
async function addProjectMember(req: AuthenticatedRequest, res: NextApiResponse) {
  const { projectId, userId, role = 'viewer' } = req.body;
  const createdBy = req.user?.id;

  if (!projectId || !userId) {
    return res.status(400).json({ error: 'Project ID and User ID are required' });
  }

  if (!['owner', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be owner or viewer' });
  }

  try {
    // Check if user exists
    const userResult = await database.query('SELECT id, username FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if project exists
    const projectResult = await database.query('SELECT id, name FROM projects WHERE id = $1', [projectId]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if membership already exists
    const existingMembership = await database.query(
      'SELECT id FROM project_memberships WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (existingMembership.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a member of this project' });
    }

    // Add membership
    const result = await database.query(
      `INSERT INTO project_memberships (project_id, user_id, role, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, role, created_at`,
      [projectId, userId, role, createdBy]
    );

    const membership = result.rows[0];
    const user = userResult.rows[0];

    res.status(201).json({
      membership: {
        ...membership,
        user_id: userId,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Error adding project member:', error);
    res.status(500).json({ error: 'Failed to add project member' });
  }
}

// Update member role
async function updateMemberRole(req: AuthenticatedRequest, res: NextApiResponse) {
  const { membershipId, role } = req.body;

  if (!membershipId || !role) {
    return res.status(400).json({ error: 'Membership ID and role are required' });
  }

  if (!['owner', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be owner or viewer' });
  }

  try {
    const result = await database.query(
      `UPDATE project_memberships 
       SET role = $1 
       WHERE id = $2
       RETURNING id, role, project_id, user_id`,
      [role, membershipId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    res.json({ membership: result.rows[0] });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
}

// Remove member from project
async function removeMember(req: AuthenticatedRequest, res: NextApiResponse) {
  const { membershipId } = req.body;

  if (!membershipId) {
    return res.status(400).json({ error: 'Membership ID is required' });
  }

  try {
    // Get membership info before deletion
    const membershipResult = await database.query(
      'SELECT project_id, user_id, role FROM project_memberships WHERE id = $1',
      [membershipId]
    );

    if (membershipResult.rows.length === 0) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    const membership = membershipResult.rows[0];

    // Check if this is the last owner
    if (membership.role === 'owner') {
      const ownerCount = await database.query(
        'SELECT COUNT(*) as count FROM project_memberships WHERE project_id = $1 AND role = $2',
        [membership.project_id, 'owner']
      );

      if (parseInt(ownerCount.rows[0].count) <= 1) {
        return res.status(400).json({ 
          error: 'Cannot remove the last owner from project. Please assign another owner first.' 
        });
      }
    }

    // Delete membership
    await database.query('DELETE FROM project_memberships WHERE id = $1', [membershipId]);

    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
}

export default adminRequired(handler);
