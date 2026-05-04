// ============================================================================
// Realtime module — exports and global setup
// ============================================================================

import { IIpcChannel } from '../../protocol'
import { RealtimeClient } from './client'
import { setClient, RealtimeNamespace } from './namespace'

/** @internal */
export { RealtimeClient } from './client'
export { RealtimeNamespace } from './namespace'
export type { InvokeRealtimeNamespace } from './namespace'
export { BroadcastOperator } from './broadcast-operator'
export { SocketProxy } from './socket-proxy'
export type { Handshake } from './socket-proxy'

/**
 * Wire up the RealtimeClient and expose RealtimeNamespace as a global so user
 * code can use `new RealtimeNamespace(...)` without any imports.
 * @internal
 */
export function setupRealtimeGlobal(ipc: IIpcChannel): void {
  const realtimeClient = new RealtimeClient(ipc)
  setClient(realtimeClient)
  ;(globalThis as any).RealtimeNamespace = RealtimeNamespace
}
