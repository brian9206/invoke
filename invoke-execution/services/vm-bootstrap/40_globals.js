// ============================================================================
// Global setup for VM isolates
// ============================================================================

(function() {
    globalThis.Buffer = require('buffer').Buffer;
    globalThis.EventEmitter = require('events').EventEmitter;
    globalThis.URL = require('url').URL;
    globalThis.URLSearchParams = require('url').URLSearchParams;
})();
