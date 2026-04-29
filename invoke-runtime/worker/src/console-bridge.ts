// ============================================================================
// Console Bridge — Overrides console methods to send logs to the host
// ============================================================================

import type { IIpcChannel } from './protocol'

const ORIGINAL_CONSOLE: Record<string, Function> = {}

type Middleware = (level: string, args: string[]) => Record<string, unknown> | null

function consoleMiddleware(level: string, args: string[]) {
  return { level, args }
}

let instrument = false

/** @internal */
export function enableInstrument() {
  instrument = true
  console.log('[console-bridge] instrument enabled')
}

/**
 * Install console overrides that send log output to the host over the
 * Unix socket as fire-and-forget `console` events.
 *
 * Returns a restore function that puts the original methods back.
 * @internal
 */
export function installConsoleBridge(ipc: IIpcChannel, middleware: Middleware = consoleMiddleware): () => void {
  const levels = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const

  for (const level of levels) {
    const original = (console as any)[level]
    ORIGINAL_CONSOLE[level] = original
    ;(console as any)[level] = (...args: unknown[]) => {
      // Fire-and-forget — don't await, don't throw on write failure
      try {
        const payload = middleware(level, args.map(formatArg))
        if (payload) {
          ipc.emit('console', payload)
        }
      } catch {
        // Socket may be closed; fall through to original
      } finally {
        if (instrument) {
          original(...args)
        }
      }
    }
  }

  // console.clear() is a no-op inside the sandbox
  console.clear = () => {}

  // Return a restore function for cleanup
  return () => {
    for (const level of levels) {
      if (ORIGINAL_CONSOLE[level]) {
        ;(console as any)[level] = ORIGINAL_CONSOLE[level]
      }
    }
  }
}

function formatArg(arg: unknown): string {
  if (arg === undefined) return 'undefined'
  if (arg === null) return 'null'
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.stack ?? arg.message
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}
