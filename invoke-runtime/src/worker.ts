// ============================================================================
// Worker — Per-invocation process. Connects IPC, chroots into the overlay
// jail, drops privileges, then loads and executes user code.
// ============================================================================

import net from 'net';
import chroot from 'chroot';
import { EventDecoder, encode, type ParsedEvent, type RequestData } from './protocol';
import { createReqObject, createResObject, stateToResponseData } from './request-response';
import { KvClient } from './kv-client';
import { RealtimeClient } from './realtime-client';
import { installConsoleBridge } from './console-bridge';

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

function parseArgs(): { jail: string; uid: number; gid: number; socket: string; entry: string } {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    map[key] = args[i + 1];
  }
  return {
    jail: map.jail,
    uid: parseInt(map.uid, 10),
    gid: parseInt(map.gid, 10),
    socket: map.socket,
    entry: map.entry,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { jail, uid, gid, socket: socketPath, entry } = parseArgs();

  // 1. Connect to host IPC *before* chroot (socket path must be reachable)
  const ipcSocket = net.createConnection(socketPath);
  await new Promise<void>((resolve, reject) => {
    ipcSocket.once('connect', resolve);
    ipcSocket.once('error', reject);
  });

  // 2. Request payload from supervisor via Node.js IPC channel
  process.send!({ type: 'ready_for_payload' });

  const { request, env } = await new Promise<{ request: RequestData; env: Record<string, string> }>((resolve) => {
    process.once('message', (msg: any) => {
      if (msg?.type === 'payload') {
        resolve({ request: msg.request, env: msg.env });
      }
    });
  });

  // 3. Clear process.argv before user code can see it
  process.argv = [process.argv[0]];

  // 4. Chroot into the overlay jail and drop privileges in one syscall flow.
  // The `chroot` package requires a target user/group argument.
  chroot(jail, uid, gid);

  // 6. Inject user environment variables
  const injectedKeys: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
    injectedKeys.push(key);
  }

  // 7. Set up IPC event routing
  const decoder = new EventDecoder();
  const kvClient = new KvClient(ipcSocket);
  const realtimeClient = new RealtimeClient(ipcSocket);
  const restoreConsole = installConsoleBridge(ipcSocket);

  // Expose KV and realtime on globalThis for user code
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

  // Route host → worker events (kv_result, realtime_result)
  ipcSocket.on('data', (chunk: Buffer) => {
    const events = decoder.feed(chunk);
    for (const ev of events) {
      routeHostEvent(ev, kvClient, realtimeClient);
    }
  });

  // 8. Load and execute user function
  try {
    const entryPath = `/${entry}`;
    const userModule = require(entryPath);
    const handler = typeof userModule === 'function' ? userModule : userModule.default;

    if (typeof handler !== 'function') {
      throw new Error(
        `Module at ${entryPath} does not export a function. ` +
        `Got ${typeof handler === 'undefined' ? 'undefined' : typeof handler}.`,
      );
    }

    const req = createReqObject(request);
    const { res, state } = createResObject(req);

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

    // If handler returned without calling res.end/send/json, send 204
    if (!state.finished) {
      res.status(204).end();
    }

    // Send result back to host
    const response = stateToResponseData(state);
    ipcSocket.write(encode('execute_result', { response }));
  } catch (err: any) {
    ipcSocket.write(encode('execute_result', {
      response: {
        statusCode: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: Buffer.from(JSON.stringify({
          error: 'Failed to load function module',
          message: err.message,
        })).toString('base64'),
      },
    }));
  }

  // 9. Cleanup: remove injected env vars and globals
  for (const key of injectedKeys) {
    delete process.env[key];
  }
  delete (globalThis as any).kv;
  delete (globalThis as any).realtime;
  restoreConsole();
  process.argv = [];

  // 10. Give IPC a moment to flush, then exit
  await new Promise<void>((resolve) => {
    ipcSocket.once('drain', resolve);
    // If already drained, resolve immediately
    if (ipcSocket.writableLength === 0) resolve();
  });

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Event routing
// ---------------------------------------------------------------------------

function routeHostEvent(ev: ParsedEvent, kvClient: KvClient, realtimeClient: RealtimeClient): void {
  switch (ev.event) {
    case 'kv_result':
      kvClient.handleResult(ev.payload);
      break;
    case 'realtime_result':
      realtimeClient.handleResult(ev.payload);
      break;
    default:
      // Ignore unknown events
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
