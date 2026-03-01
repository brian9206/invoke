const { createNotifyListener } = require('invoke-shared');

/**
 * Execution cache-invalidation listener.
 * Per-key debounce keyed by affected entity (function, project, or global).
 * Channel: 'execution_cache_invalidated'
 */
module.exports = createNotifyListener('execution_cache_invalidated', {
  parsePayload: (raw) => (typeof raw === 'string' ? JSON.parse(raw) : (raw || {})),
  getDebounceKey: (payload) =>
    payload.table === 'function_environment_variables'
      ? `function_environment_variables:${payload.function_id}`
      : payload.table === 'project_network_policies'
        ? `project_network_policies:${payload.project_id}`
        : 'global_network_policies',
});
