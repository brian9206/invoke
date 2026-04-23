// ============================================================================
// Normal Execution Flow — Execute user function
// ============================================================================

import path from 'path';
import { IpcChannel, type ResponseData, type RequestData } from './protocol';
import { createReqObject, createResObject, stateToResponseData } from './exchange';
import { KvClient } from './kv';
import { RealtimeClient } from './realtime';
import { installConsoleBridge } from './logger/console-bridge';
import { setupEnvironment } from './environment';

export async function runUserCode(
  entry: string,
  log: (...args: unknown[]) => void,
): Promise<void> {
  const startupTime = Date.now();
  log('[worker] Starting with entry=' + entry);

  // 1. Connect to the host runtime over the bind-mounted socket.
  const connectionStart = Date.now();
  const ipc = IpcChannel.getInstance();

  ipc.on('error', (err: Error) => {
    log('[worker] Socket error:', err);
    process.exit(1);
  });

  await ipc.connected;
  const connectionTime = Date.now() - connectionStart;
  log(`[worker] Connected (${connectionTime}ms)`);

  ipc.emit('payload');
  log('[worker] Requested payload from host');
  log('[worker] Waiting for payload...');

  // 2. Read the payload from the socket (first 'payload' event)
  const payloadStart = Date.now();
  const bootstrapPayload = await new Promise<any>((resolve, reject) => {
    ipc.once('payload', (payload: any) => {
      log('[worker] Got payload event');
      resolve(payload);
    });
    ipc.once('close', () => reject(new Error('Socket closed before payload received')));
  });
  const payloadTime = Date.now() - payloadStart;
  log(`[worker] Received payload (${payloadTime}ms)`);

  const request: RequestData = bootstrapPayload.request;

  // 3. Set up Console bridge
  const restoreConsole = installConsoleBridge(ipc);

  // 4. Setup environment
  setupEnvironment(ipc);

  // 5. Load and execute user function
  let resultSent = false;
  let response: ResponseData | undefined;
  let state: any;

  const sendExecuteResult = () => {
    if (!resultSent) {
      resultSent = true;
      if (!response) {
        response = stateToResponseData(state);
      }
      ipc.emit('execute_result', { response });
    }
  };

  const exitWithError = (message: string) => {
    ipc.end('worker_error', { error: message }).then(() => {
      log('[worker] Flush complete');
      process.exit(0);
    });

    setTimeout(() => {
      log('[worker] Force exiting after timeout');
      process.exit(0);
    }, 1000).unref();
  };

  try {
    const entryPath = `/app/${entry}`;

    // Polyfill require() for user functions that use CommonJS.
    const entryDir = path.dirname(entryPath);
    const userRequire = (id: string) => {
      if (id.startsWith('.')) {
        try {
          const resolved = Bun.resolveSync(id, entryDir);
          // @ts-ignore
          return Bun.require(resolved);
        } catch (e) {
          throw new Error(`Failed to resolve relative import "${id}" from ${entryDir}`);
        }
      }
      // @ts-ignore
      return Bun.require(id);
    };

    (globalThis as any).require = userRequire;

    const requireStart = Date.now();
    const userModule = await import(entryPath);
    const requireTime = Date.now() - requireStart;
    log(`[worker] Loaded module (${requireTime}ms)`);

    // ESM default export, or CJS module.exports (Bun wraps it as .default)
    const handler = userModule.default ?? userModule;

    if (typeof handler !== 'function') {
      throw new Error(
        `Module at ${entryPath} does not export a function. ` +
        `Got ${typeof handler === 'undefined' ? 'undefined' : typeof handler}.`,
      );
    }

    const req = createReqObject(request);
    const resObj = createResObject(req, () => {
      sendExecuteResult();
    });
    const res = resObj.res;
    state = resObj.state;

    const handlerStart = Date.now();
    try {
      const result = handler(req, res);
      if (result && typeof result.then === 'function') {
        await result;
      }
    } catch (err: any) {
      console.error('[worker] Unhandled error in user function:', err);
      exitWithError(err.message);
      return;
    }
    finally {
      restoreConsole();
    }

    const handlerTime = Date.now() - handlerStart;
    log(`[worker] Total code execution time: ${handlerTime}ms`);

    if (!state.finished) {
      res.status(204).end();
    }

    if (!resultSent) {
      sendExecuteResult();
    }
  } catch (err: any) {
    console.error('[worker] Failed to load user function module:', err);
    exitWithError('Failed to load user function module: ' + err.message);
    return;
  }

  const totalWorkerTime = Date.now() - startupTime;
  log(`[worker] Total worker time: ${totalWorkerTime}ms (conn=${connectionTime}ms, payload=${payloadTime}ms`);

  // Signal handler completion, then close socket and exit
  await ipc.end('execute_end', {});
  log('[worker] Flush complete');
  process.exit(0);
}
