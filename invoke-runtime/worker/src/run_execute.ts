// ============================================================================
// Normal Execution Flow — Execute user function
// ============================================================================

import net from 'net';
import path from 'path';
import { EventDecoder, ResponseData, encode, type ParsedEvent, type RequestData } from './protocol';
import { createReqObject, createResObject, stateToResponseData } from './exchange';
import { KvClient } from './kv';
import { RealtimeClient } from './realtime';
import { installConsoleBridge } from './logger/console-bridge';
import { setupEnvironment } from './environment';

const IPC_SOCKET_PATH = '/run/events.sock';

export async function runUserCode(
  entry: string,
  log: (...args: unknown[]) => void,
): Promise<void> {
  const startupTime = Date.now();
  log('[worker] Starting with entry=' + entry);

  // 1. Connect to the host runtime over the bind-mounted socket.
  const connectionStart = Date.now();
  const ipcSocket = await new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection(IPC_SOCKET_PATH);
    const onError = (err: Error) => {
      socket.removeListener('connect', onConnect);
      reject(err);
    };
    const onConnect = () => {
      socket.removeListener('error', onError);
      resolve(socket);
    };

    socket.once('error', onError);
    socket.once('connect', onConnect);
  });
  const connectionTime = Date.now() - connectionStart;
  log(`[worker] Connected (${connectionTime}ms) at ${IPC_SOCKET_PATH}`);
  
  ipcSocket.write(encode('payload'));
  log('[worker] Requested payload from host');
  log('[worker] Waiting for payload...');

  // 2. Read the payload from the socket (first newline-delimited JSON event)
  const payloadStart = Date.now();
  const decoder = new EventDecoder();
  const bootstrapPayload = await new Promise<any>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      log('[worker] Received payload chunk: ' + chunk.length + ' bytes');
      const events = decoder.feed(chunk);
      for (const ev of events) {
        if (ev.event === 'payload') {
          log('[worker] Got payload event');
          ipcSocket.removeListener('data', onData);
          resolve(ev.payload);
          return;
        }
      }
    };
    ipcSocket.on('data', onData);
    ipcSocket.once('error', (err) => {
      log('[worker] Socket error:', err);
      reject(err);
    });
    ipcSocket.once('close', () => reject(new Error('Socket closed before payload received')));
  });
  const payloadTime = Date.now() - payloadStart;
  log(`[worker] Received payload (${payloadTime}ms)`);

  const request: RequestData = bootstrapPayload.request;

  // 3. Set up IPC clients
  const kvClient = new KvClient(ipcSocket);
  const realtimeClient = new RealtimeClient(ipcSocket);
  const restoreConsole = installConsoleBridge(ipcSocket);

  // 4. Setup environment
  setupEnvironment({ kvClient, realtimeClient, ipcSocket });

  // 5. Route host → worker events (kv_result, realtime_result)
  ipcSocket.on('data', (chunk: Buffer) => {
    const events = decoder.feed(chunk);
    for (const ev of events) {
      routeHostEvent(ev, kvClient, realtimeClient);
    }
  });

  // 6. Load and execute user function
  let resultSent = false;
  let response: ResponseData | undefined;
  let state: any; // Will be assigned in try block

  const sendExecuteResult = () => {
    if (!resultSent) {
      resultSent = true;
      if (!response) {
        response = stateToResponseData(state);
      }
      const payload = encode('execute_result', { response });
      ipcSocket.write(payload);
    }
  };

  const exitWithError = (message: string) => {
    ipcSocket.end(encode('worker_error', { error: message }), () => {
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
    // Bun's native import() handles ESM/CJS loading, but globalThis.require
    // must be set so that user code calling require() at the top-level works.
    const entryDir = path.dirname(entryPath);
    const userRequire = (id: string) => {
      // 1. If it's a relative import, resolve relative to the entry's directory
      if (id.startsWith('.')) {
        try {
          const resolved = Bun.resolveSync(id, entryDir);
          // @ts-ignore
          return Bun.require(resolved);
        } catch (e) {
          throw new Error(`Failed to resolve relative import "${id}" from ${entryDir}`);
        }
      }
      // 2. For bare package imports, use standard resolution
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
      // This callback is called when the user code calls res.end/send/json
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

    // If handler returned without calling res.end/send/json, send 204
    if (!state.finished) {
      res.status(204).end();
    }

    // If the result hasn't been sent yet (callback not called), send it now
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
  ipcSocket.end(encode('execute_end', {}), () => {
    log('[worker] Flush complete');
    process.exit(0);
  });

  setTimeout(() => {
    log('[worker] Force exiting after timeout');
    process.exit(0);
  }, 1000).unref();
}

export function routeHostEvent(ev: ParsedEvent, kv: KvClient, rt: RealtimeClient): void {
  switch (ev.event) {
    case 'kv_result':
      kv.handleResult(ev.payload);
      break;
    case 'realtime_result':
      rt.handleResult(ev.payload);
      break;
    default:
      break;
  }
}
