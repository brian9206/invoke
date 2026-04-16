// ============================================================================
// BroadcastOperator — Chainable emitter for room/namespace broadcast targets
// ============================================================================

import type { RealtimeClient } from './client';

export class BroadcastOperator {
  private _client: RealtimeClient;
  private _namespace: string | null;
  private _rooms: string[];
  private _exceptRooms: string[];
  private _socketId: string | null;

  constructor(
    client: RealtimeClient,
    namespace: string | null,
    rooms: string[],
    exceptRooms: string[],
    socketId: string | null,
  ) {
    this._client = client;
    this._namespace = namespace;
    this._rooms = rooms.slice();
    this._exceptRooms = exceptRooms.slice();
    this._socketId = socketId;
  }

  to(room: string): BroadcastOperator {
    return new BroadcastOperator(
      this._client,
      this._namespace,
      this._rooms.concat([room]),
      this._exceptRooms,
      this._socketId,
    );
  }

  in(room: string): BroadcastOperator {
    return this.to(room);
  }

  except(room: string): BroadcastOperator {
    return new BroadcastOperator(
      this._client,
      this._namespace,
      this._rooms,
      this._exceptRooms.concat([room]),
      this._socketId,
    );
  }

  emit(event: string, ...args: unknown[]): Promise<void> {
    let cmd: Record<string, unknown>;

    if (this._socketId) {
      // Socket-level broadcast — excludes the sender socket
      cmd = {
        command: 'broadcast',
        namespace: this._namespace,
        socketId: this._socketId,
        roomIds: this._rooms,
        exceptRooms: this._exceptRooms,
        event,
        args,
      };
    } else {
      // Namespace-level targeted emit
      cmd = {
        command: 'ns-emit',
        namespace: this._namespace,
        roomIds: this._rooms,
        exceptRooms: this._exceptRooms,
        event,
        args,
      };
    }

    return this._client.send(cmd);
  }
}
