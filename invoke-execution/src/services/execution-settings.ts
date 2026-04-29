/**
 * execution-settings.ts
 *
 * Loads execution-related global settings (default/max timeout, default/max memory)
 * from the DB via Sequelize. Provides a cached singleton and an invalidation
 * function called by the `execution_settings_invalidated` pg-notify listener.
 */

import db from './database'

const FALLBACK_DEFAULT_TIMEOUT_S = 30
const FALLBACK_MAX_TIMEOUT_S = 60
const FALLBACK_DEFAULT_MEMORY_MB = 256
const FALLBACK_MAX_MEMORY_MB = 1024

export interface ExecutionSettings {
  defaultTimeoutMs: number // derived from defaultTimeoutSeconds * 1000
  maxTimeoutMs: number
  defaultMemoryMb: number
  maxMemoryMb: number
}

let cached: ExecutionSettings | null = null

async function loadFromDb(): Promise<ExecutionSettings> {
  const { GlobalSetting } = db.models
  const rows = await GlobalSetting.findAll({
    where: {
      setting_key: [
        'execution_default_timeout_seconds',
        'execution_max_timeout_seconds',
        'execution_default_memory_mb',
        'execution_max_memory_mb'
      ]
    },
    attributes: ['setting_key', 'setting_value']
  })

  const map: Record<string, string> = {}
  for (const row of rows as any[]) {
    map[row.setting_key] = row.setting_value
  }

  const defaultTimeout = parseInt(map['execution_default_timeout_seconds'] ?? String(FALLBACK_DEFAULT_TIMEOUT_S), 10)
  const maxTimeout = parseInt(map['execution_max_timeout_seconds'] ?? String(FALLBACK_MAX_TIMEOUT_S), 10)
  const defaultMemory = parseInt(map['execution_default_memory_mb'] ?? String(FALLBACK_DEFAULT_MEMORY_MB), 10)
  const maxMemory = parseInt(map['execution_max_memory_mb'] ?? String(FALLBACK_MAX_MEMORY_MB), 10)

  return {
    defaultTimeoutMs: (Number.isFinite(defaultTimeout) ? defaultTimeout : FALLBACK_DEFAULT_TIMEOUT_S) * 1000,
    maxTimeoutMs: (Number.isFinite(maxTimeout) ? maxTimeout : FALLBACK_MAX_TIMEOUT_S) * 1000,
    defaultMemoryMb: Number.isFinite(defaultMemory) ? defaultMemory : FALLBACK_DEFAULT_MEMORY_MB,
    maxMemoryMb: Number.isFinite(maxMemory) ? maxMemory : FALLBACK_MAX_MEMORY_MB
  }
}

export async function getExecutionSettings(): Promise<ExecutionSettings> {
  if (!cached) {
    cached = await loadFromDb()
  }
  return cached
}

/** Call this when the DB notifies that execution settings have changed. */
export function invalidateExecutionSettings(): void {
  cached = null
}

/** Load (or reload) settings and return them. */
export async function reloadExecutionSettings(): Promise<ExecutionSettings> {
  cached = await loadFromDb()
  return cached
}
