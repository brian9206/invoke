import crypto from 'crypto';
import bcrypt from 'bcrypt';
import zxcvbn from 'zxcvbn';
import database from '@/lib/database';

/**
 * Utility functions for Invoke Admin service
 */

export interface PasswordValidationResult {
  success: boolean;
  score: number;
  feedback: string | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
  statusCode: number;
  timestamp: string;
}

export interface LogExecutionOptions {
  requestSize?: number;
  responseSize?: number;
  clientIp?: string | null;
  userAgent?: string | null;
}

/** Generate a secure API key */
export function generateApiKey(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/** Hash an API key for secure storage */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/** Hash a password for storage */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/** Verify a password against its hash */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Validate password strength using zxcvbn */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const result = zxcvbn(password);

  if (result.score < 3) {
    return {
      success: false,
      score: result.score,
      feedback:
        result.feedback.warning ||
        (result.feedback.suggestions.length > 0
          ? result.feedback.suggestions[0]
          : 'Password is too weak. Use a longer password with a mix of characters.'),
    };
  }

  return {
    success: true,
    score: result.score,
    feedback: null,
  };
}

/** Generate a unique function ID */
export function generateFunctionId(): string {
  return crypto.randomUUID();
}

/** Validate environment variables */
export function validateEnvironment(requiredVars: string[]): void {
  const missing = requiredVars.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/** Format file size in human readable format */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/** Sanitize filename for filesystem storage */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 100);
}

/** Create a standardized API response */
export function createResponse<T = unknown>(
  success: boolean,
  data: T | null = null,
  message = '',
  statusCode = 200,
): ApiResponse<T> {
  return {
    success,
    data,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
  };
}

/** Log execution metrics to the database */
export async function logExecution(
  functionId: string,
  executionTime: number,
  statusCode: number,
  error: string | null = null,
  requestInfo: LogExecutionOptions = {},
): Promise<void> {
  const { ExecutionLog, Function: FunctionModel } = database.models;

  try {
    await ExecutionLog.create({
      function_id: functionId,
      status_code: statusCode,
      execution_time_ms: executionTime,
      request_size: requestInfo.requestSize ?? 0,
      response_size: requestInfo.responseSize ?? 0,
      error_message: error,
      client_ip: requestInfo.clientIp ?? null,
      user_agent: requestInfo.userAgent ?? null,
    });

    await FunctionModel.update(
      {
        execution_count: database.sequelize.literal('execution_count + 1'),
        last_executed: new Date(),
      },
      { where: { id: functionId } },
    );
  } catch (dbError) {
    console.error('Failed to log execution:', dbError);
  }
}

/** Get the function base URL from global settings */
export async function getFunctionBaseUrl(): Promise<string> {
  try {
    const { GlobalSetting } = database.models;
    const setting = await GlobalSetting.findOne({
      where: { setting_key: 'function_base_url' },
    });

    if (setting) {
      return (setting.setting_value as string).replace(/\/+$/, '');
    }

    return 'https://localhost:3001/invoke';
  } catch (error) {
    console.error('Failed to get function base URL:', error);
    return 'https://localhost:3001/invoke';
  }
}

/** Generate a complete function URL */
export async function getFunctionUrl(functionId: string): Promise<string> {
  const baseUrl = await getFunctionBaseUrl();
  return `${baseUrl}/${functionId}`;
}
