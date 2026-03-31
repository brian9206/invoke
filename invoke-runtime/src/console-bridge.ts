// ============================================================================
// Console Bridge — Overrides console methods to send logs to the host
// ============================================================================

import type net from 'net';
import { encode, type ConsoleMessage } from './protocol';

/**
 * Install console overrides that send log output to the host over the
 * Unix socket as fire-and-forget `console` messages.
 */
export function installConsoleBridge(socket: net.Socket): void {
  const levels = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

  for (const level of levels) {
    const original = (console as any)[level];

    (console as any)[level] = (...args: unknown[]) => {
      const msg: ConsoleMessage = {
        type: 'console',
        level,
        args: args.map(formatArg),
      };

      // Fire-and-forget — don't await, don't throw on write failure
      try {
        socket.write(encode(msg));
      } catch {
        // Socket may be closed; fall through to original
      }

      // Also write to local stdout/stderr so gVisor logs capture it
      if (original) {
        original.apply(console, args);
      }
    };
  }

  // console.clear() is a no-op inside the sandbox
  console.clear = () => {};
}

function formatArg(arg: unknown): string {
  if (arg === undefined) return 'undefined';
  if (arg === null) return 'null';
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}
