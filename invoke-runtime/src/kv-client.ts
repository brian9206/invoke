// ============================================================================
// KV Client — Proxy client that sends KV commands to the host over the socket
// ============================================================================

import type net from 'net';
import {
  encode,
  type KvGetMessage,
  type KvSetMessage,
  type KvDeleteMessage,
  type KvClearMessage,
  type KvHasMessage,
  type KvResultMessage,
} from './protocol';

type PendingResolve = (result: KvResultMessage) => void;

/**
 * KV store client exposed as `globalThis.kv` inside the sandbox.
 * Each operation sends a message to the host and awaits a matching reply.
 */
export class KvClient {
  private socket: net.Socket;
  private seq = 0;
  private pending = new Map<string, PendingResolve>();

  constructor(socket: net.Socket) {
    this.socket = socket;
  }

  /** Called by the message router when a `kv_result` arrives from the host */
  handleResult(msg: KvResultMessage): void {
    const resolve = this.pending.get(msg.id);
    if (resolve) {
      this.pending.delete(msg.id);
      resolve(msg);
    }
  }

  private nextId(): string {
    return `kv-${++this.seq}`;
  }

  private send(msg: KvGetMessage | KvSetMessage | KvDeleteMessage | KvClearMessage | KvHasMessage): Promise<KvResultMessage> {
    return new Promise<KvResultMessage>((resolve) => {
      this.pending.set(msg.id, resolve);
      this.socket.write(encode(msg));
    });
  }

  // -- Public API (exposed on globalThis.kv) ----------------------------------

  async get(key: string): Promise<unknown> {
    const msg: KvGetMessage = { type: 'kv_get', id: this.nextId(), key };
    const result = await this.send(msg);
    if (result.error) throw new Error(`KV get error: ${result.error}`);
    return result.value;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    const msg: KvSetMessage = {
      type: 'kv_set',
      id: this.nextId(),
      key,
      value: JSON.stringify(value),
      ttl,
    };
    const result = await this.send(msg);
    if (result.error) throw new Error(`KV set error: ${result.error}`);
    return true;
  }

  async delete(key: string): Promise<boolean> {
    const msg: KvDeleteMessage = { type: 'kv_delete', id: this.nextId(), key };
    const result = await this.send(msg);
    if (result.error) throw new Error(`KV delete error: ${result.error}`);
    return result.value as boolean;
  }

  async clear(): Promise<void> {
    const msg: KvClearMessage = { type: 'kv_clear', id: this.nextId() };
    const result = await this.send(msg);
    if (result.error) throw new Error(`KV clear error: ${result.error}`);
  }

  async has(key: string): Promise<boolean> {
    const msg: KvHasMessage = { type: 'kv_has', id: this.nextId(), key };
    const result = await this.send(msg);
    if (result.error) throw new Error(`KV has error: ${result.error}`);
    return result.value as boolean;
  }
}
