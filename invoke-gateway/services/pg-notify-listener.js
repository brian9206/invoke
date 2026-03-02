const { createNotifyListener } = require('invoke-shared');

/**
 * Gateway cache-invalidation listener.
 * Single shared debounce — any change on gateway tables triggers one refresh.
 * Channel: 'gateway_invalidated'
 */
module.exports = createNotifyListener('gateway_invalidated');
