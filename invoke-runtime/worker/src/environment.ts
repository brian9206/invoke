import fs from 'fs/promises'
import path from 'path'
import type { IIpcChannel } from './protocol'
import type { InvokeRequest, InvokeResponse } from './public-api/exchange'
import { setupKvGlobal } from './public-api/kv'
import { setupRealtimeGlobal } from './public-api/realtime'
import { setupRouterGlobal } from './public-api/router'
import { setupSleepGlobal } from './public-api/sleep'
import { setupLoggerGlobal } from './public-api/logger/pino'
import { setupBunSql } from './sql'

type NextFunction = (err?: any) => Promise<void> | void
type UserFunction = (req: InvokeRequest, res: InvokeResponse, next: NextFunction) => Promise<void> | void

export function setupEnvironment(ipc: IIpcChannel): void {
  // Expose Pino
  setupLoggerGlobal(ipc)

  // Expose sleep()
  setupSleepGlobal()

  // Expose KV on globalThis for user code
  setupKvGlobal(ipc)

  // Expose RealtimeNamespace class on globalThis for user code
  setupRealtimeGlobal(ipc)

  // Expose Router class on globalThis for user code
  setupRouterGlobal()

  // Patch Bun.sql
  setupBunSql()
}

export async function loadUserCode(packagePath: string): Promise<UserFunction> {
  // find index.js first
  let entryPoint = path.resolve(packagePath, 'index.js')

  try {
    await fs.access(entryPoint)
  } catch {
    // cannot find index.js. Try package.json's main field
    const pkgJson = JSON.parse(await fs.readFile(path.join(packagePath, 'package.json'), 'utf-8'))
    if (!pkgJson.main) {
      throw new Error(`Cannot find entry point. No index.js or main field in package.json`)
    }

    entryPoint = path.resolve(packagePath, pkgJson.main)
  }

  const userModule = await import(entryPoint)
  const handler = userModule.default ?? userModule

  if (typeof handler !== 'function') {
    throw new Error(
      `Module at ${entryPoint} does not export a function. ` +
        `Got ${typeof handler === 'undefined' ? 'undefined' : typeof handler}.`
    )
  }

  return handler
}
