// ============================================================================
// SocketProxy — Per-invocation socket representation exposed as `ns.socket`
// ============================================================================

import type { RealtimeClient } from './client';
import { BroadcastOperator } from './broadcast-operator';

/** Metadata about the current realtime socket handshake. */
export interface Handshake {
  /** HTTP headers sent during the initial handshake request. */
  headers: Record<string, unknown>;
  /** Query string parameters from the handshake URL. */
  query: Record<string, unknown>;
  /** Auth payload passed by the client (e.g. token). */
  auth: Record<string, unknown>;
  /** Remote IP address of the connecting client. */
  address?: string;
  /** Timestamp string of when the handshake occurred. */
  time?: string;
  /** Reason the socket was disconnected, if applicable. */
  disconnectReason?: string;
}

type EventHandler = (...args: unknown[]) => unknown;

/**
 * Socket-like API exposed as `ns.socket` for realtime event handlers.
 */
export class SocketProxy {
  /** Unique socket identifier assigned by the server. */
  id: string;
  /** Set of room names the socket is currently joined to. */
  rooms: Set<string>;
  /** Metadata from the initial socket handshake. */
  handshake: Handshake;
  /** `true` while the socket is connected; `false` after disconnection. */
  connected: boolean;
  /** Arbitrary per-socket data storage for use within event handlers. */
  data: Record<string, unknown>;
  /** Reason the socket disconnected, or `null` if still connected. */
  disconnectReason: string | null;
  /** @internal */
  _namespace: string | null;
  /** @internal */
  _handlers: Record<string, EventHandler>;
  /** @internal */
  private _client: RealtimeClient;

  /** @internal */
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

  /**
   * Re-initialize per invocation (avoids allocating a new object per request)
   * @internal
   */
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

  /**
   * Register a socket event handler.
   * @param event Event name.
   * @param handler Event handler callback.
   * @returns The socket instance.
   */
  on(event: string, handler: EventHandler): this {
    this._handlers[event] = handler;
    return this;
  }

  /**
   * Register a socket event handler that runs once.
   * @param event Event name.
   * @param handler Event handler callback.
   * @returns The socket instance.
   */
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

  /**
   * Emit an event to this socket.
   * @param event Event name.
   * @param args Event payload arguments.
   * @returns A promise that resolves when the command is accepted.
   */
  emit(event: string, ...args: unknown[]): Promise<void> {
    return this._client.send({
      command: 'emit',
      namespace: this._namespace,
      socketId: this.id,
      event,
      args,
    });
  }

  /**
   * Join one or more rooms.
   * @param room Room ID or room IDs.
   * @returns A promise that resolves when the command is accepted.
   */
  join(room: string | string[]): Promise<void> {
    return this._client.send({
      command: 'join',
      namespace: this._namespace,
      socketId: this.id,
      roomIds: Array.isArray(room) ? room : [room],
    });
  }

  /**
   * Leave one or more rooms.
   * @param room Room ID or room IDs.
   * @returns A promise that resolves when the command is accepted.
   */
  leave(room: string | string[]): Promise<void> {
    return this._client.send({
      command: 'leave',
      namespace: this._namespace,
      socketId: this.id,
      roomIds: Array.isArray(room) ? room : [room],
    });
  }

  /**
   * Disconnect the socket.
   * @param close Whether to close the underlying connection (defaults to true).
   * @returns A promise that resolves when the command is accepted.
   */
  disconnect(close?: boolean): Promise<void> {
    this.connected = false;
    return this._client.send({
      command: 'disconnect',
      namespace: this._namespace,
      socketId: this.id,
      close: close !== false,
    });
  }

  /**
   * Create a room-targeted broadcast operator.
   * @param room Room identifier.
   * @returns A chainable broadcast operator.
   */
  to(room: string): BroadcastOperator {
    return new BroadcastOperator(this._client, this._namespace, [room], [], this.id);
  }

  /**
   * Alias of `to(room)`.
   * @param room Room identifier.
   * @returns A chainable broadcast operator.
   */
  in(room: string): BroadcastOperator {
    return this.to(room);
  }

  /**
   * Create a broadcast operator excluding a room.
   * @param room Room identifier.
   * @returns A chainable broadcast operator.
   */
  except(room: string): BroadcastOperator {
    return new BroadcastOperator(this._client, this._namespace, [], [room], this.id);
  }

  /**
   * Create a broadcast operator excluding the current socket.
   * @returns A chainable broadcast operator.
   */
  get broadcast(): BroadcastOperator {
    return new BroadcastOperator(this._client, this._namespace, [], [], this.id);
  }
}
