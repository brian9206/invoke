/**
 * function-providers.js
 *
 * All database- and object-store-backed provider functions for the execution engine.
 * Kept separate from execution.js so that importing ExecutionEngine does not
 * transitively pull in database/cache/minio dependencies.
 */

const path = require('path');
const db = require('./database');
const cache = require('./cache');
const { createProjectKV } = require('./kv-store');

// ---------------------------------------------------------------------------
// Metadata & configuration providers
// ---------------------------------------------------------------------------

/**
 * Fetch function metadata from database.
 * @param {string} functionId
 * @returns {Promise<Object>}
 */
async function fetchFunctionMetadata(functionId) {
    const query = `
        SELECT 
            f.id, 
            f.name, 
            f.project_id,
            f.is_active,
            f.created_at, 
            f.updated_at,
            fv.version,
            fv.package_path,
            fv.package_hash,
            fv.file_size
        FROM functions f
        LEFT JOIN function_versions fv ON f.active_version_id = fv.id
        WHERE f.id = $1 AND f.is_active = true
    `;

    const result = await db.query(query, [functionId]);

    if (result.rows.length === 0) {
        throw new Error('Function not found');
    }

    return result.rows[0];
}

/**
 * Fetch environment variables for a function.
 * @param {string} functionId
 * @returns {Promise<Object>} key→value pairs
 */
async function fetchEnvironmentVariables(functionId) {
    try {
        const result = await db.query(`
            SELECT variable_name, variable_value 
            FROM function_environment_variables 
            WHERE function_id = $1
        `, [functionId]);

        const envVars = {};
        for (const row of result.rows) {
            envVars[row.variable_name] = row.variable_value;
        }
        return envVars;
    } catch (err) {
        console.error('Error fetching environment variables:', err);
        return {};
    }
}

/**
 * Fetch network security policies (global + project-specific).
 * @param {string} projectId
 * @returns {Promise<{ globalRules: Object[], projectRules: Object[] }>}
 */
async function fetchNetworkPolicies(projectId) {
    try {
        const globalResult = await db.query(`
            SELECT action, target_type, target_value, description, priority
            FROM global_network_policies
            ORDER BY priority ASC
        `);

        const projectResult = await db.query(`
            SELECT action, target_type, target_value, description, priority
            FROM project_network_policies
            WHERE project_id = $1
            ORDER BY priority ASC
        `, [projectId]);

        return {
            globalRules: globalResult.rows,
            projectRules: projectResult.rows,
        };
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
};
