import { NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import { proxyToLogger } from '@/lib/logger-proxy'
import database from '@/lib/database'

export interface BuildLogEntry {
  message: string
  timestamp: string
}

export interface BuildStageStatus {
  status: 'pending' | 'running' | 'success' | 'failure'
  error?: string
}

export interface BuildContextData {
  pipeline: {
    name: string
    stages: { name: string; dependsOn: string[] }[]
  }
  stages: Record<string, BuildStageStatus>
}

export interface BuildDetailResponse {
  id: string
  function_id: string
  function_name: string | null
  project_id: string | null
  version_id: string
  version_number: number | null
  status: string
  after_build_action: string
  artifact_path: string | null
  artifact_hash: string | null
  error_message: string | null
  build_context: BuildContextData | null
  created_by: number | null
  created_by_name: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  logs: BuildLogEntry[]
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { id: buildId } = req.query as { id: string }
  const { FunctionBuild, FunctionVersion, Function: FunctionModel, User, ProjectMembership } = database.models as any

  const build = await FunctionBuild.findByPk(buildId, {
    include: [
      {
        model: FunctionModel,
        attributes: ['id', 'name', 'project_id']
      },
      {
        model: FunctionVersion,
        as: 'version',
        attributes: ['id', 'version']
      },
      {
        model: User,
        as: 'creator',
        attributes: ['username'],
        required: false
      }
    ]
  })

  if (!build) {
    return res.status(404).json(createResponse(false, null, 'Build not found', 404))
  }

  const raw = build.toJSON() as any

  // Access control: non-admins must be a member of the function's project
  if (!req.user?.isAdmin && raw.Function?.project_id) {
    const membership = await ProjectMembership.findOne({
      where: { user_id: req.user!.id, project_id: raw.Function.project_id }
    })
    if (!membership) {
      return res.status(403).json(createResponse(false, null, 'Access denied', 403))
    }
  }

  // ── POST: Cancel build ──────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { action } = req.body || {}
    if (action !== 'cancel') {
      return res.status(400).json(createResponse(false, null, 'Invalid action. Supported: cancel', 400))
    }

    if (raw.status !== 'queued' && raw.status !== 'running') {
      return res.status(409).json(createResponse(false, null, `Cannot cancel build with status "${raw.status}"`, 409))
    }

    await FunctionBuild.update(
      { status: 'cancelled', error_message: 'Cancelled by user', completed_at: new Date() },
      { where: { id: buildId } }
    )

    // Reset version build_status if it was queued/building
    const versionStatus = raw.version
      ? (await FunctionVersion.findByPk(raw.version_id, { attributes: ['build_status'] }))?.build_status
      : null
    if (versionStatus === 'queued' || versionStatus === 'building') {
      await FunctionVersion.update({ build_status: 'none' }, { where: { id: raw.version_id } })
    }

    return res.status(200).json(createResponse(true, { id: buildId, status: 'cancelled' }, 'Build cancelled'))
  }

  // Fetch build logs from logger service
  let logs: BuildLogEntry[] = []
  try {
    const result = await proxyToLogger<{ logs: any[] }>('/logs/search', {
      query: {
        logType: 'build',
        q: `build.id:"${buildId}"`,
        limit: '500'
      }
    })
    if (result.success && result.data?.logs) {
      logs = result.data.logs
        .sort((a: any, b: any) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime())
        .map((l: any) => ({
          message: String(l.payload?.message ?? ''),
          timestamp: String(l.executed_at ?? '')
        }))
    }
  } catch {
    // Logger may be unavailable; continue with empty logs
  }

  const response: BuildDetailResponse = {
    id: raw.id,
    function_id: raw.function_id,
    function_name: raw.Function?.name ?? null,
    project_id: raw.Function?.project_id ?? null,
    version_id: raw.version_id,
    version_number: raw.version?.version ?? null,
    status: raw.status,
    after_build_action: raw.after_build_action,
    artifact_path: raw.artifact_path,
    artifact_hash: raw.artifact_hash,
    error_message: raw.error_message,
    build_context: raw.build_context ?? null,
    created_by: raw.created_by,
    created_by_name: raw.creator?.username ?? null,
    created_at: raw.created_at,
    started_at: raw.started_at,
    completed_at: raw.completed_at,
    logs
  }

  return res.status(200).json(createResponse(true, response, 'Build retrieved'))
}

export default withAuthAndMethods(['GET', 'POST'])(handler)
