import { QueryTypes } from 'sequelize';
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
    const members = await database.sequelize.query(`
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
      WHERE pm.project_id = :projectId
      ORDER BY pm.created_at ASC
    `, { replacements: { projectId }, type: QueryTypes.SELECT });

    res.json({ members });
  } catch (error) {
    console.error('Error fetching project members:', error);
    res.status(500).json({ error: 'Failed to fetch project members' });
  }
}

// Add member to project
async function addProjectMember(req: AuthenticatedRequest, res: NextApiResponse) {
  const { projectId, userId, role = 'developer' } = req.body;
  const createdBy = req.user?.id;

  if (!projectId || !userId) {
    return res.status(400).json({ error: 'Project ID and User ID are required' });
  }

  if (!['owner', 'developer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be owner or developer' });
  }

  try {
    const { User, Project, ProjectMembership } = database.models;

    // Check if user exists
    const userRecord = await User.findByPk(userId, { attributes: ['id', 'username'] });
    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if project exists
    const projectRecord = await Project.findByPk(projectId, { attributes: ['id', 'name'] });
    if (!projectRecord) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if membership already exists
    const existingMembership = await ProjectMembership.findOne({
      where: { project_id: projectId, user_id: userId },
      attributes: ['id']
    });
    if (existingMembership) {
      return res.status(400).json({ error: 'User is already a member of this project' });
    }

    // Add membership
    const membership = await ProjectMembership.create({
      project_id: projectId,
      user_id: userId,
      role,
      created_by: createdBy
    });
    const membershipData = membership.get({ plain: true });

    res.status(201).json({
      membership: {
        id: membershipData.id,
        role: membershipData.role,
        created_at: membershipData.created_at,
        user_id: userId,
        username: userRecord.username
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

  if (!['owner', 'developer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be owner or developer' });
  }

  try {
    const { ProjectMembership } = database.models;
    const [affectedCount, updatedRows] = await ProjectMembership.update(
      { role },
      { where: { id: membershipId }, returning: true }
    );

    if (affectedCount === 0) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    res.json({ membership: updatedRows[0].get({ plain: true }) });
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
    const { ProjectMembership } = database.models;

    // Get membership info before deletion
    const membership = await ProjectMembership.findByPk(membershipId, {
      attributes: ['id', 'project_id', 'user_id', 'role']
    });

    if (!membership) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    // Check if this is the last owner
    if (membership.role === 'owner') {
      const ownerCount = await ProjectMembership.count({
        where: { project_id: membership.project_id, role: 'owner' }
      });

      if (ownerCount <= 1) {
        return res.status(400).json({ 
          error: 'Cannot remove the last owner from project. Please assign another owner first.' 
        });
      }
    }

    // Delete membership
    await membership.destroy();

    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
}

export default adminRequired(handler);
