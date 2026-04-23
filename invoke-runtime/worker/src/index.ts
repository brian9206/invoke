// ============================================================================
// Worker Main — Per-invocation process (runs inside chroot, privileges
// already dropped by the C++ supervisor).
// Reads entry basename from argv, connects to the host runtime over the
// bind-mounted UDS, requests payload, executes user code, sends result back.
// ============================================================================

import { IpcChannel } from './protocol';
import { runUserCode } from './run_execute';
import { runBuild } from './run_build';
import { enableInstrument } from './logger/console-bridge';

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

if (instrument) enableInstrument();

// ---------------------------------------------------------------------------
// Bootstrap and Dispatch
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  const ipc = IpcChannel.getInstance();

  ipc.on('error', (err: Error) => {
    console.error('[worker] Connection error:', err);
    process.exit(1);
  });

  await ipc.connected;
  ipc.emit('payload');
  log('[worker] Requested payload from host');

  ipc.once('payload', async (payload: any) => {
    switch (payload?.type) {
      case 'execute':
        console.log('[worker] Starting user code execution procedure...');
        await runUserCode(entry!, payload, log);
        break;
      case 'build':
        console.log('[worker] Starting build procedure...');
        await runBuild(payload, log);
        break;
      default:
        console.error('[worker] Fatal error: unknown payload type:', payload?.type);
        process.exit(1);
    }
  });
}

bootstrap().catch((err) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
