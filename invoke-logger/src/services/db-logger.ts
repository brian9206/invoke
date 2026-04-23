import { appDb } from '../database';
import { FunctionLog } from '../models/FunctionLog';
import { PayloadField } from '../models/PayloadField';

export interface DbInsertLogOptions {
  project?: { id?: string; name?: string | null } | null;
  function?: { id?: string; name?: string | null } | null;
  type: 'request' | 'app' | 'build';
  source: 'execution' | 'gateway';
  payload: Record<string, unknown>;
  executedAt?: Date;
}

/**
 * Recursively walk a payload object and collect all dot-notation field paths
 * with their inferred JS types, up to maxDepth levels deep.
 * Skips `console` arrays (too granular) and array entries beyond the type hint.
 */
function extractFieldPaths(
  obj: unknown,
  prefix: string,
  depth: number,
  results: Array<{ path: string; type: string }>,
): void {
  if (depth > 4 || obj === null || obj === undefined) return;
  if (typeof obj !== 'object' || Array.isArray(obj)) return;

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Skip console — too granular
    if (prefix === '' && key === 'console') continue;

    const path = prefix ? `${prefix}.${key}` : key;
    const jsType = Array.isArray(value) ? 'array' : typeof value;

    if (value !== null && value !== undefined) {
      results.push({ path, type: jsType === 'object' || jsType === 'array' ? jsType : jsType });
    }

    if (jsType === 'object' && value !== null) {
      extractFieldPaths(value, path, depth + 1, results);
    }
  }
}

/**
 * Insert a log entry into `function_logs` in the dedicated log DB.
 *
 * Resolves missing project/function names via a lookup in the app DB.
 * Embeds resolved metadata into the stored payload.
 * After insert, asynchronously registers payload field paths in payload_fields.
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
    ...(type === 'request' ? { source } : {}),
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

  // Fire-and-forget: register all payload field paths in the registry table
  const projectId = resolvedProjectId;
  void (async () => {
    try {
      const fieldEntries: Array<{ path: string; type: string }> = [];
      extractFieldPaths(mergedPayload, '', 0, fieldEntries);
      if (fieldEntries.length === 0) return;

      const now = new Date();
      await PayloadField.bulkCreate(
        fieldEntries.map(f => ({
          project_id: projectId,
          field_path: f.path,
          field_type: f.type,
          first_seen_at: now,
          last_seen_at: now,
        })),
        {
          ignoreDuplicates: true,
        },
      );
    } catch (err) {
      // Non-critical — never break log ingestion
      console.error('[dbInsertLog] Failed to register payload fields:', err);
    }
  })();
}

