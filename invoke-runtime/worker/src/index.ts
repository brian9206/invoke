// ============================================================================
// Worker Main — Per-invocation process (runs inside chroot, privileges
// already dropped by the C++ supervisor).
// Reads entry basename from argv, connects to the host runtime over the
// bind-mounted UDS, requests payload, executes user code, sends result back.
// ============================================================================

import { runUserCode } from './run_execute';
import { runBuild } from './run_build';

// ---------------------------------------------------------------------------
// Read and sanitize argv
// ---------------------------------------------------------------------------

// Parse our own args before wiping them
const _workerArgs = process.argv.slice(2);
const entry = _workerArgs.find(a => !a.startsWith('--'));
const instrument = _workerArgs.includes('--instrument');

// Fail fast if entry basename was not provided by supervisor
if (!entry) {
  console.error('[worker] Fatal: entry script basename not provided by supervisor');
  process.exit(1);
}

// Immediately clear internal args so user code cannot see them
process.argv.splice(2);

function log(...args: unknown[]): void {
  if (instrument) console.error(...args);
}

// ---------------------------------------------------------------------------
// Bootstrap and Dispatch
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  const { EventDecoder, encode } = await import('./protocol');
  const net = await import('net');

  const socket = net.createConnection('/run/events.sock');

  socket.on('error', (err) => {
    console.error('[worker] Connection error:', err);
    process.exit(1);
  });

  socket.on('connect', () => {
    socket.write(encode('payload'));
    log('[worker] Requested payload from host');

    const decoder = new EventDecoder();
    socket.once('data', async (chunk: Buffer) => {
      const events = decoder.feed(chunk);
      for (const ev of events) {
        if (ev.event === 'payload') {
          const bootstrapPayload = ev.payload;

          if (bootstrapPayload?.request?.type === 'build') {
            await runBuild(socket, bootstrapPayload.request, log);
          }
          else {
            await runUserCode(entry!, log);
          }

          return;
        }
      }
    });
  });
}

bootstrap().catch((err) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
