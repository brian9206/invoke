// ============================================================================
// Worker Main — Per-invocation process (runs inside chroot, privileges
// already dropped by the C++ supervisor).
// Reads entry basename from argv, connects to the host runtime over the
// bind-mounted UDS, requests payload, executes user code, sends result back.
// ============================================================================

import net from 'net';
import { createRequire } from 'module';
import { EventDecoder, encode, type ParsedEvent, type RequestData } from './protocol';
import { createReqObject, createResObject, stateToResponseData } from './request-response';
import { KvClient } from './kv-client';
import { RealtimeClient } from './realtime-client';
import { installConsoleBridge } from './console-bridge';

// ---------------------------------------------------------------------------
// Read and sanitize argv
// ---------------------------------------------------------------------------

const IPC_SOCKET_PATH = '/run/events.sock';
const entry = process.argv[2];

// Immediately clear internal args so user code cannot see them
process.argv.splice(2);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startupTime = Date.now();
  console.error('[worker] Starting with entry=' + entry);

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
  console.error(`[worker] Connected (${connectionTime}ms) at ${IPC_SOCKET_PATH}`);
  
  ipcSocket.write(encode('payload'));
  console.error('[worker] Requested payload from host');
  console.error('[worker] Waiting for payload...');

  // 2. Read the payload from the socket (first newline-delimited JSON event)
  const payloadStart = Date.now();
  const decoder = new EventDecoder();
  const { request, env } = await new Promise<{ request: RequestData; env: Record<string, string> }>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      console.error('[worker] Received payload chunk: ' + chunk.length + ' bytes');
      const events = decoder.feed(chunk);
      for (const ev of events) {
        if (ev.event === 'payload') {
          console.error('[worker] Got payload event');
          ipcSocket.removeListener('data', onData);
          resolve({
            request: ev.payload.request,
            env: ev.payload.env ?? {},
          });
          return;
        }
      }
    };
    ipcSocket.on('data', onData);
    ipcSocket.once('error', (err) => {
      console.error('[worker] Socket error:', err);
      reject(err);
    });
    ipcSocket.once('close', () => reject(new Error('Socket closed before payload received')));
  });
  const payloadTime = Date.now() - payloadStart;
  console.error(`[worker] Received payload (${payloadTime}ms) with env keys: ${Object.keys(env).join(', ')}`);

  // 3. Inject user environment variables
  const injectedKeys: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
    injectedKeys.push(key);
  }

  // 4. Set up IPC clients
  const kvClient = new KvClient(ipcSocket);
  const realtimeClient = new RealtimeClient(ipcSocket);
  const restoreConsole = installConsoleBridge(ipcSocket);

  // 5. Expose KV and realtime on globalThis for user code
  (globalThis as any).kv = {
    get: (key: string) => kvClient.get(key),
    set: (key: string, value: unknown, ttl?: number) => kvClient.set(key, value, ttl),
    delete: (key: string) => kvClient.delete(key),
    clear: () => kvClient.clear(),
    has: (key: string) => kvClient.has(key),
  };

  (globalThis as any).realtime = {
    send: (cmd: Record<string, unknown>) => realtimeClient.send(cmd),
    emit: (ns: string, ev: string, ...args: unknown[]) => realtimeClient.emit(ns, ev, ...args),
    broadcast: (ns: string, ev: string, ...args: unknown[]) => realtimeClient.broadcast(ns, ev, ...args),
    join: (ns: string, room: string, sid: string) => realtimeClient.join(ns, room, sid),
    leave: (ns: string, room: string, sid: string) => realtimeClient.leave(ns, room, sid),
    emitToRoom: (ns: string, room: string, ev: string, ...args: unknown[]) =>
      realtimeClient.emitToRoom(ns, room, ev, ...args),
  };

  // 6. Route host → worker events (kv_result, realtime_result)
  ipcSocket.on('data', (chunk: Buffer) => {
    const events = decoder.feed(chunk);
    for (const ev of events) {
      routeHostEvent(ev, kvClient, realtimeClient);
    }
  });

  // 7. Load and execute user function
  let response;

  try {
    const entryPath = `/${entry}`;

    // Polyfill require() for user functions that use CommonJS.
    // Bun's native import() handles ESM/CJS loading, but globalThis.require
    // must be set so that user code calling require() at the top-level works.
    const userRequire = (id: string) => {
      // 1. Try to resolve relative to your entry path
      // Bun.resolveSync is the high-speed version of 'require.resolve'
      try {
        const resolved = Bun.resolveSync(id, import.meta.dir);
        return Bun.require(resolved);
      } catch (e) {
        // 2. Fallback to standard internal search
        return Bun.require(id);
      }
    };

    (globalThis as any).require = userRequire;
    
    const requireStart = Date.now();
    const userModule = await import(entryPath);
    const requireTime = Date.now() - requireStart;
    console.error(`[worker] Loaded module (${requireTime}ms)`);
    
    // ESM default export, or CJS module.exports (Bun wraps it as .default)
    const handler = userModule.default ?? userModule;

    if (typeof handler !== 'function') {
      throw new Error(
        `Module at ${entryPath} does not export a function. ` +
        `Got ${typeof handler === 'undefined' ? 'undefined' : typeof handler}.`,
      );
    }

    const req = createReqObject(request);
    const { res, state } = createResObject(req);

    const handlerStart = Date.now();
    try {
      const result = handler(req, res);
      if (result && typeof result.then === 'function') {
        await result;
      }
    } catch (err: any) {
      if (!state.finished) {
        res.status(500).json({
          error: 'Function execution error',
          message: err.message,
        });
      }
    }
    const handlerTime = Date.now() - handlerStart;
      console.error(`[worker] Total code execution time: ${handlerTime}ms`);

    // If handler returned without calling res.end/send/json, send 204
    if (!state.finished) {
      res.status(204).end();
    }

    // Send result back to host
    response = stateToResponseData(state);
  } catch (err: any) {
    response = {
      statusCode: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: Buffer.from(JSON.stringify({
        error: 'Failed to load function module',
        message: err.message,
      })).toString('base64'),
    };
  }

  restoreConsole();

  // 9. End IPC, then exit immediately.
  const payload = encode('execute_result', { response });

  ipcSocket.end(payload, () => {
    // The OS now has the data and the FIN signal
    console.error('[worker] Flush complete');
    
    // Violently exit the process via SIGKILL.
    process.kill(process.pid, 'SIGKILL');
  });

  setTimeout(() => {
    console.error('[worker] Force exiting after timeout');
    process.exit(0);
  }, 1000).unref();

  const totalWorkerTime = Date.now() - startupTime;
  console.error(`[worker] Total worker time: ${totalWorkerTime}ms (conn=${connectionTime}ms, payload=${payloadTime}ms`);
}

// ---------------------------------------------------------------------------
// Event routing
// ---------------------------------------------------------------------------

function routeHostEvent(ev: ParsedEvent, kv: KvClient, rt: RealtimeClient): void {
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

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
