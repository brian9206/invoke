import { createServiceDatabase } from 'invoke-shared'

type ServiceDatabase = ReturnType<typeof createServiceDatabase>

declare global {
  // eslint-disable-next-line no-var
  var __invokeDatabase: ServiceDatabase | undefined
}

// In Next.js dev mode, hot-reload re-evaluates modules on every file change.
// Using a global singleton prevents creating multiple Sequelize instances which
// can cause pool exhaustion and silent query failures (findByPk returning null).
const database: ServiceDatabase = globalThis.__invokeDatabase ?? createServiceDatabase({ poolMax: 20 })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__invokeDatabase = database
}

export default database
