// ============================================================================
// BuildService — Drains the function_builds queue and runs Bun build inside
// invoke-runtime sandbox containers.
// ============================================================================

import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import * as tar from 'tar';
import { createNotifyListener } from 'invoke-shared';
import database from './database';
import { getSandboxPool, BUILD_TEMP_DIR } from './sandbox-pool';
import { insertBuildLog } from './logger-client';
const { s3Service } = require('invoke-shared');

const BUILD_TIMEOUT_MS = parseInt(process.env.BUILD_TIMEOUT_MINUTES || '5', 10) * 60 * 1000;

export class BuildService {
  private running = new Set<string>(); // build IDs currently running
  private pgNotify = createNotifyListener('build_queue_updated', {
    parsePayload: (raw: any) => (typeof raw === 'string' ? JSON.parse(raw) : (raw || {})),
  });

  async start(): Promise<void> {
    await fs.mkdir(BUILD_TEMP_DIR, { recursive: true });

    await this.pgNotify.connect(async () => {
      await this.processBuildQueue();
    });

    // Initial drain on startup
    await this.processBuildQueue();
    console.log('[BuildService] started');
  }

  async stop(): Promise<void> {
    await this.pgNotify.stop();
  }

  // -------------------------------------------------------------------------
  // Queue processing
  // -------------------------------------------------------------------------

