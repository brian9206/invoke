// ============================================================================
// Build Handler — Per-build process
// Runs bun build, installs dependencies, and prepares output
// ============================================================================

import net from 'net';
import fs from 'fs/promises';
import { encode } from './protocol';
import path from 'path';

export async function runBuild(
  ipcSocket: net.Socket,
  payload: { buildId: string },
  log: (...args: unknown[]) => void,
): Promise<void> {
  const sendLog = (message: string) => {
    ipcSocket.write(encode('build_log', { message }));
  };

  const spawn = (cmds: string[], cwd: string) => {
    const proc = Bun.spawnSync(cmds,
      { cwd, stderr: 'pipe', stdout: 'pipe' },
    );

    const procStdout = proc.stdout ? Buffer.from(proc.stdout).toString() : '';
    const procStderr = proc.stderr ? Buffer.from(proc.stderr).toString() : '';
    if (procStdout) sendLog(procStdout);
    if (procStderr) sendLog(procStderr);

    if (proc.exitCode !== 0) {
      sendLog(`[build] Command '${cmds.join(' ')}' failed with exit code ${proc.exitCode}`);
      process.exit(1);
    }
  }

  try {
    log('[worker:build] Starting build for', payload.buildId);

    // bun install
    sendLog('[build] Running bun install...');
    spawn(['bun', 'install'], '/app');

    // Detect build script
    let entrypoint = '';
    let hasBuildScript = false;
    try {
      const packageJson = JSON.parse(await fs.readFile('/app/package.json', { encoding: 'utf-8' }));
      entrypoint = path.resolve(path.join('/app', packageJson.main || 'index.js'));
      hasBuildScript = !!packageJson?.scripts?.build;
    }
    catch {
      hasBuildScript = false;
      entrypoint = '/app/index.js';
    }

    if (hasBuildScript) {
      sendLog('[build] Running build script...');
      spawn(['bun', 'run', 'build'], '/app');
    }

    // Detect entrypoint: prefer index.js, fall back to index.ts
    try {
      entrypoint = '/app/index.js';
      await fs.access(entrypoint);
    } catch {
      try {
        entrypoint = '/app/index.ts';
        await fs.access(entrypoint);
      } catch {
        sendLog('[build] Error: no index.js or index.ts found in /app');
        process.exit(1);
      }
    }
   
    sendLog(`[build] Using entrypoint: ${entrypoint}`);
    spawn(
      ['bun', 'build', entrypoint, '--outdir', '/output', '--target', 'bun', '--minify', '--sourcemap'],
      '/app'
    );


    // Verify output was produced
    try {
      const outFiles = await fs.readdir('/output');
      if (outFiles.length === 0) {
        sendLog('[build] ERROR: bun build produced no output files');
        process.exit(1);
      }
    } catch (e: any) {
      sendLog(`[build] ERROR: could not list /output: ${e.message}`);
      process.exit(1);
    }

    sendLog('[build] bundle completed successfully.');

    // Step 2: Copy everything from /app to /output (except node_modules) so that user code can require() them
    const copyRecursive = async (src: string, dest: string) => {
      const entries = await fs.readdir(src, { withFileTypes: true });
      await fs.mkdir(dest, { recursive: true });

      for (const entry of entries) {
        if (entry.name === 'node_modules') continue; // skip node_modules

        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          await copyRecursive(srcPath, destPath);
        } else if (entry.isFile()) {
          await fs.copyFile(srcPath, destPath);
        }
      }
    };

    await copyRecursive('/app', '/output');
    sendLog('[build] Copied source files to output directory.');

    // Step 3: Install production dependencies in output directory
    sendLog('[build] Running bun install --production...');
    spawn(['bun', 'install', '--production'], '/output');

    sendLog('[build] build completed successfully.');

    // Flush and exit with success
    await new Promise<void>((resolve) => {
      ipcSocket.end(() => resolve());
      setTimeout(resolve, 1000).unref();
    });
    process.exit(0);
  } catch (err: any) {
    sendLog(`[build] Unexpected error: ${err.message}`);
    process.exit(1);
  }
}
