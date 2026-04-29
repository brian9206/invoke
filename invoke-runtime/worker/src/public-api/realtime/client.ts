// ============================================================================
// Realtime Client — Bridge for realtime socket commands sent to the host
// ============================================================================

import type { IIpcChannel } from '../../protocol'

type PendingResolve = (result: { error?: string }) => void

/**
 * Realtime socket client exposed as `globalThis.realtime` inside the sandbox.
 * Sends commands to the gateway via the host process.
 */
export class RealtimeClient {
  private ipc: IIpcChannel
  private seq = 0
  private pending = new Map<string, PendingResolve>()

  /** @internal */
  constructor(ipc: IIpcChannel) {
    this.ipc = ipc
    this.ipc.on('realtime_result', (payload: { id: string; error?: string }) => {
      this.handleResult(payload)
    })
  }

  private handleResult(payload: { id: string; error?: string }): void {
    const resolve = this.pending.get(payload.id)
    if (resolve) {
      this.pending.delete(payload.id)
      resolve(payload)
    }
  }

  private nextId(): string {
    return `rt-${++this.seq}`
  }

  /**
   * Send a realtime socket command to the gateway.
   * The host forwards this via HTTP POST to the gateway's internal endpoint.
   * @param cmd Realtime command payload.
   * @returns A promise that resolves when the command is accepted.
   */
  async send(cmd: Record<string, unknown>): Promise<void> {
    const id = this.nextId()

    const result = await new Promise<{ error?: string }>(resolve => {
      this.pending.set(id, resolve)
      this.ipc.emit('realtime_cmd', { id, cmd })
    })

    if (result.error) {
      throw new Error(`Realtime socket command failed: ${result.error}`)
    }
  }

  // -- Convenience methods matching the existing realtime API -----------------

  /**
   * Emit an event to a namespace.
   * @param namespace Namespace path.
   * @param event Event name.
   * @param args Event payload arguments.
   * @returns A promise that resolves when the command is accepted.
   */
  async emit(namespace: string, event: string, ...args: unknown[]): Promise<void> {
    return this.send({ action: 'emit', namespace, event, args })
  }

  /**
   * Broadcast an event to all sockets in a namespace.
   * @param namespace Namespace path.
   * @param event Event name.
   * @param args Event payload arguments.
   * @returns A promise that resolves when the command is accepted.
   */
  async broadcast(namespace: string, event: string, ...args: unknown[]): Promise<void> {
    return this.send({ action: 'broadcast', namespace, event, args })
  }

  /**
   * Add a socket to a room.
   * @param namespace Namespace path.
   * @param room Room identifier.
   * @param socketId Socket identifier.
   * @returns A promise that resolves when the command is accepted.
   */
  async join(namespace: string, room: string, socketId: string): Promise<void> {
    return this.send({ action: 'join', namespace, room, socketId })
  }

  /**
   * Remove a socket from a room.
   * @param namespace Namespace path.
   * @param room Room identifier.
   * @param socketId Socket identifier.
   * @returns A promise that resolves when the command is accepted.
   */
  async leave(namespace: string, room: string, socketId: string): Promise<void> {
    return this.send({ action: 'leave', namespace, room, socketId })
  }

  /**
   * Emit an event to all sockets in a room.
   * @param namespace Namespace path.
   * @param room Room identifier.
   * @param event Event name.
   * @param args Event payload arguments.
   * @returns A promise that resolves when the command is accepted.
   */
  async emitToRoom(namespace: string, room: string, event: string, ...args: unknown[]): Promise<void> {
    return this.send({ action: 'emitToRoom', namespace, room, event, args })
  }
}
