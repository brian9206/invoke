import database from '../services/database'
import { decrypt } from './crypto'

const { createProjectDbConnection } = require('invoke-shared')

// Per-project debounce timers (3 s)
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Callbacks to notify after a quota check completes (used by the WS relay
// to refresh its in-memory lock state)
const postCheckCallbacks = new Map<string, Set<() => void>>()

/**
 * Register a callback to be called after the next quota check for a project.
 * The callback is invoked once and then removed.
 */
export function onNextQuotaCheck(projectId: string, cb: () => void): void {
  let set = postCheckCallbacks.get(projectId)
  if (!set) {
    set = new Set()
    postCheckCallbacks.set(projectId, set)
  }
  set.add(cb)
}

/**
 * Schedule a storage quota check for the given project.
 * Multiple calls within 3 s are collapsed into a single check.
 * This function is fire-and-forget — callers must NOT await it.
 */
export function scheduleQuotaCheck(projectId: string): void {
  const existing = debounceTimers.get(projectId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    debounceTimers.delete(projectId)
    runQuotaCheck(projectId).catch(err => {
      console.error(`[StorageQuota] Check failed for project ${projectId}:`, err)
    })
  }, 3000)

  debounceTimers.set(projectId, timer)
}

async function runQuotaCheck(projectId: string): Promise<void> {
  const { ProjectDatabase, Project } = database.models

  const record = await ProjectDatabase.findOne({ where: { project_id: projectId } })
  if (!record || record.status !== 'initialized') return

  const project = await Project.findByPk(projectId, { attributes: ['sql_storage_limit_bytes'] })
  const limitBytes = project ? parseInt(project.sql_storage_limit_bytes, 10) : 1073741824

  // Connect as the postgres superuser so we can GRANT/REVOKE on behalf of any role
  const pool = createProjectDbConnection({
    database: record.db_name,
    user: process.env.USERDATA_DB_USER || 'postgres',
    password: process.env.USERDATA_DB_PASSWORD || 'postgres'
  })

  try {
    const sizeResult = await pool.query('SELECT pg_database_size(current_database()) AS size')
    const currentSize = parseInt(sizeResult.rows[0].size, 10)

    const isOverLimit = currentSize >= limitBytes
    const isLocked = record.storage_locked === true

    if (isOverLimit && !isLocked) {
      await lockDatabase(pool, record.admin_username, record.app_username)
      await record.update({ storage_locked: true })
      console.log(
        `[StorageQuota] Locked project ${projectId} (${(currentSize / 1024 / 1024).toFixed(1)} MB >= ${(limitBytes / 1024 / 1024).toFixed(1)} MB limit)`
      )
    } else if (!isOverLimit && isLocked) {
      await unlockDatabase(pool, record.admin_username, record.app_username)
      await record.update({ storage_locked: false })
      console.log(
        `[StorageQuota] Unlocked project ${projectId} (${(currentSize / 1024 / 1024).toFixed(1)} MB < ${(limitBytes / 1024 / 1024).toFixed(1)} MB limit)`
      )
    }
  } finally {
    await pool.end()
  }

  // Invoke and clear any registered post-check callbacks
  const callbacks = postCheckCallbacks.get(projectId)
  if (callbacks) {
    for (const cb of callbacks) cb()
    postCheckCallbacks.delete(projectId)
  }
}

async function lockDatabase(pool: any, adminUsername: string, appUsername: string): Promise<void> {
  const statements = [
    `REVOKE INSERT, UPDATE ON ALL TABLES IN SCHEMA public FROM "${adminUsername}"`,
    `REVOKE INSERT, UPDATE ON ALL TABLES IN SCHEMA public FROM "${appUsername}"`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE "${adminUsername}" IN SCHEMA public REVOKE INSERT, UPDATE ON TABLES FROM "${adminUsername}"`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE "${adminUsername}" IN SCHEMA public REVOKE INSERT, UPDATE ON TABLES FROM "${appUsername}"`
  ]
  for (const stmt of statements) {
    await pool.query(stmt)
  }
}

async function unlockDatabase(pool: any, adminUsername: string, appUsername: string): Promise<void> {
  const statements = [
    `GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO "${adminUsername}"`,
    `GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO "${appUsername}"`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE "${adminUsername}" IN SCHEMA public GRANT INSERT, UPDATE ON TABLES TO "${adminUsername}"`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE "${adminUsername}" IN SCHEMA public GRANT INSERT, UPDATE ON TABLES TO "${appUsername}"`
  ]
  for (const stmt of statements) {
    await pool.query(stmt)
  }
}
