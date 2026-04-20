import type net from 'net';
import { Writable } from 'stream';
import pino from 'pino';
import { encode } from '../protocol';
import yaml from 'js-yaml';

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

export function setupLoggerGlobal(socket?: net.Socket): void {
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

        if (socket) {
          socket.write(encode('console', payload));
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

  const logger = pino({ level: 'trace', base: undefined, timestamp: false }, dest);

  (globalThis as any).logger = logger;
}
