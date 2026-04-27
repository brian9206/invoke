// ============================================================================
// Build Handler — Per-build process
// Runs bun build, installs dependencies, and prepares output
// ============================================================================

import fs from 'fs/promises'
import { type BuildData, IpcChannel } from './protocol';
import * as tar from 'tar';
import { installConsoleBridge } from './console-bridge';
import { createPipelineRunner } from './builder';
import type { BuildContext, Pipeline } from './builder/types';

export async function runBuild(
  bootstrapPayload: any,
  log: (...args: unknown[]) => void,
): Promise<void> {
  const ipc = IpcChannel.getInstance();
  const buildData: BuildData = bootstrapPayload.request;

  const restoreConsole = installConsoleBridge(ipc);  
  const pipeline = 'bun';

  let error = false;
  try {
    log('[builder] Creating build pipeline runner...');
    const runner = await createPipelineRunner(pipeline);

    // Extract pipeline definition (stage names + dependencies) for build_context
    const pipelineDefinition = runner.getPipelineDefinition();

    // Helper: emit build_context IPC event with current stage statuses
    const emitBuildContext = (context: BuildContext) => {
      ipc.emit('build_context', {
        pipeline: pipelineDefinition,
        stages: context.stages,
      });
    };

    // Emit initial build_context with all stages pending
    const initialStages: Record<string, { status: string }> = {};
    for (const s of pipelineDefinition.stages) {
      initialStages[s.name] = { status: 'pending' };
    }
    ipc.emit('build_context', { pipeline: pipelineDefinition, stages: initialStages });

    runner.on('running', ({ stage, context }: { stage: string; context: BuildContext }) => {
      console.log(`[builder] Starting stage "${stage}"...`);
      emitBuildContext(context);
    });

    runner.on('success', ({ stage, context }: { stage: string; context: BuildContext }) => {
      console.log(`[builder] Stage "${stage}" completed successfully.`);
      emitBuildContext(context);
    });

    runner.on('failure', ({ stage, error, context }: { stage: string; error?: string; context: BuildContext }) => {
      console.log(`[builder] Stage "${stage}" failed with error ${error}`);
      emitBuildContext(context);
    });

    runner.on('error', (error: Error) => {
      console.log(`[builder] Build failed with error:`, error);
    });

    console.log(`[builder] Start running pipeline "${pipeline}"...`);
    await runner.run(buildData);

    // Create /output/artifacts.tgz
    const outFiles = await fs.readdir('/output/artifacts');
    if (outFiles.length === 0) {
      throw new Error('Pipeline produced no output files');
    }

    console.log(`[builder] Creating artifacts tarball...`);
    await tar.create(
      {
        gzip: true,
        file: '/output/artifacts.tgz',
        cwd: '/output/artifacts',
      },
      ['.']
    );

    console.log('[builder] Artifacts tarball created successfully.');
    ipc.emit('build_complete');

    await Promise.any([
      new Promise<void>((resolve) => setTimeout(resolve, 30 * 1000)),
      new Promise<void>((resolve) => ipc.once('build_end', () => resolve())),
    ]);

    log('[builder] Build end received. exiting...');
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
