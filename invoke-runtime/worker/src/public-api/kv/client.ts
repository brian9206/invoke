// ============================================================================
// KV Client — Proxy client that sends KV commands to the host over IPC
// ============================================================================

import type { IIpcChannel } from '../../protocol'

type PendingResolve = (result: { value?: unknown; error?: string }) => void

/**
 * KV store client exposed as `globalThis.kv` inside the sandbox.
 * Each operation sends an event to the host and awaits a matching reply.
 */
export class KvClient {
  private ipc: IIpcChannel
  private seq = 0
  private pending = new Map<string, PendingResolve>()

  /** @internal */
  constructor(ipc: IIpcChannel) {
    this.ipc = ipc
    this.ipc.on('kv_result', (payload: { id: string; value?: unknown; error?: string }) => {
      this.handleResult(payload)
    })
  }

  private handleResult(payload: { id: string; value?: unknown; error?: string }): void {
    const resolve = this.pending.get(payload.id)
    if (resolve) {
      this.pending.delete(payload.id)
      resolve(payload)
    }
  }

  private nextId(): string {
    return `kv-${++this.seq}`
  }

  private request(event: string, payload: Record<string, unknown>): Promise<{ value?: unknown; error?: string }> {
    return new Promise(resolve => {
      this.pending.set(payload.id as string, resolve)
      this.ipc.emit(event, payload)
    })
  }

  // -- Public API (exposed on globalThis.kv) ----------------------------------

  /**
   * Get a value by key.
   * @param key Key name.
   * @returns The stored value, or `undefined` when missing.
   */
  async get(key: string): Promise<unknown> {
    const id = this.nextId()
    const result = await this.request('kv_get', { id, key })
    if (result.error) throw new Error(`KV get error: ${result.error}`)
    return result.value
  }

  /**
   * Set a value by key with optional TTL in milliseconds.
   * @param key Key name.
   * @param value Value to store.
   * @param ttl Time-to-live in milliseconds.
   * @returns `true` when the value is stored.
   */
  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    const id = this.nextId()
    const result = await this.request('kv_set', { id, key, value: JSON.stringify(value), ttl })
    if (result.error) throw new Error(`KV set error: ${result.error}`)
    return true
  }

  /**
   * Delete a key.
   * @param key Key name.
   * @returns `true` when the key existed and was removed.
   */
  async delete(key: string): Promise<boolean> {
    const id = this.nextId()
    const result = await this.request('kv_delete', { id, key })
    if (result.error) throw new Error(`KV delete error: ${result.error}`)
    return result.value as boolean
  }

  /**
   * Clear all keys for the current scope.
   * @returns A promise that resolves when the store is cleared.
   */
  async clear(): Promise<void> {
    const id = this.nextId()
    const result = await this.request('kv_clear', { id })
    if (result.error) throw new Error(`KV clear error: ${result.error}`)
  }

  /**
   * Check whether a key exists.
   * @param key Key name.
   * @returns `true` if the key exists.
   */
  async has(key: string): Promise<boolean> {
    const id = this.nextId()
    const result = await this.request('kv_has', { id, key })
    if (result.error) throw new Error(`KV has error: ${result.error}`)
    return result.value as boolean
  }
}
