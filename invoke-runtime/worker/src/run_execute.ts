// ============================================================================
// Normal Execution Flow — Execute user function
// ============================================================================

import path from 'path'
import { IpcChannel, type ResponseData, type RequestData } from './protocol'
import { createReqObject, createResObject, stateToResponseData } from './public-api/exchange'
import { installConsoleBridge } from './console-bridge'
import { loadUserCode, setupEnvironment } from './environment'

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
    const requireStart = Date.now()
    const handler = await loadUserCode('/app')
    const requireTime = Date.now() - requireStart

    log(`[worker] Loaded module (${requireTime}ms)`)

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
