export interface FunctionVersionInfo {
  id: string
  function_id: string
  version: number
  file_size: number
  package_path: string | null
  package_hash: string
  created_at: string | null
  created_by: number | null
}

export interface ProjectInfo {
  id: string
  name: string
  is_active: boolean
}

export interface FunctionInfo {
  id: string
  name: string
  description: string | null
  project_id: string
  deployed_by: number | null
  requires_api_key: boolean
  api_key: string | null
  is_active: boolean
  created_at: string | null
  updated_at: string | null
  last_executed: string | null
  execution_count: number
  active_version_id: string | null
  retention_type: 'time' | 'count' | 'none' | null
  retention_value: number | null
  retention_enabled: boolean
  schedule_enabled: boolean
  schedule_cron: string | null
  next_execution: string | null
  last_scheduled_execution: string | null
  group_id: string | null
  sort_order: number
  custom_timeout_enabled: boolean
  custom_timeout_seconds: number | null
  custom_memory_enabled: boolean
  custom_memory_mb: number | null
  activeVersion: FunctionVersionInfo | null
  Project: ProjectInfo | null
}

declare global {
  namespace Express {
    interface Request {
      trustedClientIp?: string
      isFromGateway?: boolean
      functionInfo?: FunctionInfo
    }
  }
}
