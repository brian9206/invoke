// ============================================================================
// Shim Entrypoint — Unix socket listener inside the gVisor sandbox
// ============================================================================

import net from 'net';
import {
  MessageDecoder,
  encode,
  type HostMessage,
  type ExecuteMessage,
  type ExecuteResultMessage,
  type ErrorMessage,
  type ReadyMessage,
} from './protocol';
import { createReqObject, createResObject, stateToResponseData } from './request-response';
import { KvClient } from './kv-client';
import { RealtimeClient } from './realtime-client';
import { installConsoleBridge } from './console-bridge';

const SOCKET_PATH = process.env.INVOKE_SOCKET_PATH || '/run/invoke.sock';

let kvClient: KvClient;
let realtimeClient: RealtimeClient;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const server = net.createServer(handleConnection);

  server.listen(SOCKET_PATH, () => {
    // Signal readiness once the socket is listening — the host waits for this
    // before considering the sandbox "ready". In socket mode the ready message
    // is sent over the first connection; for the checkpoint flow the host opens
    // a connection immediately after `runsc run`.
  });

  server.on('error', (err) => {
    console.error('[shim] server error:', err);
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = () => {
    server.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ---------------------------------------------------------------------------
// Connection handler
// ---------------------------------------------------------------------------

function handleConnection(socket: net.Socket): void {
  const decoder = new MessageDecoder();

  // Set up per-connection clients
  kvClient = new KvClient(socket);
  realtimeClient = new RealtimeClient(socket);

  // Install console bridge so user code's console.log() goes to the host
  installConsoleBridge(socket);

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

  // Send ready signal
  const readyMsg: ReadyMessage = { type: 'ready' };
  socket.write(encode(readyMsg));

  socket.on('data', (data: Buffer) => {
    const messages = decoder.feed(data.toString('utf8'));

    for (const msg of messages) {
      routeMessage(socket, msg as HostMessage);
    }
  });

  socket.on('error', (err) => {
    console.error('[shim] socket error:', err);
  });
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

function routeMessage(socket: net.Socket, msg: HostMessage): void {
  switch (msg.type) {
    case 'execute':
      handleExecute(socket, msg).catch((err) => {
        const errorMsg: ErrorMessage = {
          type: 'error',
          id: msg.id,
          error: err instanceof Error ? err.message : String(err),
        };
        socket.write(encode(errorMsg));
      });
      break;

    case 'kv_result':
      kvClient.handleResult(msg);
      break;

    case 'realtime_result':
      realtimeClient.handleResult(msg);
      break;

    default:
      console.error('[shim] unknown message type:', (msg as any).type);
  }
}

// ---------------------------------------------------------------------------
// Execute handler
// ---------------------------------------------------------------------------

async function handleExecute(socket: net.Socket, msg: ExecuteMessage): Promise<void> {
  // Inject environment variables
  for (const [key, value] of Object.entries(msg.env)) {
    process.env[key] = value;
  }

  // Load user module
  let handler: Function;
  try {
    const userModule = require(msg.codePath);
    handler = typeof userModule === 'function' ? userModule : userModule.default;

    if (typeof handler !== 'function') {
      throw new Error(
        `Module at ${msg.codePath} does not export a function. ` +
        `Got ${typeof handler === 'undefined' ? 'undefined' : typeof handler}.`
      );
    }
  } catch (err: any) {
    const errorResult: ExecuteResultMessage = {
      type: 'execute_result',
      id: msg.id,
      response: {
        statusCode: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: Buffer.from(JSON.stringify({
          error: 'Failed to load function module',
          message: err.message,
        })).toString('base64'),
      },
    };
    socket.write(encode(errorResult));
    return;
  }

  // Build Express-compatible req/res
  const req = createReqObject(msg.request);
  const { res, state } = createResObject(req);

  // Execute user handler
  try {
    const result = handler(req, res);
    // Support both sync and async handlers
    if (result && typeof result.then === 'function') {
      await result;
    }
  } catch (err: any) {
    // If handler threw and response hasn't been sent yet, send a 500
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
  const resultMsg: ExecuteResultMessage = {
    type: 'execute_result',
    id: msg.id,
    response: stateToResponseData(state),
  };
  socket.write(encode(resultMsg));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

main();
