import type { IIpcChannel } from '../../protocol';
import { Writable } from 'stream';
import pino from 'pino';
import yaml from 'js-yaml';

/**
 * Structured logger exposed globally as `logger`.
 */
export interface InvokeLogger {
  /**
   * Log a trace-level message.
   * @param msg Log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  trace(msg: string, ...args: unknown[]): void;
  /**
   * Log a trace-level message with structured metadata.
   * @param obj Structured metadata.
   * @param msg Optional log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  trace(obj: object, msg?: string, ...args: unknown[]): void;
  /**
   * Log a debug-level message.
   * @param msg Log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  debug(msg: string, ...args: unknown[]): void;
  /**
   * Log a debug-level message with structured metadata.
   * @param obj Structured metadata.
   * @param msg Optional log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  debug(obj: object, msg?: string, ...args: unknown[]): void;
  /**
   * Log an info-level message.
   * @param msg Log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  info(msg: string, ...args: unknown[]): void;
  /**
   * Log an info-level message with structured metadata.
   * @param obj Structured metadata.
   * @param msg Optional log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  info(obj: object, msg?: string, ...args: unknown[]): void;
  /**
   * Log a warning-level message.
   * @param msg Log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  warn(msg: string, ...args: unknown[]): void;
  /**
   * Log a warning-level message with structured metadata.
   * @param obj Structured metadata.
   * @param msg Optional log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  warn(obj: object, msg?: string, ...args: unknown[]): void;
  /**
   * Log an error-level message.
   * @param msg Log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  error(msg: string, ...args: unknown[]): void;
  /**
   * Log an error-level message with structured metadata.
   * @param obj Structured metadata.
   * @param msg Optional log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  error(obj: object, msg?: string, ...args: unknown[]): void;
  /**
   * Log a fatal-level message.
   * @param msg Log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  fatal(msg: string, ...args: unknown[]): void;
  /**
   * Log a fatal-level message with structured metadata.
   * @param obj Structured metadata.
   * @param msg Optional log message.
   * @param args Additional values to log.
   * @returns Nothing.
   */
  fatal(obj: object, msg?: string, ...args: unknown[]): void;
  /** Current log level. */
  level: string;
  /**
   * Create a child logger with persistent metadata bindings.
   * @param bindings Structured fields attached to all child logs.
   * @returns A child logger.
   */
  child(bindings: Record<string, unknown>): InvokeLogger;
  /**
   * Check whether a level is currently enabled.
   * @param level Log level name.
   * @returns `true` when the level is enabled.
   */
  isLevelEnabled(level: string): boolean;
}

declare global {
  /** Global logger instance. */
  var logger: InvokeLogger;
}

// Pino encodes level as a number; map back to the string names our IPC uses.
const LEVEL_NAMES: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

// Fields that Pino always injects — strip them before passing as `details`.
const PINO_INTERNAL = new Set(['level', 'v', 'msg']);

/** @internal */
export function setupLoggerGlobal(ipc?: IIpcChannel): void {
  const dest = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      try {
        const line = chunk.toString().trimEnd();
        let parsed: Record<string, unknown>;

        try {
          parsed = JSON.parse(line);
        } catch {
          // Non-JSON output from pino internals — discard silently.
          callback();
          return;
        }

        const levelNum = typeof parsed.level === 'number' ? parsed.level : 30;
        const level = LEVEL_NAMES[levelNum] ?? 'info';
        let msg = typeof parsed.msg === 'string' ? parsed.msg : String(parsed.msg ?? '');

        // Collect any user-supplied fields as structured details.
        const details: Record<string, unknown> = {};
        let hasDetails = false;
        for (const [k, v] of Object.entries(parsed)) {
          if (!PINO_INTERNAL.has(k)) {
            details[k] = v;
            hasDetails = true;
          }
        }

        if (hasDetails && msg === '' && !parsed.msg) {
          msg = yaml.dump(details, {
            skipInvalid: true,
            noRefs: true,
            noCompatMode: true,
          }).trimEnd();
        }

        const payload: Record<string, unknown> = { level, args: [msg] };
        if (hasDetails) payload.details = details;

        if (ipc) {
          ipc.emit('console', payload);
        }
        else {
          console.log(`[${level}]`, msg, hasDetails ? details : '');
        }
      } catch {
        // Never let a logging error crash user code.
      }

      callback();
    },
  });

  const loggerInstance = pino({ level: 'trace', base: undefined, timestamp: false }, dest);

  globalThis.logger = loggerInstance as unknown as InvokeLogger;
}
