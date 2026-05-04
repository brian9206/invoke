import database from './database'

// Re-use the shared createProjectKV if available; otherwise build it here
const KeyvModule = require('keyv')
const Keyv = KeyvModule.default || KeyvModule
const { KeyvPostgres } = require('@keyv/postgres')

function calculateSize(key: string, value: unknown): number {
  const keySize = Buffer.byteLength(key, 'utf8')
  const valueStr = typeof value === 'string' ? value : JSON.stringify(value)
  const valueSize = Buffer.byteLength(valueStr, 'utf8')
  return keySize + valueSize
}

async function getProjectStorageUsage(projectId: string, kvStore: any): Promise<number> {
  try {
    let totalBytes = 0
    const allKeys = await kvStore.store.getMany(await kvStore.store.keys())

    for (const key of Object.keys(allKeys || {})) {
      const value = allKeys[key]
      totalBytes += Buffer.byteLength(key, 'utf8') + Buffer.byteLength(value, 'utf8')
    }
    return totalBytes
  } catch (error) {
    console.error('Error calculating KV storage usage:', error)
    throw error
  }
}

async function getStorageLimit(): Promise<number> {
  try {
    const { GlobalSetting } = database.models
    const setting = await GlobalSetting.findOne({
      where: { setting_key: 'kv_storage_limit_bytes' }
    })
    if (!setting) {
      return 1073741824 // Default 1GB
    }
    return parseInt((setting as any).setting_value)
  } catch (error) {
    console.error('Error fetching KV storage limit:', error)
    return 1073741824
  }
}

function createProjectKV(projectId: string): any {
  const config = database.getConnectionConfig()
  const connectionString = `postgresql://${config.user}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`

  const keyv = new Keyv({
    store: new KeyvPostgres({
      uri: connectionString,
      table: 'project_kv_store'
    }),
    namespace: projectId
  })

  keyv.on('error', (err: Error) => {
    console.error('KV Store Error:', err)
  })

  return keyv
}

export { createProjectKV, getProjectStorageUsage, getStorageLimit, calculateSize }
