import crypto from 'crypto';
import bcrypt from 'bcrypt';

/**
 * Generate a secure API key
 */
function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash an API key for storage
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Hash a password using bcrypt
 */
async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a unique function ID
 */
function generateFunctionId(): string {
  return crypto.randomUUID();
}

/**
 * Validate environment variable name/value pairs
 */
function validateEnvironment(env: Record<string, string>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const validKeyRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;

  for (const key of Object.keys(env)) {
    if (!validKeyRegex.test(key)) {
      errors.push(`Invalid environment variable name: "${key}". Must start with a letter or underscore and contain only letters, numbers, and underscores.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format bytes as human-readable file size
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Sanitize a filename for safe file system use
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '_')
    .substring(0, 255);
}

/**
 * Create a standard API response object
 */
function createResponse(success: boolean, data?: any, error?: string): Record<string, any> {
  return {
    success,
    ...(data !== undefined ? { data } : {}),
    ...(error ? { error } : {}),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log function execution details
 */
function logExecution(functionId: string, executionId: string, duration: number, success: boolean): void {
  const status = success ? 'SUCCESS' : 'FAILURE';
  console.log(`[${new Date().toISOString()}] EXECUTE ${functionId} (execution: ${executionId}) - ${status} in ${duration}ms`);
}

export {
  generateApiKey,
  hashApiKey,
  hashPassword,
  verifyPassword,
  generateFunctionId,
  validateEnvironment,
  formatFileSize,
  sanitizeFilename,
  createResponse,
  logExecution,
};
