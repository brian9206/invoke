import type { IIpcChannel } from "../protocol";
import { KvClient } from "./client";

export { KvClient } from "./client";

/**
 * Wire up the KvClient and expose it as a global so user
 * code can use `kv` without any imports.
 */
export function setupKvGlobal(ipc: IIpcChannel): void {
  const kvClient = new KvClient(ipc);

  (globalThis as any).kv = {
    get: (key: string) => kvClient.get(key),
    set: (key: string, value: unknown, ttl?: number) => kvClient.set(key, value, ttl),
    delete: (key: string) => kvClient.delete(key),
    clear: () => kvClient.clear(),
    has: (key: string) => kvClient.has(key),
  };
}
