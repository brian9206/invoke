import { Op } from 'sequelize';
import { NextApiRequest, NextApiResponse } from 'next';
import { adminRequired } from '@/lib/middleware';
import database from '@/lib/database';
const bcrypt = require('bcrypt');
import { validatePasswordStrength } from '@/lib/utils';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return await getUsers(req, res);
    case 'POST':
      return await createUser(req, res);
    case 'PUT':
      return await updateUser(req, res);
    case 'DELETE':
      return await deleteUser(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get all users with their project counts
async function getUsers(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { User, ProjectMembership } = database.models

    const users = await User.findAll({
      attributes: [
        'id', 'username', 'email', 'is_admin', 'created_at', 'last_login',
        [database.sequelize.fn('COUNT', database.sequelize.col('ProjectMemberships.project_id')), 'project_count'],
      ],
      include: [{
        model: ProjectMembership,
        attributes: [],
        required: false,
      }],
      group: ['User.id'],
      order: [['created_at', 'DESC']],
      raw: false,
      nest: true,
    }) as any[]

    res.json({ users: users.map((u: any) => u.toJSON()) });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

// Create new user
async function createUser(req: NextApiRequest, res: NextApiResponse) {
  const { username, email, password, is_admin = false } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.success) {
    return res.status(400).json({ 
      error: passwordValidation.feedback,
      score: passwordValidation.score 
    });
  }

  try {
    const { User } = database.models;

    // Check if user already exists
    const existingUser = await User.findOne({
      where: { [Op.or]: [{ username }, { email }] },
      attributes: ['id']
    });
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const userRecord = await User.create({ username, email, password_hash: passwordHash, is_admin });
    const user = userRecord.get({ plain: true });
    // Remove password_hash from response
    const { password_hash: _, ...safeUser } = user;

    res.status(201).json({ user: safeUser });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
}

// Update user
async function updateUser(req: NextApiRequest, res: NextApiResponse) {
  const { id, username, email, is_admin, password } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Get current user ID from the request
  const currentUserId = (req as any).user?.userId;

  // Prevent users from changing their own password through this endpoint
  if (password && currentUserId && id === currentUserId) {
    return res.status(403).json({ 
      error: 'You cannot change your own password through user management. Please use the Profile Settings page.' 
    });
  }

  // Prevent users from removing their own admin rights
  if (typeof is_admin === 'boolean' && !is_admin && currentUserId && id === currentUserId) {
    return res.status(403).json({ 
      error: 'You cannot remove your own admin rights. Please use another admin account to modify your role.' 
    });
  }

  try {
    const { User } = database.models;
    const updateFields: Record<string, any> = { updated_at: new Date() };

    if (username) updateFields.username = username;
    if (email) updateFields.email = email;
    if (typeof is_admin === 'boolean') updateFields.is_admin = is_admin;

    if (password) {
      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.success) {
        return res.status(400).json({ 
          error: passwordValidation.feedback,
          score: passwordValidation.score 
        });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      updateFields.password_hash = passwordHash;
    }

    const [affectedCount] = await User.update(updateFields, { where: { id } });

    if (affectedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = await User.findByPk(id, { attributes: ['id', 'username', 'email', 'is_admin', 'updated_at'] });
    res.json({ user: updatedUser!.get({ plain: true }) });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
}

// Delete user
async function deleteUser(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Get current user ID from the request
  const currentUserId = (req as any).user?.userId;

  // Prevent users from deleting themselves
  if (currentUserId && id === currentUserId) {
    return res.status(403).json({ 
      error: 'You cannot delete your own account. Please use another admin account to delete this user.' 
    });
  }

  try {
    const { User, Function: FunctionModel } = database.models;

    // Check if user has deployed functions
    const functionCount = await FunctionModel.count({ where: { deployed_by: id } });

    if (functionCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete user who has deployed functions. Please reassign or delete functions first.' 
      });
    }

    // Check if user is the sole owner of any projects
    const { Project, ProjectMembership } = database.models

    // Find project IDs where this user is an owner
    const userOwnerMemberships = await ProjectMembership.findAll({
      where: { user_id: id, role: 'owner' },
      attributes: ['project_id'],
      raw: true,
    }) as any[]

    let soleOwnerProjects: any[] = []
    if (userOwnerMemberships.length > 0) {
      const ownedProjectIds = userOwnerMemberships.map((m: any) => m.project_id)
      // For each owned project, count how many owners exist — keep only those with exactly 1
      const ownerCounts = await ProjectMembership.findAll({
        where: { project_id: { [Op.in]: ownedProjectIds }, role: 'owner' },
        attributes: ['project_id', [database.sequelize.fn('COUNT', database.sequelize.col('user_id')), 'owner_count']],
        group: ['project_id'],
        raw: true,
      }) as any[]
      const soleOwnerProjectIds = ownerCounts
        .filter((r: any) => parseInt(r.owner_count) === 1)
        .map((r: any) => r.project_id)
      if (soleOwnerProjectIds.length > 0) {
        soleOwnerProjects = await Project.findAll({
          where: { id: { [Op.in]: soleOwnerProjectIds } },
          attributes: ['id', 'name'],
          raw: true,
        }) as any[]
      }
    }

    if (soleOwnerProjects.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete user who is the sole owner of projects. Please assign another owner first.',
        projects: soleOwnerProjects
      });
    }

    // Delete user (memberships will cascade)
    const deletedCount = await User.destroy({ where: { id } });

    if (deletedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
}

export default adminRequired(handler);
