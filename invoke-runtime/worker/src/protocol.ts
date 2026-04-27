// ============================================================================
// Protocol — Event-based newline-delimited JSON framing with binary support
// Compatible with SandboxOrchestrator IPC (sandbox-orchestrator.ts)
// ============================================================================

import { EventEmitter } from 'events';
import net from 'net';

// ---------------------------------------------------------------------------
// Request / Response data types (shared between host and runtime)
// ---------------------------------------------------------------------------

/** @internal */
export interface RequestData {
  method: string;
  url: string;
  originalUrl: string;
  path: string;
  protocol: string;
  hostname: string;
  secure: boolean;
  ip: string;
  ips: string[];
  body: unknown;
  query: Record<string, string>;
  params: Record<string, string>;
  headers: Record<string, string>;
}

/** @internal */
export interface BuildData {
  buildId: string;
}

/** @internal */
export interface ResponseData {
  statusCode: number;
  headers: Record<string, string | string[]>;
  /** Base64-encoded body bytes */
  body: string | null;
}

// ---------------------------------------------------------------------------
// Framing helpers — event-based newline-delimited JSON
//
// Text frame:   {"event":"name","payload":{...}}\n
// Binary frame: {"event":"name","payload":{...},"binary":true,"size":1024}\n
//               <1024 raw bytes>
// ---------------------------------------------------------------------------

/**
 * Encode a text event as a newline-delimited JSON string (with trailing `\n`).
 */
function encode(event: string, payload?: unknown): string {
  return JSON.stringify({ event, payload }) + '\n';
}

/**
 * Encode a binary event: returns a Buffer containing the header line + raw data.
 */
function encodeBinary(event: string, payload: unknown, buffer: Buffer): Buffer {
  const header = JSON.stringify({
    event,
    payload,
    binary: true,
    size: buffer.length,
  }) + '\n';
  return Buffer.concat([Buffer.from(header, 'utf8'), buffer]);
}

// ---------------------------------------------------------------------------
// Parsed event
// ---------------------------------------------------------------------------

interface ParsedEvent {
  event: string;
  payload: any;
  binary?: Buffer;
}

// ---------------------------------------------------------------------------
// Streaming decoder — binary-aware framing (matches sandbox-orchestrator.ts)
// ---------------------------------------------------------------------------

/**
 * Streaming decoder that buffers incoming data and yields complete events.
 * Supports both text-only and binary-framed messages.
 */
class EventDecoder {
  private textBuffer = Buffer.alloc(0);
  private binaryHeader: { event: string; payload: any; size: number } | null = null;
  private binaryCollected = Buffer.alloc(0);

  /**
   * Feed raw data from the socket and return any complete events.
   */
  feed(data: Buffer): ParsedEvent[] {
    const events: ParsedEvent[] = [];
    let remaining = data;

    while (remaining.length > 0) {
      if (this.binaryHeader) {
        // BINARY mode: collect exactly `size` bytes
        const need = this.binaryHeader.size - this.binaryCollected.length;
        const take = Math.min(need, remaining.length);
        this.binaryCollected = Buffer.concat([this.binaryCollected, remaining.subarray(0, take)]);
        remaining = remaining.subarray(take);

        if (this.binaryCollected.length === this.binaryHeader.size) {
          events.push({
            event: this.binaryHeader.event,
            payload: this.binaryHeader.payload,
            binary: this.binaryCollected,
          });
          this.binaryHeader = null;
          this.binaryCollected = Buffer.alloc(0);
        }
      } else {
        // TEXT mode: buffer until \n
        const nlIdx = remaining.indexOf(0x0a); // '\n'
        if (nlIdx === -1) {
          this.textBuffer = Buffer.concat([this.textBuffer, remaining]);
          remaining = Buffer.alloc(0);
        } else {
          const line = Buffer.concat([this.textBuffer, remaining.subarray(0, nlIdx)]);
          this.textBuffer = Buffer.alloc(0);
          remaining = remaining.subarray(nlIdx + 1);

          if (line.length === 0) continue;

          let parsed: any;
          try {
            parsed = JSON.parse(line.toString('utf8'));
          } catch {
            // Skip malformed lines
            continue;
          }

          if (parsed.binary && typeof parsed.size === 'number') {
            this.binaryHeader = {
              event: parsed.event,
              payload: parsed.payload,
              size: parsed.size,
            };
            this.binaryCollected = Buffer.alloc(0);
            // Continue loop — remaining data may contain binary bytes
          } else {
            events.push({
              event: parsed.event,
              payload: parsed.payload,
            });
          }
        }
      }
    }

    return events;
  }
}

