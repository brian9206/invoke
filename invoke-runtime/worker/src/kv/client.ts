// ============================================================================
// KV Client — Proxy client that sends KV commands to the host over IPC
// ============================================================================

import type net from 'net';
import { encode } from '../protocol';

type PendingResolve = (result: { value?: unknown; error?: string }) => void;

/**
 * KV store client exposed as `globalThis.kv` inside the sandbox.
 * Each operation sends an event to the host and awaits a matching reply.
 */
export class KvClient {
  private socket: net.Socket;
  private seq = 0;
  private pending = new Map<string, PendingResolve>();

  constructor(socket: net.Socket) {
    this.socket = socket;
  }

  /** Called by the event router when a `kv_result` event arrives from the host */
  handleResult(payload: { id: string; value?: unknown; error?: string }): void {
    const resolve = this.pending.get(payload.id);
    if (resolve) {
      this.pending.delete(payload.id);
      resolve(payload);
    }
  }

  private nextId(): string {
    return `kv-${++this.seq}`;
  }

  private request(event: string, payload: Record<string, unknown>): Promise<{ value?: unknown; error?: string }> {
    return new Promise((resolve) => {
      this.pending.set(payload.id as string, resolve);
      this.socket.write(encode(event, payload));
    });
  }

  // -- Public API (exposed on globalThis.kv) ----------------------------------

  async get(key: string): Promise<unknown> {
    const id = this.nextId();
    const result = await this.request('kv_get', { id, key });
    if (result.error) throw new Error(`KV get error: ${result.error}`);
    return result.value;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    const id = this.nextId();
    const result = await this.request('kv_set', { id, key, value: JSON.stringify(value), ttl });
    if (result.error) throw new Error(`KV set error: ${result.error}`);
    return true;
  }

  async delete(key: string): Promise<boolean> {
    const id = this.nextId();
    const result = await this.request('kv_delete', { id, key });
    if (result.error) throw new Error(`KV delete error: ${result.error}`);
    return result.value as boolean;
  }

  async clear(): Promise<void> {
    const id = this.nextId();
    const result = await this.request('kv_clear', { id });
    if (result.error) throw new Error(`KV clear error: ${result.error}`);
  }

  async has(key: string): Promise<boolean> {
    const id = this.nextId();
    const result = await this.request('kv_has', { id, key });
    if (result.error) throw new Error(`KV has error: ${result.error}`);
    return result.value as boolean;
  }
}
