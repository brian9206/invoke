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

interface FunctionMetadata {
  id: string;
  name: string;
  project_id: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  version: string | null;
  package_path: string | null;
  package_hash: string | null;
  file_size: number | null;
}

interface NetworkPolicies {
  globalRules: any[];
  projectRules: any[];
}

interface PackageInfo {
  tempDir: string;
  indexPath: string;
  fromCache: boolean;
}

/** key → value pairs */
type EnvVars = Record<string, string>;

const envVarCache = new Map<string, CacheEntry<EnvVars>>();
const networkPolicyCache = new Map<string, CacheEntry<any[]>>();

export function invalidateEnvVarCache(functionId: string): void {
  envVarCache.delete(functionId);
}

export function invalidateNetworkPolicyCache(projectId: string | null): void {
  networkPolicyCache.delete('__global__');
  if (projectId) networkPolicyCache.delete(projectId);
}

export async function fetchFunctionMetadata(functionId: string): Promise<FunctionMetadata> {
  const { Function: FunctionModel, FunctionVersion } = db.models;

  const func = await FunctionModel.findOne({
    where: { id: functionId, is_active: true },
    include: [{ model: FunctionVersion, as: 'activeVersion' }],
  });

  if (!func) {
    throw new Error('Function not found');
  }

  const f = func as any;
  const fv = f.activeVersion;

  return {
    id: f.id,
    name: f.name,
    project_id: f.project_id,
    is_active: f.is_active,
    created_at: f.created_at,
    updated_at: f.updated_at,
    version: fv ? fv.version : null,
    package_path: fv ? fv.package_path : null,
    package_hash: fv ? fv.package_hash : null,
    file_size: fv ? fv.file_size : null,
  };
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

export async function fetchNetworkPolicies(projectId: string): Promise<NetworkPolicies> {
  try {
    const now = Date.now();

    const { GlobalNetworkPolicy, ProjectNetworkPolicy } = db.models;

    let globalRules: any[];
    const cachedGlobal = networkPolicyCache.get('__global__');
    if (cachedGlobal && cachedGlobal.expiresAt > now) {
      globalRules = cachedGlobal.data;
    } else {
      const globalRows = await GlobalNetworkPolicy.findAll({
        attributes: ['action', 'target_type', 'target_value', 'description', 'priority'],
        order: [['priority', 'ASC']],
      });
      globalRules = (globalRows as any[]).map((r: any) => r.get({ plain: true }));
      networkPolicyCache.set('__global__', {
        data: globalRules,
        expiresAt: now + NETWORK_POLICY_TTL_MS,
      });
    }

    let projectRules: any[];
    const cachedProject = networkPolicyCache.get(projectId);
    if (cachedProject && cachedProject.expiresAt > now) {
      projectRules = cachedProject.data;
    } else {
      const projectRows = await ProjectNetworkPolicy.findAll({
        where: { project_id: projectId },
        attributes: ['action', 'target_type', 'target_value', 'description', 'priority'],
        order: [['priority', 'ASC']],
      });
      projectRules = (projectRows as any[]).map((r: any) => r.get({ plain: true }));
      networkPolicyCache.set(projectId, {
        data: projectRules,
        expiresAt: now + NETWORK_POLICY_TTL_MS,
      });
    }

    return { globalRules, projectRules };
  } catch (err) {
    console.error('Error fetching network policies:', err);
    return { globalRules: [], projectRules: [] };
  }
}

export async function getFunctionPackage(functionId: string): Promise<PackageInfo> {
  const releaseLock = await cache.acquireLock(functionId);

  try {
    const functionData = await fetchFunctionMetadata(functionId);

    const cacheResult = await cache.checkCache(
      functionId,
      functionData.package_hash ?? '',
      functionData.version ?? '',
    );

    if (cacheResult.cached && cacheResult.valid) {
      await cache.updateAccessStats(functionId);
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

    const extractedPath = await cache.cachePackageFromPathNoLock(
      functionId,
      functionData.version ?? '',
      functionData.package_hash ?? '',
      functionData.file_size || 0,
      functionData.package_path ?? '',
    );

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