// ---------------------------------------------------------------------------
// IpcChannel — EventEmitter wrapper around the UDS + EventDecoder
//
// Usage:
//   const ipc = IpcChannel.getInstance();
//   await ipc.connected;
//   ipc.on('payload', (payload) => { ... });
//   ipc.emit('execute_result', { response });
//   await ipc.end('execute_end', {});
// ---------------------------------------------------------------------------

const IPC_SOCKET_PATH = '/run/events.sock';

/**
 * High-level IPC channel that wraps the Unix domain socket with EventEmitter.
 *
 * Every decoded frame is re-emitted as `this.emit(eventName, payload, binary?)`.
 * Socket errors and close are forwarded as `'error'` and `'close'`.
 *
 * The socket is created and connected in the constructor — no path or socket
 * parameter is needed. Await `ipc.connected` before sending the first message.
 * @internal
 */
export interface IIpcChannel extends EventEmitter {
  readonly connected: Promise<void>;

  emit(event: string, payload?: unknown, binary?: Buffer): boolean;
  end(event?: string, payload?: unknown, binary?: Buffer): Promise<void>;
}

/** @internal */
export class IpcChannel extends EventEmitter implements IIpcChannel {
  private readonly socket: net.Socket;
  private readonly decoder = new EventDecoder();

  /** Resolves when the socket connects successfully. */
  readonly connected: Promise<void>;

  private constructor() {
    super();
    this.socket = net.createConnection(IPC_SOCKET_PATH);

    this.connected = new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        this.socket.removeListener('error', onError);
        // After connection: forward ongoing errors and close to the emitter
        this.socket.on('error', (err) => super.emit('error', err));
        this.socket.on('close', () => super.emit('close'));
        resolve();
      };
      const onError = (err: Error) => {
        this.socket.removeListener('connect', onConnect);
        reject(err);
      };
      this.socket.once('connect', onConnect);
      this.socket.once('error', onError);
    });

    // Decode incoming data and re-emit as named events
    this.socket.on('data', (chunk: Buffer) => {
      const events = this.decoder.feed(chunk);
      for (const ev of events) {
        super.emit(ev.event, ev.payload, ev.binary);
      }
    });
  }

  /**
   * Singleton pattern
   */
  private static _instance: IpcChannel | null = null;

  static getInstance(): IpcChannel {
    if (!this._instance) {
      this._instance = new IpcChannel();
    }
    return this._instance;
  }

  /**
   * Send a text event over the socket.
   */
  private _send(event: string, payload?: unknown): boolean {
    return this.socket.write(encode(event, payload));
  }

  /**
   * Send a binary-framed event over the socket.
   */
  private _sendBinary(event: string, payload: unknown, buffer: Buffer): boolean {
    return this.socket.write(encodeBinary(event, payload, buffer));
  }

  /**
   * Emit event over the socket.
   */
  emit(event: string, payload?: unknown, binary?: Buffer): boolean {
    if (binary) {
      return this._sendBinary(event, payload, binary);
    }
    else {
      return this._send(event, payload);
    }
  }

  /**
   * Optionally write a final event, then half-close the socket.
   * Returns a Promise that resolves once the data has been flushed.
   */
  end(event?: string, payload?: unknown, binary?: Buffer): Promise<void> {
    return new Promise<void>((resolve) => {
      const frame = event !== undefined ? (binary ? encodeBinary(event, payload, binary) : encode(event, payload)) : undefined;
      if (frame) {
        this.socket.end(frame, resolve);
      } else {
        this.socket.end(resolve);
      }
      // Safety timeout — resolve anyway if the flush stalls
      setTimeout(resolve, 1000).unref();
    });
  }
}

/** @internal */
export class NoOpIpcChannel extends EventEmitter implements IIpcChannel {
  readonly connected = Promise.resolve();

  emit(event: string, payload?: unknown, binary?: Buffer): boolean {
    return true;
  }

  end(event?: string, payload?: unknown, binary?: Buffer): Promise<void> {
    return Promise.resolve();
  }
}
