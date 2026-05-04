// ============================================================================
// BroadcastOperator — Chainable emitter for room/namespace broadcast targets
// ============================================================================

import type { RealtimeClient } from './client'

/**
 * Chainable realtime broadcaster for namespace and room targeting.
 */
export class BroadcastOperator {
  /** @internal */
  private _client: RealtimeClient
  /** @internal */
  private _namespace: string | null
  /** @internal */
  private _rooms: string[]
  /** @internal */
  private _exceptRooms: string[]
  /** @internal */
  private _socketId: string | null

  /** @internal */
  constructor(
    client: RealtimeClient,
    namespace: string | null,
    rooms: string[],
    exceptRooms: string[],
    socketId: string | null
  ) {
    this._client = client
    this._namespace = namespace
    this._rooms = rooms.slice()
    this._exceptRooms = exceptRooms.slice()
    this._socketId = socketId
  }

  /**
   * Add a room to the target set.
   * @param room Room identifier.
   * @returns A new broadcast operator with the additional room.
   */
  to(room: string): BroadcastOperator {
    return new BroadcastOperator(
      this._client,
      this._namespace,
      this._rooms.concat([room]),
      this._exceptRooms,
      this._socketId
    )
  }

  /**
   * Alias of `to(room)`.
   * @param room Room identifier.
   * @returns A new broadcast operator with the additional room.
   */
  in(room: string): BroadcastOperator {
    return this.to(room)
  }

  /**
   * Exclude a room from the target set.
   * @param room Room identifier.
   * @returns A new broadcast operator with the room excluded.
   */
  except(room: string): BroadcastOperator {
    return new BroadcastOperator(
      this._client,
      this._namespace,
      this._rooms,
      this._exceptRooms.concat([room]),
      this._socketId
    )
  }

  /**
   * Emit an event to the selected namespace/room targets.
   * @param event Event name.
   * @param args Event payload arguments.
   * @returns A promise that resolves when the command is accepted.
   */
  emit(event: string, ...args: unknown[]): Promise<void> {
    let cmd: Record<string, unknown>

    if (this._socketId) {
      // Socket-level broadcast — excludes the sender socket
      cmd = {
        command: 'broadcast',
        namespace: this._namespace,
        socketId: this._socketId,
        roomIds: this._rooms,
        exceptRooms: this._exceptRooms,
        event,
        args
      }
    } else {
      // Namespace-level targeted emit
      cmd = {
        command: 'ns-emit',
        namespace: this._namespace,
        roomIds: this._rooms,
        exceptRooms: this._exceptRooms,
        event,
        args
      }
    }

    return this._client.send(cmd)
  }
}
