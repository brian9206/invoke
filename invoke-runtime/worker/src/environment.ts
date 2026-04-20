import net from "net";
import { KvClient, setupKvGlobal } from "./kv";
import { RealtimeClient, setupRealtimeGlobal } from "./realtime";
import { setupRouterGlobal } from "./router";
import { setupSleepGlobal } from "./sleep";
import { setupLoggerGlobal } from "./logger/pino";

export function setupEnvironment(options: {
  kvClient: KvClient,
  realtimeClient: RealtimeClient,
  ipcSocket?: net.Socket
}) {
  // Expose Pino
  setupLoggerGlobal(options.ipcSocket);

  setupSleepGlobal();

  // Expose KV on globalThis for user code
  setupKvGlobal(options.kvClient);

  // Expose RealtimeNamespace class on globalThis for user code
  setupRealtimeGlobal(options.realtimeClient);

  // Expose Router class on globalThis for user code
  setupRouterGlobal();
}
