// ============================================================================
// OverlayFS — Manages OverlayFS mounts for each sandbox
// ============================================================================

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFile = promisify(execFileCb);

const OVERLAY_BASE = process.env.OVERLAY_BASE || '/var/run/invoke-overlays';
const DEFAULT_TMPFS_LIMIT_MB = parseInt(process.env.SANDBOX_TMPFS_LIMIT_MB ?? '64', 10);

interface OverlayMount {
  sandboxId: string;
  lowerDir: string;   // Read-only function code
  upperDir: string;    // Writable tmpfs layer
  workDir: string;     // OverlayFS work directory
  mergedDir: string;   // The union mount point → /app inside sandbox
  mode: 'overlay' | 'copy';
}

const activeMounts = new Map<string, OverlayMount>();

/**
 * Set up an OverlayFS mount for a sandbox.
 *
 * @param sandboxId    — Unique sandbox identifier
 * @param functionDir  — Path to the extracted function package (read-only)
 * @param tmpfsLimitMb — Size limit for the writable tmpfs layer (default 64MB)
 * @returns The merged directory path to be mounted as /app
 */
export async function setupOverlay(
  sandboxId: string,
  functionDir: string,
  tmpfsLimitMb: number = DEFAULT_TMPFS_LIMIT_MB,
): Promise<string> {
  const base = path.join(OVERLAY_BASE, sandboxId);
  const upperDir = path.join(base, 'upper');
  const workDir = path.join(base, 'work');
  const mergedDir = path.join(base, 'merged');

  await fs.mkdir(upperDir, { recursive: true });
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(mergedDir, { recursive: true });

  let mode: OverlayMount['mode'] = 'overlay';

  try {
    // Mount tmpfs for the writable layer with a size limit
    const sizeOpt = `size=${tmpfsLimitMb}m`;
    await execFile('mount', ['-t', 'tmpfs', '-o', `${sizeOpt},nosuid,noexec`, 'tmpfs', upperDir]);

    // Mount overlayfs — lowerdir is the read-only function code
    const overlayOpts = `lowerdir=${functionDir},upperdir=${upperDir},workdir=${workDir}`;
    await execFile('mount', ['-t', 'overlay', 'overlay', '-o', overlayOpts, mergedDir]);
  } catch (error) {
    // Docker Desktop/Windows kernels may not permit overlay mounts in containers.
    // Fallback: materialize the lowerdir into mergedDir (debug/degraded mode).
    mode = 'copy';

    try {
      await execFile('umount', ['-l', upperDir]);
    } catch {
      // Best effort
    }

    await fs.rm(mergedDir, { recursive: true, force: true });
    await fs.mkdir(mergedDir, { recursive: true });
    await fs.cp(functionDir, mergedDir, { recursive: true, force: true });

    console.warn(
      `[OverlayFS] Kernel overlay mount unavailable for sandbox ${sandboxId}; using copy fallback mode.`,
      error,
    );
  }

  const mount: OverlayMount = {
    sandboxId,
    lowerDir: functionDir,
    upperDir,
    workDir,
    mergedDir,
    mode,
  };

  activeMounts.set(sandboxId, mount);
  return mergedDir;
}

/**
 * Tear down the OverlayFS mount for a sandbox.
 */
export async function destroyOverlay(sandboxId: string): Promise<void> {
  const mount = activeMounts.get(sandboxId);
  if (!mount) return;

  activeMounts.delete(sandboxId);

  if (mount.mode === 'overlay') {
    // Unmount in reverse order: merged first, then upper tmpfs
    try {
      await execFile('umount', ['-l', mount.mergedDir]);
    } catch {
      // Best effort
    }

    try {
      await execFile('umount', ['-l', mount.upperDir]);
    } catch {
      // Best effort
    }
  }

  // Remove directories
  try {
    await fs.rm(path.join(OVERLAY_BASE, sandboxId), { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

/**
 * Tear down all active OverlayFS mounts (for shutdown).
 */
export async function destroyAllOverlays(): Promise<void> {
  const ids = [...activeMounts.keys()];
  await Promise.allSettled(ids.map(destroyOverlay));
}
