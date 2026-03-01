/**
 * function-providers.js
 *
 * All database- and object-store-backed provider functions for the execution engine.
 * Kept separate from execution.js so that importing ExecutionEngine does not
 * transitively pull in database/cache/minio dependencies.
 */

const path = require('path');
const { Op } = require('sequelize');
const db = require('./database');
const cache = require('./cache');
const { createProjectKV } = require('./kv-store');

// ---------------------------------------------------------------------------
// In-memory TTL caches for env vars and network policies
// Invalidated immediately via pg LISTEN/NOTIFY; TTL is a safety-net fallback.
// ---------------------------------------------------------------------------

const ENV_VAR_TTL_MS = 60_000;
const NETWORK_POLICY_TTL_MS = 60_000;

/** @type {Map<string, { data: object, expiresAt: number }>} keyed by functionId */
const envVarCache = new Map();

/**
 * Keyed by projectId, plus the special key '__global__' for global rules.
 * @type {Map<string, { data: object, expiresAt: number }>}
 */
const networkPolicyCache = new Map();

/**
 * Evict the env-var cache entry for a specific function.
 * Called by the pg NOTIFY listener when function_environment_variables changes.
 * @param {string} functionId
 */
function invalidateEnvVarCache(functionId) {
    envVarCache.delete(functionId);
}

/**
 * Evict network-policy cache entries.
 * Called by the pg NOTIFY listener when network policy tables change.
 * @param {string|null} projectId  Pass null to flush only the global-rules entry.
 */
function invalidateNetworkPolicyCache(projectId) {
    networkPolicyCache.delete('__global__');
    if (projectId) networkPolicyCache.delete(projectId);
}

// ---------------------------------------------------------------------------
// Metadata & configuration providers
// ---------------------------------------------------------------------------

/**
 * Fetch function metadata from database.
 * @param {string} functionId
 * @returns {Promise<Object>}
 */
async function fetchFunctionMetadata(functionId) {
    const { Function: FunctionModel, FunctionVersion } = db.models;

    const func = await FunctionModel.findOne({
        where: { id: functionId, is_active: true },
        include: [{ model: FunctionVersion, as: 'activeVersion' }],
    });

    if (!func) {
        throw new Error('Function not found');
    }

    const fv = func.activeVersion;
    return {
        id: func.id,
        name: func.name,
        project_id: func.project_id,
        is_active: func.is_active,
        created_at: func.created_at,
        updated_at: func.updated_at,
        version: fv ? fv.version : null,
        package_path: fv ? fv.package_path : null,
        package_hash: fv ? fv.package_hash : null,
        file_size: fv ? fv.file_size : null,
    };
}

/**
 * Fetch environment variables for a function.
 * Results are cached in-memory for up to ENV_VAR_TTL_MS and invalidated
 * immediately by the pg NOTIFY listener when the table changes.
 * @param {string} functionId
 * @returns {Promise<Object>} key→value pairs
 */
async function fetchEnvironmentVariables(functionId) {
    const cached = envVarCache.get(functionId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    try {
        const { FunctionEnvironmentVariable } = db.models;
        const rows = await FunctionEnvironmentVariable.findAll({
            where: { function_id: functionId },
        });

        const envVars = {};
        for (const row of rows) {
            envVars[row.variable_name] = row.variable_value;
        }

        envVarCache.set(functionId, { data: envVars, expiresAt: Date.now() + ENV_VAR_TTL_MS });
        return envVars;
    } catch (err) {
        console.error('Error fetching environment variables:', err);
        return {};
    }
}

/**
 * Fetch network security policies (global + project-specific).
 * Both the global rules and per-project rules are cached independently so
 * a change to one project's policies doesn't bust the global-rules cache.
 * Each entry is invalidated immediately by the pg NOTIFY listener.
 * @param {string} projectId
 * @returns {Promise<{ globalRules: Object[], projectRules: Object[] }>}
 */
async function fetchNetworkPolicies(projectId) {
    try {
        const now = Date.now();

        const { GlobalNetworkPolicy, ProjectNetworkPolicy } = db.models;

        // --- global rules (cached under '__global__') ---
        let globalRules;
        const cachedGlobal = networkPolicyCache.get('__global__');
        if (cachedGlobal && cachedGlobal.expiresAt > now) {
            globalRules = cachedGlobal.data;
        } else {
            const globalRows = await GlobalNetworkPolicy.findAll({
                attributes: ['action', 'target_type', 'target_value', 'description', 'priority'],
                order: [['priority', 'ASC']],
            });
            globalRules = globalRows.map(r => r.get({ plain: true }));
            networkPolicyCache.set('__global__', { data: globalRules, expiresAt: now + NETWORK_POLICY_TTL_MS });
        }

        // --- project-specific rules (cached under projectId) ---
        let projectRules;
        const cachedProject = networkPolicyCache.get(projectId);
        if (cachedProject && cachedProject.expiresAt > now) {
            projectRules = cachedProject.data;
        } else {
            const projectRows = await ProjectNetworkPolicy.findAll({
                where: { project_id: projectId },
                attributes: ['action', 'target_type', 'target_value', 'description', 'priority'],
                order: [['priority', 'ASC']],
            });
            projectRules = projectRows.map(r => r.get({ plain: true }));
            networkPolicyCache.set(projectId, { data: projectRules, expiresAt: now + NETWORK_POLICY_TTL_MS });
        }

        return { globalRules, projectRules };
    } catch (err) {
        console.error('Error fetching network policies:', err);
        return { globalRules: [], projectRules: [] };
    }
}

// ---------------------------------------------------------------------------
// Package provider (cache + MinIO)
// ---------------------------------------------------------------------------

/**
 * Get function package, downloading from MinIO and caching locally if needed.
 * @param {string} functionId
 * @returns {Promise<{ tempDir: string, indexPath: string, fromCache: boolean }>}
 */
async function getFunctionPackage(functionId) {
    const releaseLock = await cache.acquireLock(functionId);

    try {
        const functionData = await fetchFunctionMetadata(functionId);

        const cacheResult = await cache.checkCache(functionId, functionData.package_hash, functionData.version);

        if (cacheResult.cached && cacheResult.valid) {
            await cache.updateAccessStats(functionId);
            return {
                tempDir: cacheResult.extractedPath,
                indexPath: path.join(cacheResult.extractedPath, 'index.js'),
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
            functionData.version,
            functionData.package_hash,
            functionData.file_size || 0,
            functionData.package_path
        );

        return {
            tempDir: extractedPath,
            indexPath: path.join(extractedPath, 'index.js'),
            fromCache: false,
        };
    } catch (error) {
        console.error('Error getting function package:', error.message);
        if (error.message.includes('not found')) {
            throw new Error('Function not found');
        }
        throw new Error(`Failed to get function: ${error.message}`);
    } finally {
        releaseLock();
    }
}

// ---------------------------------------------------------------------------
// KV store factory
// ---------------------------------------------------------------------------

/**
 * Default KV store factory — PostgreSQL-backed, project-scoped.
 * @param {string} projectId
 * @returns {import('keyv').default}
 */
function createDefaultKVFactory(projectId) {
    return createProjectKV(projectId, db.pool);
}

// ---------------------------------------------------------------------------

module.exports = {
    fetchFunctionMetadata,
    fetchEnvironmentVariables,
    fetchNetworkPolicies,
    getFunctionPackage,
    createDefaultKVFactory,
    invalidateEnvVarCache,
    invalidateNetworkPolicyCache,
};
