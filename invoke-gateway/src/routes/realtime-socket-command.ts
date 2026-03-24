import { Router, Request, Response } from 'express';
import { Server, Socket } from 'socket.io';

const router = Router();

let _io: Server | null = null;

/**
 * Register the Socket.IO server instance so this route can dispatch commands.
 */
export function registerIo(io: Server): void {
  _io = io;
}

/**
 * POST /_realtime/command
 *
 * Internal endpoint called by invoke-execution's realtime socket bridge.
 * Only reachable from execution workers; protected by x-internal-secret.
 *
 * Body (JSON):
 *   { command, namespace, roomIds?, exceptRooms?, socketId?, event?, args? }
 *
 * Commands:
 *   - "emit"           — emit to a specific socket
 *   - "ns-emit"        — namespace-level broadcast (optional rooms/except filters)
 *   - "broadcast"      — namespace broadcast from a socket (excludes sender)
 *   - "join"           — add socket to a room
 *   - "leave"          — remove socket from a room
 *   - "disconnect"     — force-disconnect a socket
 */
router.post('/_realtime/command', (req: Request, res: Response): void => {
  void (async () => {
    await handleRealtimeCommand(req, res);
  })();
});

async function handleRealtimeCommand(req: Request, res: Response): Promise<void> {
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  if (internalSecret) {
    const provided = req.headers['x-internal-secret'];
    if (provided !== internalSecret) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  if (!_io) {
    res.status(503).json({ error: 'Socket.IO not initialised' });
    return;
  }

  let body: Record<string, any>;
  try {
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body);
    body = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const { command, namespace, roomIds, exceptRooms, socketId, event, args } = body as {
    command: string;
    namespace?: string;
    roomIds?: string[];
    exceptRooms?: string[];
    socketId?: string;
    event?: string;
    args?: unknown[];
  };

  try {
    const nsp = namespace ? _io.of(namespace) : _io.of('/');

    switch (command) {
      case 'emit': {
        // Emit directly to a specific socket
        if (!socketId || !event) break;
        const socket: Socket | undefined = nsp.sockets.get(socketId);
        if (socket) socket.emit(event, ...(args || []));
        break;
      }

      case 'ns-emit': {
        // Broadcast from namespace level (with optional room/except filters)
        if (!event) break;
        let op: ReturnType<typeof nsp.to> | typeof nsp = nsp;
        if (roomIds && roomIds.length > 0) {
          op = nsp.to(roomIds);
        }
        if (exceptRooms && exceptRooms.length > 0) {
          (op as ReturnType<typeof nsp.to>).except(exceptRooms).emit(event, ...(args || []));
        } else {
          (op as any).emit(event, ...(args || []));
        }
        break;
      }

      case 'broadcast': {
        // Broadcast from a socket (excludes sender)
        if (!socketId || !event) break;
        const socket: Socket | undefined = nsp.sockets.get(socketId);
        if (!socket) break;
        let op = roomIds && roomIds.length > 0 ? socket.to(roomIds) : socket.broadcast;
        if (exceptRooms && exceptRooms.length > 0) {
          op = (op as any).except(exceptRooms);
        }
        op.emit(event, ...(args || []));
        break;
      }

      case 'join': {
        if (!socketId || !roomIds) break;
        const socket: Socket | undefined = nsp.sockets.get(socketId);
        if (socket) await socket.join(roomIds);
        break;
      }

      case 'leave': {
        if (!socketId || !roomIds) break;
        const socket: Socket | undefined = nsp.sockets.get(socketId);
        if (socket) {
          for (const room of roomIds) socket.leave(room);
        }
        break;
      }

      case 'disconnect': {
        if (!socketId) break;
        const socket: Socket | undefined = nsp.sockets.get(socketId);
        if (socket) socket.disconnect(true);
        break;
      }

      default:
        res.status(400).json({ error: `Unknown command: ${command}` });
        return;
    }

    res.status(204).end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[RealtimeCommand] Error processing command:', message);
    res.status(500).json({ error: 'Internal error processing command' });
  }
}

export default router;
