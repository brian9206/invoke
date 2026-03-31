// ============================================================================
// Realtime Client — Bridge for realtime socket commands sent to the host
// ============================================================================

import type net from 'net';
import {
  encode,
  type RealtimeCommandMessage,
  type RealtimeResultMessage,
} from './protocol';

type PendingResolve = (result: RealtimeResultMessage) => void;

/**
 * Realtime socket client exposed as `globalThis.realtime` inside the sandbox.
 * Sends commands to the gateway via the host process.
 */
export class RealtimeClient {
  private socket: net.Socket;
  private seq = 0;
  private pending = new Map<string, PendingResolve>();

  constructor(socket: net.Socket) {
    this.socket = socket;
  }

  /** Called by the message router when a `realtime_result` arrives from the host */
  handleResult(msg: RealtimeResultMessage): void {
    const resolve = this.pending.get(msg.id);
    if (resolve) {
      this.pending.delete(msg.id);
      resolve(msg);
    }
  }

  private nextId(): string {
    return `rt-${++this.seq}`;
  }

  /**
   * Send a realtime socket command to the gateway.
   * The host forwards this via HTTP POST to the gateway's internal endpoint.
   */
  async send(cmd: Record<string, unknown>): Promise<void> {
    const msg: RealtimeCommandMessage = {
      type: 'realtime_cmd',
      id: this.nextId(),
      cmd,
    };

    const result = await new Promise<RealtimeResultMessage>((resolve) => {
      this.pending.set(msg.id, resolve);
      this.socket.write(encode(msg));
    });

    if (result.error) {
      throw new Error(`Realtime socket command failed: ${result.error}`);
    }
  }

  // -- Convenience methods matching the existing realtime API -----------------

  async emit(namespace: string, event: string, ...args: unknown[]): Promise<void> {
    return this.send({ action: 'emit', namespace, event, args });
  }

  async broadcast(namespace: string, event: string, ...args: unknown[]): Promise<void> {
    return this.send({ action: 'broadcast', namespace, event, args });
  }

  async join(namespace: string, room: string, socketId: string): Promise<void> {
    return this.send({ action: 'join', namespace, room, socketId });
  }

  async leave(namespace: string, room: string, socketId: string): Promise<void> {
    return this.send({ action: 'leave', namespace, room, socketId });
  }

  async emitToRoom(namespace: string, room: string, event: string, ...args: unknown[]): Promise<void> {
    return this.send({ action: 'emitToRoom', namespace, room, event, args });
  }
}
