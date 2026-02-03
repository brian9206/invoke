// ============================================================================
// Global setup for VM isolates
// ============================================================================

(function() {
    globalThis.Buffer = require('buffer').Buffer;

    // URL and URLSearchParams
    const { URL, URLSearchParams } = require('url');
    globalThis.URL = URL;
    globalThis.URLSearchParams = URLSearchParams;
})();
