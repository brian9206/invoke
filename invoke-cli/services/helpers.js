const api = require('./api-client')

/**
 * Helper function to resolve function name or ID to UUID
 * @param {string} nameOrId - Function name or UUID
 * @returns {Promise<string>} - Resolved UUID
 */
async function resolveFunctionId(nameOrId) {
  // UUID regex pattern (8-4-4-4-12 format)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // If it's already a UUID, return it as-is
  if (uuidPattern.test(nameOrId)) {
    return nameOrId
  }

  // Otherwise, lookup by name
  try {
    const data = await api.get('/api/functions')

    if (!data.success) {
      throw new Error('Failed to fetch functions: ' + data.message)
    }

    const functions = data.data
    const match = functions.find(fn => fn.name === nameOrId)

    if (!match) {
      throw new Error(`Function not found with name: "${nameOrId}"`)
    }

    return match.id
  } catch (error) {
    throw new Error(`Failed to resolve function: ${error.message}`)
  }
}

/**
 * Find a function by name within a specific project.
 * @param {string} name - Function name
 * @param {string} projectId - Project ID
 * @returns {Promise<object|null>} - Function object or null if not found
 */
async function findFunctionByNameAndProject(name, projectId) {
  try {
    const data = await api.get('/api/functions', { project_id: projectId })
    if (!data.success) return null
    const functions = data.data
    return functions.find(fn => fn.name === name && fn.project_id === projectId) || null
  } catch {
    return null
  }
}

/**
 * Resolve a project name or ID to a UUID.
 * @param {string} nameOrId - Project name or UUID
 * @returns {Promise<string>} - Resolved UUID
 */
async function resolveProjectId(nameOrId) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidPattern.test(nameOrId)) return nameOrId

  try {
    const data = await api.get('/api/auth/me')
    if (!data.success) throw new Error('Failed to fetch projects: ' + data.message)
    const projects = data.data.projects || []
    const match = projects.find(p => p.name === nameOrId)
    if (!match) throw new Error(`Project not found with name: "${nameOrId}"`)
    return match.id
  } catch (error) {
    throw new Error(`Failed to resolve project: ${error.message}`)
  }
}

module.exports = { resolveFunctionId, findFunctionByNameAndProject, resolveProjectId }
