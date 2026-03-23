import crypto from 'crypto';
import database from './database';
import { hashPassword } from './utils';

interface AdminResult {
  id: unknown;
  username: string;
  email: string;
  password: string;
}

/**
 * Generate a random secure password
 */
function generatePassword(length = 16): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const randomBytes = crypto.randomBytes(length);
  let password = '';

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
}

/**
 * Check if any users exist in the database
 */
async function usersExist(): Promise<boolean> {
  try {
    const { User } = database.models;
    const count = await User.count();
    return (count as number) > 0;
  } catch (error) {
    console.error('Error checking users:', error);
    throw error;
  }
}

/**
 * Create default admin user with random password
 */
async function createDefaultAdmin(): Promise<AdminResult | null> {
  try {
    const hasUsers = await usersExist();

    if (hasUsers) {
      return null;
    }

    console.log('👤 No users found, creating default admin user...');

    const password = generatePassword(16);
    const passwordHash = await hashPassword(password);

    const { User } = database.models;
    const admin = await User.create({
      username: 'admin',
      email: 'admin@invoke.local',
      password_hash: passwordHash,
      is_admin: true,
    });

    console.log('\n' + '='.repeat(80));
    console.log('🎉 DEFAULT ADMIN USER CREATED');
    console.log('='.repeat(80));
    console.log('');
    console.log('  Username: admin');
    console.log('  Email:    admin@invoke.local');
    console.log(`  Password: ${password}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Save this password! It will not be shown again.');
    console.log('   You can change it after logging in.');
    console.log('');
    console.log('='.repeat(80) + '\n');

    return {
      id: admin.id,
      username: admin.username as string,
      email: admin.email as string,
      password,
    };
  } catch (error) {
    console.error('❌ Failed to create default admin user:', error);
    throw error;
  }
}

export { createDefaultAdmin };
