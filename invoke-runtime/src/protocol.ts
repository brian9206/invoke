// ============================================================================
// Protocol — Newline-delimited JSON message framing & shared types
// ============================================================================

// ---------------------------------------------------------------------------
// Message Types
// ---------------------------------------------------------------------------

/** Host → Shim: execute a user function */
export interface ExecuteMessage {
  type: 'execute';
  id: string;
  codePath: string;
  request: RequestData;
  env: Record<string, string>;
}

/** Serialised HTTP request forwarded into the sandbox */
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

/** Shim → Host: execution completed */
export interface ExecuteResultMessage {
  type: 'execute_result';
  id: string;
  response: ResponseData;
}

/** Serialised HTTP response sent back from the sandbox */
export interface ResponseData {
  statusCode: number;
  headers: Record<string, string | string[]>;
  /** Base64-encoded body bytes */
  body: string | null;
}

// -- KV commands (Shim → Host) -----------------------------------------------

export interface KvGetMessage {
  type: 'kv_get';
  id: string;
  key: string;
}

export interface KvSetMessage {
  type: 'kv_set';
  id: string;
  key: string;
  value: string; // JSON-serialised
  ttl?: number;
}

export interface KvDeleteMessage {
  type: 'kv_delete';
  id: string;
  key: string;
}

export interface KvClearMessage {
  type: 'kv_clear';
  id: string;
}

export interface KvHasMessage {
  type: 'kv_has';
  id: string;
  key: string;
}

/** Host → Shim: KV operation result */
export interface KvResultMessage {
  type: 'kv_result';
  id: string;
  value?: unknown;
  error?: string;
}

// -- Console (Shim → Host, fire-and-forget) -----------------------------------

export interface ConsoleMessage {
  type: 'console';
  level: string;
  args: string[];
}

// -- Realtime Socket (Shim → Host) -------------------------------------------

export interface RealtimeCommandMessage {
  type: 'realtime_cmd';
  id: string;
  cmd: Record<string, unknown>;
}

/** Host → Shim: realtime command result */
export interface RealtimeResultMessage {
  type: 'realtime_result';
  id: string;
  error?: string;
}

// -- Ready signal (Shim → Host) ----------------------------------------------

export interface ReadyMessage {
  type: 'ready';
}

// -- Error (Shim → Host) ----------------------------------------------------

export interface ErrorMessage {
  type: 'error';
  id?: string;
  error: string;
}

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

/** Messages the shim can receive from the host */
export type HostMessage = ExecuteMessage | KvResultMessage | RealtimeResultMessage;

/** Messages the shim can send to the host */
export type ShimMessage =
  | ReadyMessage
  | ExecuteResultMessage
  | KvGetMessage
  | KvSetMessage
  | KvDeleteMessage
  | KvClearMessage
  | KvHasMessage
  | ConsoleMessage
  | RealtimeCommandMessage
  | ErrorMessage;

// ---------------------------------------------------------------------------
// Framing helpers — newline-delimited JSON
// ---------------------------------------------------------------------------

/**
 * Encode a message as a newline-delimited JSON string (with trailing `\n`).
 */
export function encode(msg: ShimMessage | HostMessage): string {
  return JSON.stringify(msg) + '\n';
}

/**
 * Streaming decoder that buffers incoming data and yields complete messages.
 */
export class MessageDecoder {
  private buffer = '';

  /**
   * Feed raw data from the socket and return any complete messages.
   */
  feed(data: string): (HostMessage | ShimMessage)[] {
    this.buffer += data;
    const messages: (HostMessage | ShimMessage)[] = [];
    let newlineIdx: number;

    while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIdx);
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (line.length === 0) continue;
      try {
        messages.push(JSON.parse(line));
      } catch {
        // Skip malformed lines — host will time out if it never gets a reply
      }
    }

    return messages;
  }
}
