import { KvClient } from "./client";

export { KvClient } from "./client";

/**
 * Wire up the KvClient and expose it as a global so user
 * code can use `kv` without any imports.
 */
export function setupKvGlobal(client: KvClient): void {
  (globalThis as any).kv = {
    get: (key: string) => client.get(key),
    set: (key: string, value: unknown, ttl?: number) =>
      client.set(key, value, ttl),
    delete: (key: string) => client.delete(key),
    clear: () => client.clear(),
    has: (key: string) => client.has(key),
  };
}
