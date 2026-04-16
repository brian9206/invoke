// ============================================================================
// SocketProxy — Per-invocation socket representation exposed as `ns.socket`
// ============================================================================

import type { RealtimeClient } from './client';
import { BroadcastOperator } from './broadcast-operator';

export interface Handshake {
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  auth: Record<string, unknown>;
  address?: string;
  time?: string;
  disconnectReason?: string;
}

type EventHandler = (...args: unknown[]) => unknown;

export class SocketProxy {
  id: string;
  rooms: Set<string>;
  handshake: Handshake;
  connected: boolean;
  data: Record<string, unknown>;
  disconnectReason: string | null;
  _namespace: string | null;
  _handlers: Record<string, EventHandler>;
  private _client: RealtimeClient;

  constructor(
    client: RealtimeClient,
    id: string,
    rooms: string[],
    handshake: Handshake,
    namespace: string | null,
  ) {
    this._client = client;
    this.id = id;
    this.rooms = new Set(rooms);
    this.handshake = handshake;
    this.connected = true;
    this.data = {};
    this.disconnectReason = null;
    this._namespace = namespace;
    this._handlers = {};
  }

  /** Re-initialize per invocation (avoids allocating a new object per request) */
  _hydrate(
    id: string,
    rooms: string[],
    handshake: Handshake,
    namespace: string | null,
    disconnectReason: string | null,
  ): this {
    this.id = id || '';
    this.rooms = new Set(rooms || []);
    this.handshake = handshake || { headers: {}, query: {}, auth: {} };
    this.connected = disconnectReason == null;
    this.disconnectReason = disconnectReason;
    this._namespace = namespace || this._namespace || null;
    return this;
  }

  on(event: string, handler: EventHandler): this {
    this._handlers[event] = handler;
    return this;
  }

  once(event: string, handler: EventHandler): this {
    const self = this;
    let fired = false;
    this._handlers[event] = function (...args: unknown[]) {
      if (!fired) {
        fired = true;
        delete self._handlers[event];
        return handler(...args);
      }
    };
    return this;
  }

  emit(event: string, ...args: unknown[]): Promise<void> {
    return this._client.send({
      command: 'emit',
      namespace: this._namespace,
      socketId: this.id,
      event,
      args,
    });
  }

  join(room: string | string[]): Promise<void> {
    return this._client.send({
      command: 'join',
      namespace: this._namespace,
      socketId: this.id,
      roomIds: Array.isArray(room) ? room : [room],
    });
  }

  leave(room: string | string[]): Promise<void> {
    return this._client.send({
      command: 'leave',
      namespace: this._namespace,
      socketId: this.id,
      roomIds: Array.isArray(room) ? room : [room],
    });
  }

  disconnect(close?: boolean): Promise<void> {
    this.connected = false;
    return this._client.send({
      command: 'disconnect',
      namespace: this._namespace,
      socketId: this.id,
      close: close !== false,
    });
  }

  to(room: string): BroadcastOperator {
    return new BroadcastOperator(this._client, this._namespace, [room], [], this.id);
  }

  in(room: string): BroadcastOperator {
    return this.to(room);
  }

  except(room: string): BroadcastOperator {
    return new BroadcastOperator(this._client, this._namespace, [], [room], this.id);
  }

  get broadcast(): BroadcastOperator {
    return new BroadcastOperator(this._client, this._namespace, [], [], this.id);
  }
}
