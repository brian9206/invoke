import type { IIpcChannel } from '../../protocol'
import { KvClient } from './client'

/** @internal */
export { KvClient } from './client'

/**
 * Key-value store API available as the global `kv` object.
 */
export interface InvokeKvStore {
  /**
   * Get a stored value by key.
   * @param key Key name.
   * @returns The stored value, or `undefined` when missing.
   */
  get(key: string): Promise<unknown>
  /**
   * Set a value by key, optionally with TTL in milliseconds.
   * @param key Key name.
   * @param value Value to store.
   * @param ttl Time-to-live in milliseconds.
   * @returns `true` when the value is stored.
   */
  set(key: string, value: unknown, ttl?: number): Promise<boolean>
  /**
   * Delete a key from the store.
   * @param key Key name.
   * @returns `true` when the key existed and was removed.
   */
  delete(key: string): Promise<boolean>
  /**
   * Remove all keys for the current function namespace.
   * @returns A promise that resolves when the store is cleared.
   */
  clear(): Promise<void>
  /**
   * Check if a key exists.
   * @param key Key name.
   * @returns `true` if the key exists.
   */
  has(key: string): Promise<boolean>
}

declare global {
  /** Global key-value store client. */
  var kv: InvokeKvStore
}

/**
 * Wire up the KvClient and expose it as a global so user
 * code can use `kv` without any imports.
 * @internal
 */
export function setupKvGlobal(ipc: IIpcChannel): void {
  const kvClient = new KvClient(ipc)

  globalThis.kv = {
    get: (key: string) => kvClient.get(key),
    set: (key: string, value: unknown, ttl?: number) => kvClient.set(key, value, ttl),
    delete: (key: string) => kvClient.delete(key),
    clear: () => kvClient.clear(),
    has: (key: string) => kvClient.has(key)
  }
}
