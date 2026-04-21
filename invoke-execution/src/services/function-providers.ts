import path from 'path';
import { Op } from 'sequelize';
import db from './database';
import cache from './cache';
import { createProjectKV } from './kv-store';

const ENV_VAR_TTL_MS = 60_000;
const NETWORK_POLICY_TTL_MS = 60_000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface FunctionMetadata {
  id: string;
  name: string;
  project_id: string;
  project_slug: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  version: string | null;
  package_path: string | null;
  package_hash: string | null;
  artifact_path: string | null;
  artifact_hash: string | null;
  file_size: number | null;
  custom_timeout_enabled: boolean;
  custom_timeout_seconds: number | null;
  custom_memory_enabled: boolean;
  custom_memory_mb: number | null;
}

interface NetworkPolicies {
  rules: any[];
}

interface PackageInfo {
  tempDir: string;
  indexPath: string;
  fromCache: boolean;
}

/** key → value pairs */
type EnvVars = Record<string, string>;

const envVarCache = new Map<string, CacheEntry<EnvVars>>();

export function invalidateEnvVarCache(functionId: string): void {
  envVarCache.delete(functionId);
}

export async function fetchEnvironmentVariables(functionId: string): Promise<EnvVars> {
  const cached = envVarCache.get(functionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const { FunctionEnvironmentVariable } = db.models;
    const rows = await FunctionEnvironmentVariable.findAll({
      where: { function_id: functionId },
    });

    const envVars: EnvVars = {};
    for (const row of rows as any[]) {
      envVars[row.variable_name] = row.variable_value;
    }

    envVarCache.set(functionId, { data: envVars, expiresAt: Date.now() + ENV_VAR_TTL_MS });
    return envVars;
  } catch (err) {
    console.error('Error fetching environment variables:', err);
    return {};
  }
}

export async function fetchNetworkPolicies(): Promise<NetworkPolicies> {
  try {
    const now = Date.now();

    const { NetworkPolicy } = db.models;

    const rows = await NetworkPolicy.findAll({
      attributes: ['action', 'target_type', 'target_value', 'description', 'priority'],
      order: [['priority', 'ASC']],
    });
    
    const rules = (rows as any[]).map((r: any) => r.get({ plain: true }));

    return { rules };
  } catch (err) {
    console.error('Error fetching network policies:', err);
    return { rules: [] };
  }
}

export async function getFunctionPackage(functionId: string, metadata: FunctionMetadata): Promise<PackageInfo> {
  const releaseLock = await cache.acquireLock(functionId);

  try {
    const t1 = Date.now();
    const functionData = metadata;
    const metadataFetchTime = Date.now() - t1;

    // Prefer pre-built artifact over raw source package
    const useArtifact = !!functionData.artifact_path && !!functionData.artifact_hash;
    const effectiveHash = useArtifact ? functionData.artifact_hash! : (functionData.package_hash ?? '');
    const effectivePath = useArtifact ? functionData.artifact_path! : (functionData.package_path ?? '');

    const t2 = Date.now();
    const cacheResult = await cache.checkCache(
      functionId,
      effectiveHash,
      functionData.version ?? '',
    );
    const cacheCheckTime = Date.now() - t2;

    if (cacheResult.cached && cacheResult.valid) {
      await cache.updateAccessStats(functionId);

      if (process.env.INVOKE_INSTRUMENT) {
        console.log(`[PACKAGE] ${functionId}: CACHED (metadata=${metadataFetchTime}ms | cacheCheck=${cacheCheckTime}ms)`);
      }

      return {
        tempDir: cacheResult.extractedPath!,
        indexPath: path.join(cacheResult.extractedPath!, 'index.js'),
        fromCache: true,
      };
    }

    if (cacheResult.cached && !cacheResult.valid) {
      console.log(`🧹 Removing invalid cache for ${functionId}`);
      await cache.removeFromCache(functionId);
    }

    console.log(`Downloading package for function ${functionId}`);

    const t3 = Date.now();
    const extractedPath = await cache.cachePackageFromPathNoLock(
      functionId,
      functionData.version ?? '',
      effectiveHash,
      functionData.file_size || 0,
      effectivePath,
    );
    const downloadTime = Date.now() - t3;

    if (process.env.INVOKE_INSTRUMENT) {
      console.log(`[PACKAGE] ${functionId}: DOWNLOADED (metadata=${metadataFetchTime}ms | cacheCheck=${cacheCheckTime}ms | download=${downloadTime}ms)`);
    }

    return {
      tempDir: extractedPath,
      indexPath: path.join(extractedPath, 'index.js'),
      fromCache: false,
    };
  } catch (error: any) {
    console.error('Error getting function package:', error.message);
    if (error.message.includes('not found')) {
      throw new Error('Function not found');
    }
    throw new Error(`Failed to get function: ${error.message}`);
  } finally {
    releaseLock();
  }
}

export function createDefaultKVFactory(projectId: string): any {
  return createProjectKV(projectId);
}
