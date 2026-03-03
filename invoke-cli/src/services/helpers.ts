import * as api from './api-client';
import { loadConfig } from './config';

/**
 * Resolve a function name or ID to an ID
 */
async function resolveFunctionId(nameOrId: string): Promise<string> {
  // If it looks like a UUID, use it directly
  if (/^[0-9a-f-]{36}$/i.test(nameOrId)) {
    return nameOrId;
  }

  // Otherwise, search by name
  const config = loadConfig();
  const projectId = config.projectId;

  if (!projectId) {
    throw new Error('No project selected. Use --project or set a default project with `invoke config set project <id>`');
  }

  const functions = await api.get(`/api/functions?name=${encodeURIComponent(nameOrId)}&projectId=${projectId}`);

  if (!functions || functions.length === 0) {
    throw new Error(`Function "${nameOrId}" not found in current project`);
  }

  if (functions.length > 1) {
    throw new Error(`Multiple functions found with name "${nameOrId}". Please use the function ID instead.`);
  }

  return functions[0].id;
}

/**
 * Find a function by name and project ID
 */
async function findFunctionByNameAndProject(name: string, projectId: string): Promise<any> {
  const functions = await api.get(`/api/functions?name=${encodeURIComponent(name)}&projectId=${projectId}`);

  if (!functions || functions.length === 0) {
    return null;
  }

  return functions[0];
}

/**
 * Resolve a project name or ID to an ID
 */
async function resolveProjectId(nameOrId: string): Promise<string> {
  // If it looks like a UUID, use it directly
  if (/^[0-9a-f-]{36}$/i.test(nameOrId)) {
    return nameOrId;
  }

  // Otherwise, search by name
  const projects = await api.get(`/api/projects?name=${encodeURIComponent(nameOrId)}`);

  if (!projects || projects.length === 0) {
    throw new Error(`Project "${nameOrId}" not found`);
  }

  if (projects.length > 1) {
    throw new Error(`Multiple projects found with name "${nameOrId}". Please use the project ID instead.`);
  }

  return projects[0].id;
}

export { resolveFunctionId, findFunctionByNameAndProject, resolveProjectId };