  private async processBuildQueue(): Promise<void> {
    const { GlobalSetting, FunctionBuild } = database.models as any;

    try {
      const setting = await GlobalSetting.findOne({
        where: { setting_key: 'max_concurrent_builds' },
        attributes: ['setting_value'],
      });
      const maxConcurrent = parseInt(setting?.setting_value ?? '2', 10) || 2;

      const available = maxConcurrent - this.running.size;
      if (available <= 0) return;

      const queued = await FunctionBuild.findAll({
        where: { status: 'queued' },
        order: [['created_at', 'ASC']],
        limit: available,
        include: [
          {
            model: database.models.FunctionVersion as any,
            as: 'version',
            attributes: ['id', 'version', 'package_path', 'package_hash', 'function_id'],
          },
        ],
      });

      for (const build of queued as any[]) {
        const buildData = build.get({ plain: false });
        if (!this.running.has(buildData.id)) {
          this.running.add(buildData.id);
          this.runBuild(buildData).finally(() => this.running.delete(buildData.id));
        }
      }
    } catch (err) {
      console.error('[BuildService] processBuildQueue error:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Single build execution
  // -------------------------------------------------------------------------

  private async runBuild(build: any): Promise<void> {
    const buildId = build.id;
    const versionRecord = build.version;
    const functionId = build.function_id;
    const versionNum = versionRecord?.version;

    console.log(`[BuildService] Starting build ${buildId} (fn=${functionId} v${versionNum})`);

    const { FunctionBuild, FunctionVersion, Function: FunctionModel, Project } = database.models as any;
    const buildTempDir = path.join(BUILD_TEMP_DIR, buildId);

    try {
      // Retrieve function and project info for logging context
      const fnRecord = await FunctionModel.findByPk(functionId, {
        attributes: ['id', 'name', 'project_id'],
      });
      const functionName = fnRecord?.name ?? null;
      const projectId = fnRecord?.project_id ?? null;

      let projectName: string | null = null;
      if (projectId) {
        const projectRecord = await Project.findByPk(projectId, { attributes: ['name'] });
        projectName = projectRecord?.name ?? null;
      }

      // Mark running
      await FunctionBuild.update(
        { status: 'running', started_at: new Date() },
        { where: { id: buildId } },
      );
      await (FunctionVersion as any).update(
        { build_status: 'building' },
        { where: { id: build.version_id } },
      );

      // Prepare build temp dir
      const sourceDir = path.join(buildTempDir, 'source');
      await fs.remove(sourceDir);
      await fs.ensureDir(sourceDir);

      // Download source package from S3
      const sourceTgz = path.join(buildTempDir, 'source.tgz');
      await s3Service.downloadPackageFromPath(versionRecord.package_path, sourceTgz);

      // Extract source
      await tar.extract({ file: sourceTgz, cwd: sourceDir });

      // Create artifact output dir
      const artifactDir = path.join(buildTempDir, 'output');
      await fs.ensureDir(artifactDir);
      await fs.chmod(artifactDir, 0o777); // ensure write permissions for sandbox user

      // Acquire sandbox from pool
      const pool = getSandboxPool();
      const sandbox = await pool.acquire();

      let buildLogs: { message: string, timestamp: string }[] = [];
      let buildResult: { success: boolean; error?: string, artifactHash?: string, uploadResult?: any } | null = null;
      const onConsole = (payload: { level: string; args: string[], details?: object }) => {
        if (!payload) return;
        const message = payload.args?.join(' ') ?? '';
        insertBuildLog({
          project: { id: projectId, name: projectName },
          function: { id: functionId, name: functionName },
          build: { id: buildId, version: versionNum },
          message
        });
      };

      try {
        // Collect build_log events from worker
        sandbox.on('console', onConsole);

        // Wait for build_complete from supervisor
        const buildCompletePromise = new Promise<{ success: boolean; error?: string, artifactHash?: string, uploadResult?: any }>(
          (resolve, reject) => {
            const timer = setTimeout(() => {
              reject(new Error(`Build timeout (${BUILD_TIMEOUT_MS}ms)`));
            }, BUILD_TIMEOUT_MS);

            const onComplete = async (payload: any) => {
              clearTimeout(timer);
              sandbox.removeListener('build_complete', onComplete);
              sandbox.removeListener('ready', onReady);

              try {
                // Create and Upload artifact.tgz to S3
                const artifactLocalPath = path.join(artifactDir, 'artifacts.tgz');
                const uploadResult = await s3Service.uploadArtifact(functionId, versionNum, artifactLocalPath);

                // Compute hash of artifact
                const artifactBuf = await fs.readFile(artifactLocalPath);
                const artifactHash = crypto.createHash('sha256').update(artifactBuf).digest('hex');

                sandbox.emit('build_end');

                resolve({ ...payload, success: true, artifactHash, uploadResult });
              }
              catch (err) {
                console.log(`[BuildService] Unable to upload artifact of ${buildId}.`, err);
                const errorMessage = (err instanceof Error) ? err.message : String(err) || 'unknown error';
                resolve({ success: false, error: `Failed to upload artifact: ${errorMessage}` });
              }
            };

            const onReady = () => {
              clearTimeout(timer);
              sandbox.removeListener('build_complete', onComplete);
              sandbox.removeListener('ready', onReady);
              resolve({ success: false, error: 'Sandbox became ready before build_complete' });
            };

            sandbox.on('build_complete', onComplete);
            sandbox.on('ready', onReady);
          },
        );

        // Set bootstrap payload for worker (type: 'build')
        sandbox.setPendingBootstrapPayload({ type: 'build', buildId });

        // Send build event to supervisor
        sandbox.emit('build', {
          buildId,
          env: {},
        });

        buildResult = await buildCompletePromise;
        sandbox.removeListener('console', onConsole);
        // Note: no explicit release — pool returns sandbox to idle on supervisor's 'ready' event
      } catch (err) {
        sandbox.removeListener('console', onConsole);
        throw err;
      }

      if (!buildResult?.success) {
        throw new Error(buildResult?.error ?? 'Build failed');
      }

      // Update function_versions with artifact info
      await (FunctionVersion as any).update(
        {
          artifact_path: buildResult?.uploadResult?.objectName,
          artifact_hash: buildResult?.artifactHash,
          build_status: 'built',
        },
        { where: { id: build.version_id } },
      );

      // Mark build success
      await FunctionBuild.update(
        {
          status: 'success',
          artifact_path: buildResult?.uploadResult?.objectName,
          artifact_hash: buildResult?.artifactHash,
          build_log: buildLogs.length > 0 ? JSON.stringify(buildLogs) : null,
          completed_at: new Date(),
        },
        { where: { id: buildId } },
      );

      console.log(`[BuildService] Build ${buildId} succeeded. Artifact: ${buildResult?.uploadResult?.objectName}`);

      // Handle after_build_action
      if (build.after_build_action === 'switch') {
        await (FunctionModel as any).update(
          { active_version_id: build.version_id, is_active: true, updated_at: new Date() },
          { where: { id: functionId } },
        );
        console.log(`[BuildService] Switched fn=${functionId} to version ${versionNum} after build`);
        // Invalidate execution cache
        await database.sequelize.query(
          `SELECT pg_notify('execution_cache_invalidated', :payload::text)`,
          { replacements: { payload: JSON.stringify({ table: 'functions', action: 'UPDATE', function_id: functionId }) } },
        );
      }
    } catch (err: any) {
      console.error(`[BuildService] Build ${buildId} failed:`, err.message);

      await FunctionBuild.update(
        {
          status: 'failed',
          error_message: err.message,
          completed_at: new Date(),
        },
        { where: { id: buildId } },
      ).catch(() => {});

      await (FunctionVersion as any).update(
        { build_status: 'failed' },
        { where: { id: build.version_id } },
      ).catch(() => {});
    } finally {
      // Clean up temp dir
      await fs.rm(buildTempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

let _buildService: BuildService | null = null;

export function getBuildService(): BuildService {
  if (!_buildService) _buildService = new BuildService();
  return _buildService;
}
