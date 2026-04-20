// ============================================================================
// Console Bridge — Overrides console methods to send logs to the host
// ============================================================================

import type net from 'net';
import { encode } from '../protocol';

const ORIGINAL_CONSOLE: Record<string, Function> = {};

/**
 * Install console overrides that send log output to the host over the
 * Unix socket as fire-and-forget `console` events.
 *
 * Returns a restore function that puts the original methods back.
 */
export function installConsoleBridge(socket: net.Socket): () => void {
  const levels = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

  for (const level of levels) {
    const original = (console as any)[level];
    ORIGINAL_CONSOLE[level] = original;

    (console as any)[level] = (...args: unknown[]) => {
      // Fire-and-forget — don't await, don't throw on write failure
      try {
        socket.write(encode('console', { level, args: args.map(formatArg) }));
      } catch {
        // Socket may be closed; fall through to original
      }
    };
  }

  // console.clear() is a no-op inside the sandbox
  console.clear = () => {};

  // Return a restore function for cleanup
  return () => {
    for (const level of levels) {
      if (ORIGINAL_CONSOLE[level]) {
        (console as any)[level] = ORIGINAL_CONSOLE[level];
      }
    }
  };
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
