/**
 * Project Access Utilities
 * Shared functions for checking project membership and permissions
 */

const database = require('@/lib/database');

export interface ProjectAccessResult {
  allowed: boolean;
  canWrite: boolean;
  message?: string;
  role?: string;
}

/**
 * Check if user has access to project
 * @param userId - User ID
 * @param projectId - Project ID
 * @param isAdmin - Whether user is a global admin
 * @returns Object with access info: { allowed, canWrite, message?, role? }
 */
export async function checkProjectAccess(
  userId: number,
  projectId: string,
  isAdmin: boolean
): Promise<ProjectAccessResult> {
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
      canWrite: role === 'owner' || role === 'developer',
      role
    };
  } catch (error) {
    console.error('Error checking project access:', error);
    return { allowed: false, canWrite: false, message: 'Error checking access' };
  }
}

/**
 * Check if user has owner or admin access to project
 * Useful for operations that require owner-level permissions
 * @param userId - User ID
 * @param projectId - Project ID
 * @param isAdmin - Whether user is a global admin
 * @returns Object with access info: { allowed, message? }
 */
export async function checkProjectOwnerAccess(
  userId: number,
  projectId: string,
  isAdmin: boolean
): Promise<{ allowed: boolean; message?: string }> {
  if (isAdmin) {
    return { allowed: true };
  }

  try {
    const result = await database.query(
      'SELECT role FROM project_memberships WHERE user_id = $1 AND project_id = $2 AND role = $3',
      [userId, projectId, 'owner']
    );

    if (result.rows.length === 0) {
      return { allowed: false, message: 'Only project owners can perform this action' };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking project owner access:', error);
    return { allowed: false, message: 'Error checking access' };
  }
}

/**
 * Check if user has developer or owner access to project
 * @param userId - User ID
 * @param projectId - Project ID
 * @param isAdmin - Whether user is a global admin
 * @returns Object with access info: { allowed, message? }
 */
export async function checkProjectDeveloperAccess(
  userId: number,
  projectId: string,
  isAdmin: boolean
): Promise<{ allowed: boolean; message?: string }> {
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

    const role = result.rows[0].role;
    if (role !== 'owner' && role !== 'developer') {
      return { allowed: false, message: 'Developer or owner role required' };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking project developer access:', error);
    return { allowed: false, message: 'Error checking access' };
  }
}
