import { type IIpcChannel } from "./protocol";
import { setupKvGlobal } from "./kv";
import { setupRealtimeGlobal } from "./realtime";
import { setupRouterGlobal } from "./router";
import { setupSleepGlobal } from "./sleep";
import { setupLoggerGlobal } from "./logger/pino";

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
