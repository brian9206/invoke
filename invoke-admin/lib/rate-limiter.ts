/**
 * Rate Limiter for Brute Force Protection
 *
 * Tracks failed login attempts in the database (UNLOGGED table) keyed by
 * a composite of the normalised client IP and the lowercased username.
 * This survives service restarts and is shared across multiple instances.
 */

import proxyAddr from 'proxy-addr'
import type { IncomingMessage } from 'http'
import database from '@/lib/database'

// Configuration
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Extract the real client IP from an incoming request, honouring TRUST_PROXY.
 * Mirrors Express's req.ip behaviour.
 */
export function getClientIp(req: IncomingMessage): string {
  const val = process.env.TRUST_PROXY
  let trust: Parameters<typeof proxyAddr>[1]

  if (!val || val === 'false') {
    trust = () => false
  } else if (val === 'true') {
    trust = () => true
  } else {
    const n = Number(val)
    if (!isNaN(n)) {
      // Numeric hop count — trust that many proxies
      trust = (_addr: string, i: number) => i < n
    } else {
      trust = proxyAddr.compile(val.split(',').map((s) => s.trim()))
    }
  }

  return proxyAddr(req as any, trust) ?? 'unknown'
}

/**
 * Build the composite lookup key: "<ip>:<username-lowercase>"
 */
function buildKey(username: string, ip: string): string {
  return `${ip}:${username.toLowerCase()}`
}

/**
 * Record a failed login attempt for the given username + client IP.
 * Increments the counter atomically using a serialisable transaction.
 */
export async function recordFailedLogin(username: string, ip: string): Promise<void> {
  const { LoginAttempt } = database.models
  const key = buildKey(username, ip)
  const now = new Date()

  await database.sequelize.transaction(async (t: any) => {
    const record = await LoginAttempt.findOne({ where: { key }, lock: true, transaction: t })

    if (!record) {
      await LoginAttempt.create({ key, attempts: 1, last_attempt_at: now }, { transaction: t })
      return
    }

    const windowExpired = now.getTime() - new Date(record.last_attempt_at).getTime() > ATTEMPT_WINDOW_MS

    if (windowExpired) {
      await record.update(
        { attempts: 1, last_attempt_at: now, locked_until: null },
        { transaction: t }
      )
      return
    }

    const newAttempts = record.attempts + 1
    const lockedUntil = newAttempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : null
    await record.update({ attempts: newAttempts, last_attempt_at: now, locked_until: lockedUntil }, { transaction: t })
  })
}

/**
 * Record a successful login and clear all attempts for that username + IP.
 */
export async function recordSuccessfulLogin(username: string, ip: string): Promise<void> {
  const { LoginAttempt } = database.models
  const key = buildKey(username, ip)
  await LoginAttempt.destroy({ where: { key } })
}

/**
 * Check if the username + IP combination is currently locked out.
 * Lazily cleans up expired locks.
 */
export async function isAccountLocked(username: string, ip: string): Promise<boolean> {
  const { LoginAttempt } = database.models
  const key = buildKey(username, ip)
  const record = await LoginAttempt.findOne({ where: { key } })

  if (!record || !record.locked_until) return false

  const now = new Date()

  if (now > new Date(record.locked_until)) {
    await LoginAttempt.destroy({ where: { key } })
    return false
  }

  return true
}

/**
 * Get remaining lockout time in seconds for a username + IP.
 */
export async function getRemainingLockoutTime(username: string, ip: string): Promise<number> {
  const { LoginAttempt } = database.models
  const key = buildKey(username, ip)
  const record = await LoginAttempt.findOne({ where: { key } })

  if (!record || !record.locked_until) return 0

  const remaining = new Date(record.locked_until).getTime() - Date.now()
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}

/**
 * Get the current failed attempt count for a username + IP.
 */
export async function getFailedAttemptCount(username: string, ip: string): Promise<number> {
  const { LoginAttempt } = database.models
  const key = buildKey(username, ip)
  const record = await LoginAttempt.findOne({ where: { key } })

  if (!record) return 0

  const windowExpired = Date.now() - new Date(record.last_attempt_at).getTime() > ATTEMPT_WINDOW_MS
  if (windowExpired) {
    await LoginAttempt.destroy({ where: { key } })
    return 0
  }

  return record.attempts
}

/**
 * Clear all attempts for a username + IP.
 */
export async function clearAttempts(username: string, ip: string): Promise<void> {
  const { LoginAttempt } = database.models
  const key = buildKey(username, ip)
  await LoginAttempt.destroy({ where: { key } })
}

/**
 * Get lockout config for display purposes.
 */
export function getLockoutConfig() {
  return {
    maxAttempts: MAX_ATTEMPTS,
    lockoutDurationMinutes: LOCKOUT_DURATION_MS / 60000,
    attemptWindowMinutes: ATTEMPT_WINDOW_MS / 60000,
  }
}
