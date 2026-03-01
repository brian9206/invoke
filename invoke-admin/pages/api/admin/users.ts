import { QueryTypes, Op } from 'sequelize';
import { NextApiRequest, NextApiResponse } from 'next';
import { adminRequired } from '@/lib/middleware';
const database = require('@/lib/database');
const bcrypt = require('bcrypt');
const { validatePasswordStrength } = require('@/lib/utils');

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
    const users = await database.sequelize.query(`
      SELECT 
        u.id, 
        u.username, 
        u.email, 
        u.is_admin,
        u.created_at,
        u.last_login,
        COUNT(pm.project_id) as project_count
      FROM users u
      LEFT JOIN project_memberships pm ON u.id = pm.user_id
      GROUP BY u.id, u.username, u.email, u.is_admin, u.created_at, u.last_login
      ORDER BY u.created_at DESC
    `, { type: QueryTypes.SELECT });
    
    res.json({ users });
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
    const { User, FunctionModel } = database.models;

    // Check if user has deployed functions
    const functionCount = await FunctionModel.count({ where: { deployed_by: id } });

    if (functionCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete user who has deployed functions. Please reassign or delete functions first.' 
      });
    }

    // Check if user is the sole owner of any projects
    const soleOwnerProjects = await database.sequelize.query(`
      SELECT p.id, p.name 
      FROM projects p
      WHERE p.id IN (
        SELECT pm.project_id 
        FROM project_memberships pm 
        WHERE pm.user_id = :userId AND pm.role = 'owner'
        GROUP BY pm.project_id
        HAVING COUNT(CASE WHEN role = 'owner' THEN 1 END) = 1
      )
    `, { replacements: { userId: id }, type: QueryTypes.SELECT });

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
