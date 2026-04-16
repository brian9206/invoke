import { KvClient, setupKvGlobal } from "./kv";
import { RealtimeClient, setupRealtimeGlobal } from "./realtime";
import { setupRouterGlobal } from "./router";
import { setupSleepGlobal } from "./sleep";

export function setupEnvironment(
  kvClient: KvClient,
  realtimeClient: RealtimeClient,
) {
  setupSleepGlobal();

  // Expose KV on globalThis for user code
  setupKvGlobal(kvClient);

  // Expose RealtimeNamespace class on globalThis for user code
  setupRealtimeGlobal(realtimeClient);

  // Expose Router class on globalThis for user code
  setupRouterGlobal();
}
