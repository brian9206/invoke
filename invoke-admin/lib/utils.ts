import crypto from 'crypto'
import bcrypt from 'bcrypt'
import zxcvbn from 'zxcvbn'

/**
 * Utility functions for Invoke Admin service
 */

export interface PasswordValidationResult {
  success: boolean
  score: number
  feedback: string | null
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T | null
  message: string
  statusCode: number
  timestamp: string
}

/** Generate a secure API key */
export function generateApiKey(length = 32): string {
  return crypto.randomBytes(length).toString('hex')
}

/** Hash an API key for secure storage */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

/** Hash a password for storage */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12
  return bcrypt.hash(password, saltRounds)
}

/** Verify a password against its hash */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/** Validate password strength using zxcvbn */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const result = zxcvbn(password)

  if (result.score < 3) {
    return {
      success: false,
      score: result.score,
      feedback:
        result.feedback.warning ||
        (result.feedback.suggestions.length > 0
          ? result.feedback.suggestions[0]
          : 'Password is too weak. Use a longer password with a mix of characters.')
    }
  }

  return {
    success: true,
    score: result.score,
    feedback: null
  }
}

/** Create a standardized API response */
export function createResponse<T = unknown>(
  success: boolean,
  data: T | null = null,
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
