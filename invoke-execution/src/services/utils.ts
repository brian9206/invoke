import crypto from 'crypto'
import bcrypt from 'bcrypt'

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  message: string
  statusCode: number
  timestamp: string
}

export function generateApiKey(length = 32): string {
  return crypto.randomBytes(length).toString('hex')
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12
  return await bcrypt.hash(password, saltRounds)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash)
}

export function generateFunctionId(): string {
  return crypto.randomUUID()
}

export function validateEnvironment(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => !process.env[varName])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 100)
}

export function createResponse<T = unknown>(
  success: boolean,
  data: T = null as unknown as T,
  message = '',
  statusCode = 200
): ApiResponse<T> {
  return {
    success,
    data,
    message,
    statusCode,
    timestamp: new Date().toISOString()
  }
}
