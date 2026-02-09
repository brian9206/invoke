/**
 * Rate Limiter for Brute Force Protection
 * Tracks failed login attempts and locks accounts temporarily
 */

interface LoginAttempt {
  attempts: number
  lastAttempt: number
  lockedUntil?: number
}

// In-memory store for failed login attempts
// In production, consider using Redis
const loginAttempts = new Map<string, LoginAttempt>()

// Configuration
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Record a failed login attempt
 */
export function recordFailedLogin(username: string): void {
  const key = username.toLowerCase()
  const now = Date.now()
  
  const attempt = loginAttempts.get(key)
  
  if (!attempt) {
    loginAttempts.set(key, {
      attempts: 1,
      lastAttempt: now,
    })
  } else {
    // Reset attempts if outside window
    if (now - attempt.lastAttempt > ATTEMPT_WINDOW_MS) {
      loginAttempts.set(key, {
        attempts: 1,
        lastAttempt: now,
      })
    } else {
      attempt.attempts++
      attempt.lastAttempt = now
      
      // Lock account if max attempts exceeded
      if (attempt.attempts >= MAX_ATTEMPTS) {
        attempt.lockedUntil = now + LOCKOUT_DURATION_MS
      }
    }
  }
}

/**
 * Record a successful login and clear attempts
 */
export function recordSuccessfulLogin(username: string): void {
  const key = username.toLowerCase()
  loginAttempts.delete(key)
}

/**
 * Check if account is locked due to too many failed attempts
 */
export function isAccountLocked(username: string): boolean {
  const key = username.toLowerCase()
  const attempt = loginAttempts.get(key)
  
  if (!attempt || !attempt.lockedUntil) {
    return false
  }
  
  const now = Date.now()
  
  if (now > attempt.lockedUntil) {
    // Unlock account
    loginAttempts.delete(key)
    return false
  }
  
  return true
}

/**
 * Get remaining lockout time in seconds
 */
export function getRemainingLockoutTime(username: string): number {
  const key = username.toLowerCase()
  const attempt = loginAttempts.get(key)
  
  if (!attempt || !attempt.lockedUntil) {
    return 0
  }
  
  const now = Date.now()
  const remaining = attempt.lockedUntil - now
  
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}

/**
 * Get current failed attempt count
 */
export function getFailedAttemptCount(username: string): number {
  const key = username.toLowerCase()
  const attempt = loginAttempts.get(key)
  
  if (!attempt) {
    return 0
  }
  
  // Reset if outside window
  const now = Date.now()
  if (now - attempt.lastAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(key)
    return 0
  }
  
  return attempt.attempts
}

/**
 * Clear all attempts for a username
 */
export function clearAttempts(username: string): void {
  const key = username.toLowerCase()
  loginAttempts.delete(key)
}

/**
 * Get lockout config for display purposes
 */
export function getLockoutConfig() {
  return {
    maxAttempts: MAX_ATTEMPTS,
    lockoutDurationMinutes: LOCKOUT_DURATION_MS / 60000,
    attemptWindowMinutes: ATTEMPT_WINDOW_MS / 60000,
  }
}
