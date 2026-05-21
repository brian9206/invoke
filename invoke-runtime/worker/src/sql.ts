import { SQL } from 'bun'
import { URL } from 'url'

export function setupBunSql() {
  const str = process.env.DATABASE_URL || 'sqlite://:memory:'

  try {
    const url = new URL(str)

    const params: SQL.Options = {
      adapter: url.protocol.substring(0, url.protocol.length - 1) as any,
      hostname: url.hostname,
      port: parseInt(url.port),
      database: url.pathname.substring(1),
      username: url.username,
      password: url.password
    }

    if (url.searchParams.get('path')) {
      params.path = url.searchParams.get('path')!
    }

    require('bun').sql = new SQL(params)
  } catch {
    try {
      require('bun').sql = new SQL(str)
    } catch {
      // ignore error after retry
    }
  }
}
