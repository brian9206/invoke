// ============================================================================
// Protocol — Event-based newline-delimited JSON framing with binary support
// Compatible with SandboxOrchestrator IPC (sandbox-orchestrator.ts)
// ============================================================================

// ---------------------------------------------------------------------------
// Request / Response data types (shared between host and runtime)
// ---------------------------------------------------------------------------

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

/** Serialised HTTP response sent back from the sandbox */
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
export function encode(event: string, payload?: unknown): string {
  return JSON.stringify({ event, payload }) + '\n';
}

/**
 * Encode a binary event: returns a Buffer containing the header line + raw data.
 */
export function encodeBinary(event: string, payload: unknown, buffer: Buffer): Buffer {
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

export interface ParsedEvent {
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
export class EventDecoder {
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
