import { NextApiRequest, NextApiResponse } from 'next';
import { adminRequired } from '@/lib/middleware';
const database = require('@/lib/database');
const bcrypt = require('bcrypt');

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
    const result = await database.query(`
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
    `);
    
    res.json({ users: result.rows });
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

  try {
    // Check if user already exists
    const existingUser = await database.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await database.query(
      `INSERT INTO users (username, email, password_hash, is_admin) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, email, is_admin, created_at`,
      [username, email, passwordHash, is_admin]
    );

    const user = result.rows[0];
    
    res.status(201).json({ user });
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

  try {
    let updateQuery = 'UPDATE users SET updated_at = NOW()';
    const values = [];
    let valueIndex = 1;

    if (username) {
      updateQuery += `, username = $${valueIndex++}`;
      values.push(username);
    }

    if (email) {
      updateQuery += `, email = $${valueIndex++}`;
      values.push(email);
    }

    if (typeof is_admin === 'boolean') {
      updateQuery += `, is_admin = $${valueIndex++}`;
      values.push(is_admin);
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);
      updateQuery += `, password_hash = $${valueIndex++}`;
      values.push(passwordHash);
    }

    updateQuery += ` WHERE id = $${valueIndex} RETURNING id, username, email, is_admin, updated_at`;
    values.push(id);

    const result = await database.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
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

  try {
    // Check if user has deployed functions
    const functionsResult = await database.query(
      'SELECT COUNT(*) as count FROM functions WHERE deployed_by = $1',
      [id]
    );

    if (parseInt(functionsResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete user who has deployed functions. Please reassign or delete functions first.' 
      });
    }

    // Check if user is the sole owner of any projects
    const soleOwnerResult = await database.query(`
      SELECT p.id, p.name 
      FROM projects p
      WHERE p.id IN (
        SELECT pm.project_id 
        FROM project_memberships pm 
        WHERE pm.user_id = $1 AND pm.role = 'owner'
        GROUP BY pm.project_id
        HAVING COUNT(CASE WHEN role = 'owner' THEN 1 END) = 1
      )
    `, [id]);

    if (soleOwnerResult.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete user who is the sole owner of projects. Please assign another owner first.',
        projects: soleOwnerResult.rows
      });
    }

    // Delete user (memberships will cascade)
    const result = await database.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, username',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
}

export default adminRequired(handler);
