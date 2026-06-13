import * as api from './api-client'
import { loadConfig } from './config'

function unwrapListResponse(response: any, entityName: string): any[] {
  if (Array.isArray(response)) {
    return response
  }

  if (response && typeof response === 'object' && 'success' in response && response.success === false) {
    throw new Error(response.message || `Failed to fetch ${entityName}`)
  }

  if (response && Array.isArray(response.data)) {
    return response.data
  }

  return []
}

/**
 * Parse `@slug/functionName` syntax.
 * Returns { projectSlug, functionName } or null if not matching.
 */
function parseSluggedName(input: string): { projectSlug: string; functionName: string } | null {
  const match = input.match(/^@([a-z0-9][a-z0-9_-]*)\/(.+)$/)
  if (!match) return null
  return { projectSlug: match[1], functionName: match[2] }
}

/**
 * Resolve a project slug to its ID via the API.
 */
async function resolveProjectBySlug(slug: string): Promise<string> {
  const response = await api.get('/api/projects', { slug })
  const projects = unwrapListResponse(response, 'projects')

  if (!projects || projects.length === 0) {
    throw new Error(`Project with slug "${slug}" not found`)
  }

  return projects[0].id
}

/**
 * Resolve a function name or ID to an ID
 */
async function resolveFunctionId(nameOrId: string): Promise<string> {
  // If it looks like a UUID, use it directly
  if (/^[0-9a-f-]{36}$/i.test(nameOrId)) {
    return nameOrId
  }

  // Check for @slug/functionName syntax
  const parsed = parseSluggedName(nameOrId)
  if (parsed) {
    const projectId = await resolveProjectBySlug(parsed.projectSlug)
    const response = await api.get('/api/functions', {
      name: parsed.functionName,
      project_id: projectId
    })
    const functions = unwrapListResponse(response, 'functions')

    if (!functions || functions.length === 0) {
      throw new Error(`Function "${parsed.functionName}" not found in project "@${parsed.projectSlug}"`)
    }

    return functions[0].id
  }

  // Otherwise, search by name in the current project
  const config = loadConfig()
  const projectId = config.projectId

  if (!projectId) {
    throw new Error('No project selected. Use --project or set a default project with `invoke config set project <id>`')
  }

  const response = await api.get('/api/functions', {
    name: nameOrId,
    project_id: projectId
  })
  const functions = unwrapListResponse(response, 'functions')

  if (!functions || functions.length === 0) {
    throw new Error(`Function "${nameOrId}" not found in current project`)
  }

  if (functions.length > 1) {
    throw new Error(`Multiple functions found with name "${nameOrId}". Please use the function ID instead.`)
  }

  return functions[0].id
}

/**
 * Find a function by name and project ID
 */
async function findFunctionByNameAndProject(name: string, projectId: string): Promise<any> {
  const response = await api.get('/api/functions', {
    name,
    project_id: projectId
  })
  const functions = unwrapListResponse(response, 'functions')

  if (!functions || functions.length === 0) {
    return null
  }

  return functions[0]
}

/**
 * Resolve a project name, slug, or ID to an ID
 */
async function resolveProjectId(nameOrId: string): Promise<string> {
  // If it looks like a UUID, use it directly
  if (/^[0-9a-f-]{36}$/i.test(nameOrId)) {
    return nameOrId
  }

  // Strip leading @ if present (e.g. --project @my-slug)
  const cleaned = nameOrId.startsWith('@') ? nameOrId.slice(1) : nameOrId

  // Try slug first, then fall back to name
  const bySlugResponse = await api.get('/api/projects', { slug: cleaned })
  const bySlug = unwrapListResponse(bySlugResponse, 'projects')
  if (bySlug && bySlug.length > 0) {
    return bySlug[0].id
  }

  const byNameResponse = await api.get('/api/projects', { name: cleaned })
  const byName = unwrapListResponse(byNameResponse, 'projects')
  if (byName && byName.length > 0) {
    return byName[0].id
  }

  throw new Error(`Project "${nameOrId}" not found`)
}

export { parseSluggedName, resolveFunctionId, findFunctionByNameAndProject, resolveProjectId }
