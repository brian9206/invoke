-- Migration: Add execution cache invalidation triggers
-- Description: pg_notify triggers so the execution service can invalidate its
--              in-memory TTL cache for env vars and network policies the moment
--              a change is persisted, rather than waiting for the TTL to expire.
--
-- Channel: 'execution_cache_invalidated'
-- Payload fields:
--   table  - name of the changed table
--   action - INSERT | UPDATE | DELETE
--   function_id - (function_environment_variables only) affected function UUID
--   project_id  - (project_network_policies only) affected project UUID
--
-- The execution service LISTENs on this channel via a dedicated pg.Client
-- (see invoke-execution/services/execution-pg-notify.js) and calls the
-- appropriate cache-invalidation function on each notification.

-- =====================================================
-- Shared notify function
-- =====================================================

CREATE OR REPLACE FUNCTION notify_execution_cache_change()
RETURNS TRIGGER AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := json_build_object('table', TG_TABLE_NAME, 'action', TG_OP);

  -- Attach the relevant ID so the listener can do targeted invalidation
  IF TG_TABLE_NAME = 'function_environment_variables' THEN
    payload := payload || json_build_object(
      'function_id', COALESCE(NEW.function_id, OLD.function_id)
    );
  ELSIF TG_TABLE_NAME = 'project_network_policies' THEN
    payload := payload || json_build_object(
      'project_id', COALESCE(NEW.project_id, OLD.project_id)
    );
  END IF;
  -- global_network_policies: no extra ID needed (global flush)

  PERFORM pg_notify('execution_cache_invalidated', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Triggers
-- =====================================================

DROP TRIGGER IF EXISTS trig_notify_exec_env_vars ON function_environment_variables;
CREATE TRIGGER trig_notify_exec_env_vars
  AFTER INSERT OR UPDATE OR DELETE ON function_environment_variables
  FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();

DROP TRIGGER IF EXISTS trig_notify_exec_project_policies ON project_network_policies;
CREATE TRIGGER trig_notify_exec_project_policies
  AFTER INSERT OR UPDATE OR DELETE ON project_network_policies
  FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();

DROP TRIGGER IF EXISTS trig_notify_exec_global_policies ON global_network_policies;
CREATE TRIGGER trig_notify_exec_global_policies
  AFTER INSERT OR UPDATE OR DELETE ON global_network_policies
  FOR EACH ROW EXECUTE FUNCTION notify_execution_cache_change();
