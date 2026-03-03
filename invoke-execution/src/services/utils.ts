import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Validate and parse MAX_RESPONSE_LOG_SIZE environment variable
const parseMaxResponseLogSize = (): number => {
  const envValue = process.env.MAX_RESPONSE_LOG_SIZE;

  if (!envValue) {
    return 10 * 1024 * 1024; // Default 10MB
  }

  const parsed = parseInt(envValue, 10);

  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`MAX_RESPONSE_LOG_SIZE must be a positive integer, got: ${envValue}`);
  }

  return parsed;
};

const MAX_RESPONSE_LOG_SIZE = parseMaxResponseLogSize();

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message: string;
  statusCode: number;
  timestamp: string;
}

export interface LogExecutionOptions {
  requestSize?: number;
  responseSize?: number;
  clientIp?: string;
  userAgent?: string;
  consoleOutput?: unknown[];
  requestHeaders?: Record<string, unknown>;
  responseHeaders?: Record<string, string | string[]>;
  requestMethod?: string;
  requestUrl?: string;
  requestBody?: string;
  responseBody?: Buffer | string | unknown;
}

export function generateApiKey(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function generateFunctionId(): string {
  return crypto.randomUUID();
}

export function validateEnvironment(requiredVars: string[]): void {
  const missing = requiredVars.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 100);
}

export function createResponse<T = unknown>(
  success: boolean,
  data: T = null as unknown as T,
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

export async function logExecution(
  functionId: string,
  executionTime: number,
  statusCode: number,
  error: string | null = null,
  requestInfo: LogExecutionOptions = {},
): Promise<void> {
  const database = require('./database').default;

  try {
    let responseBodyLog = '';
    if (requestInfo.responseBody) {
      const contentType = (
        (requestInfo.responseHeaders?.['content-type'] as string) || ''
      ).toLowerCase();

      const isTextContent =
        contentType.startsWith('text/') ||
        contentType.includes('application/json') ||
        contentType.includes('application/xml') ||
        contentType.includes('application/javascript') ||
        contentType.includes('application/x-www-form-urlencoded') ||
        contentType.includes('+json') ||
        contentType.includes('+xml');

      if (isTextContent) {
        if (Buffer.isBuffer(requestInfo.responseBody)) {
          responseBodyLog = requestInfo.responseBody.toString('utf8');
        } else if (typeof requestInfo.responseBody === 'string') {
          responseBodyLog = requestInfo.responseBody;
        } else {
          responseBodyLog = JSON.stringify(requestInfo.responseBody);
        }

        if (responseBodyLog.length > MAX_RESPONSE_LOG_SIZE) {
          const sizeMB = (MAX_RESPONSE_LOG_SIZE / (1024 * 1024)).toFixed(1);
          responseBodyLog =
            responseBodyLog.substring(0, MAX_RESPONSE_LOG_SIZE) +
            `...<TRUNCATED at ${sizeMB}MB>`;
        }
      } else {
        responseBodyLog = '<BINARY>';
      }
    }

    const { ExecutionLog, Function: FunctionModel } = database.models;

    await ExecutionLog.create({
      function_id: functionId,
      status_code: statusCode,
      execution_time_ms: executionTime,
      request_size: requestInfo.requestSize || 0,
      response_size: requestInfo.responseSize || 0,
      error_message: error,
      client_ip: requestInfo.clientIp || null,
      user_agent: requestInfo.userAgent || null,
      console_logs: requestInfo.consoleOutput || [],
      request_headers: requestInfo.requestHeaders || {},
      response_headers: requestInfo.responseHeaders || {},
      request_body: requestInfo.requestBody || '',
      response_body: responseBodyLog,
      request_method: requestInfo.requestMethod || 'POST',
      request_url: requestInfo.requestUrl || '',
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
