import { type IIpcChannel } from "./protocol";
import { setupKvGlobal } from "./public-api/kv";
import { setupRealtimeGlobal } from "./public-api/realtime";
import { setupRouterGlobal } from "./public-api/router";
import { setupSleepGlobal } from "./public-api/sleep";
import { setupLoggerGlobal } from "./public-api/logger/pino";

export function setupEnvironment(ipc: IIpcChannel): void {
  // Expose Pino
  setupLoggerGlobal(ipc);

  // Expose sleep()
  setupSleepGlobal();

  // Expose KV on globalThis for user code
  setupKvGlobal(ipc);

  // Expose RealtimeNamespace class on globalThis for user code
  setupRealtimeGlobal(ipc);

  // Expose Router class on globalThis for user code
  setupRouterGlobal();
}
