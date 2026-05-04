// ============================================================================
// Normal Execution Flow — Execute user function
// ============================================================================

import path from 'path'
import { IpcChannel, type ResponseData, type RequestData } from './protocol'
import { createReqObject, createResObject, stateToResponseData } from './public-api/exchange'
import { installConsoleBridge } from './console-bridge'
import { setupEnvironment } from './environment'

export async function runUserCode(
  entry: string,
  bootstrapPayload: any,
  log: (...args: unknown[]) => void
): Promise<void> {
  const startupTime = Date.now()
  log('[worker] Starting with entry=' + entry)

  const ipc = IpcChannel.getInstance()
  const request: RequestData = bootstrapPayload.request

  // 1. Set up Console bridge
  const restoreConsole = installConsoleBridge(ipc)

  // 2. Setup environment
  setupEnvironment(ipc)

  // 3. Load and execute user function
  let resultSent = false
  let response: ResponseData | undefined
  let state: any

  const sendExecuteResult = () => {
    if (!resultSent) {
      resultSent = true
      if (!response) {
        response = stateToResponseData(state)
      }
      ipc.emit('execute_result', { response })
    }
  }

  const exitWithError = (message: string) => {
    ipc.end('worker_error', { error: message }).then(() => {
      log('[worker] Flush complete')
      process.exit(0)
    })

    setTimeout(() => {
      log('[worker] Force exiting after timeout')
      process.exit(0)
    }, 1000).unref()
  }

  try {
    const entryPath = `/app/${entry}`

    // Polyfill require() for user functions that use CommonJS.
    const entryDir = path.dirname(entryPath)
    const userRequire = (id: string) => {
      if (id.startsWith('.')) {
        try {
          const resolved = Bun.resolveSync(id, entryDir)
          // @ts-ignore
          return Bun.require(resolved)
        } catch (e) {
          throw new Error(`Failed to resolve relative import "${id}" from ${entryDir}`)
        }
      }
      // @ts-ignore
      return Bun.require(id)
    }

    ;(globalThis as any).require = userRequire

    const requireStart = Date.now()
    const userModule = await import(entryPath)
    const requireTime = Date.now() - requireStart
    log(`[worker] Loaded module (${requireTime}ms)`)

    // ESM default export, or CJS module.exports (Bun wraps it as .default)
    const handler = userModule.default ?? userModule

    if (typeof handler !== 'function') {
      throw new Error(
        `Module at ${entryPath} does not export a function. ` +
          `Got ${typeof handler === 'undefined' ? 'undefined' : typeof handler}.`
      )
    }

    const req = createReqObject(request)
    const resObj = createResObject(req, () => {
      sendExecuteResult()
    })
    const res = resObj.res
    state = resObj.state

    const handlerStart = Date.now()
    try {
      const result = handler(req, res)
      if (result && typeof result.then === 'function') {
        await result
      }
    } catch (err: any) {
      console.error('[worker] Unhandled error in user function:', err)
      exitWithError(err.message)
      return
    } finally {
      restoreConsole()
    }

    const handlerTime = Date.now() - handlerStart
    log(`[worker] Total code execution time: ${handlerTime}ms`)

    if (!state.finished) {
      res.status(204).end()
    }

    if (!resultSent) {
      sendExecuteResult()
    }
  } catch (err: any) {
    console.error('[worker] Failed to load user function module:', err)
    exitWithError('Failed to load user function module: ' + err.message)
    return
  }

  const totalWorkerTime = Date.now() - startupTime
  log(`[worker] Total worker time: ${totalWorkerTime}ms`)

  // Signal handler completion, then close socket and exit
  await ipc.end('execute_end', {})
  log('[worker] Flush complete')
  process.exit(0)
}
