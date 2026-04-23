// ============================================================================
// Build Handler — Per-build process
// Runs bun build, installs dependencies, and prepares output
// ============================================================================

import fs from 'fs/promises'
import { type BuildData, IpcChannel } from './protocol';
import * as tar from 'tar';
import { installConsoleBridge } from './logger/console-bridge';
import { createPipelineRunner } from './buildSysten';

export async function runBuild(
  bootstrapPayload: any,
  log: (...args: unknown[]) => void,
): Promise<void> {
  const ipc = IpcChannel.getInstance();
  const buildData: BuildData = bootstrapPayload.request;

  const restoreConsole = installConsoleBridge(ipc);  

  let error = false;
  try {
    log('[build] Creating build pipeline runner...');
    const runner = await createPipelineRunner('bun');

    runner.on('running', ({ stage }: { stage: string }) => {
      console.log(`[build] Starting stage "${stage}"...`);
    });

    runner.on('success', ({ stage }: { stage: string }) => {
      console.log(`[build] Stage "${stage}" completed successfully.`);
    });

    runner.on('failure', ({ stage, error }: { stage: string, error?: string }) => {
      console.log(`[build] Stage "${stage}" failed with error ${error}`);
    });

    runner.on('error', (error: Error) => {
      console.log(`[build] Build failed with error:`, error);
    });

    log('[build] Start running...');
    await runner.run(buildData);

    // Create /output/artifacts.tgz
const outFiles = await fs.readdir('/output/artifacts');
        if (outFiles.length === 0) {
          throw new Error('bun build produced no output files');
        }

    console.log('[build] Creating artifacts tarball...');
    await tar.create(
      {
        gzip: true,
        file: '/output/artifacts.tgz',
        cwd: '/output/artifacts',
      },
      ['.']
    );

    log('[build] Notifying host build success...');
    ipc.emit('build_complete');

    await Promise.any([
      new Promise<void>((resolve) => setTimeout(resolve, 30 * 1000)),
      new Promise<void>((resolve) => ipc.once('build_end', () => resolve())),
    ]);

    log('[build] Build end received. exiting...');
  }
  catch (err) {
    error = true;
    console.log('Build failed with error:', err instanceof Error ? err.stack : err);
  }
  finally {
    restoreConsole();
    await ipc.end();
    process.exit(error ? 1 : 0);
  
  }
}
