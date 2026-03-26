import { appDb } from '../database';
import { FunctionLog } from '../models/FunctionLog';

export interface DbInsertLogOptions {
  project?: { id?: string; name?: string | null } | null;
  function?: { id?: string; name?: string | null } | null;
  type: 'request' | 'app';
  source: 'execution' | 'gateway';
  payload: Record<string, unknown>;
  executedAt?: Date;
}

/**
 * Insert a log entry into `function_logs` in the dedicated log DB.
 *
 * Resolves missing project/function names via a lookup in the app DB.
 * Embeds resolved metadata into the stored payload.
 */
export async function dbInsertLog(opts: DbInsertLogOptions): Promise<void> {
  const { project = null, function: functionArg = null, type, source, payload, executedAt } = opts;

  if (type !== 'request' && type !== 'app') throw new Error(`[dbInsertLog] Invalid type: ${type}`);
  if (source !== 'execution' && source !== 'gateway')
    throw new Error(`[dbInsertLog] Invalid source: ${source}`);

  let resolvedProjectId = project?.id ?? null;
  let resolvedFunctionName = functionArg?.name ?? null;
  let resolvedProjectName = project?.name ?? null;

  if (
    functionArg?.id &&
    (!resolvedProjectId || resolvedFunctionName === null || resolvedProjectName === null)
  ) {
    try {
      const { Function: FunctionModel, Project } = appDb.models;
      const func = await FunctionModel.findOne({
        where: { id: functionArg.id },
        attributes: ['project_id', 'name'],
        include: [{ model: Project, attributes: ['name'], required: false }],
      });
      if (func) {
        if (!resolvedProjectId) resolvedProjectId = func.get('project_id');
        if (resolvedFunctionName === null) resolvedFunctionName = func.get('name') ?? null;
        if (resolvedProjectName === null)
          resolvedProjectName = (func as any).Project?.get('name') ?? null;
      }
    } catch (lookupErr) {
      console.error('[dbInsertLog] Failed to resolve function/project info:', lookupErr);
    }
  }

  if (!resolvedProjectId) throw new Error('[dbInsertLog] project.id is required');

  const mergedPayload = {
    ...(functionArg?.id ? { function: { id: functionArg.id, name: resolvedFunctionName } } : {}),
    ...(resolvedProjectId ? { project: { id: resolvedProjectId, name: resolvedProjectName } } : {}),
    ...payload,
  };

  await FunctionLog.create({
    project_id: resolvedProjectId,
    function_id: functionArg?.id || null,
    type,
    source,
    executed_at: executedAt || new Date(),
    payload: mergedPayload,
  });
}

