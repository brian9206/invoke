// ============================================================================
// Realtime module — exports and global setup
// ============================================================================

import type { RealtimeClient } from './client';
import { setClient, RealtimeNamespace } from './namespace';

export { RealtimeClient } from './client';
export { RealtimeNamespace } from './namespace';
export { BroadcastOperator } from './broadcast-operator';
export { SocketProxy } from './socket-proxy';

/**
 * Wire up the RealtimeClient and expose RealtimeNamespace as a global so user
 * code can use `new RealtimeNamespace(...)` without any imports.
 */
export function setupRealtimeGlobal(client: RealtimeClient): void {
  setClient(client);
  (globalThis as any).RealtimeNamespace = RealtimeNamespace;
}
