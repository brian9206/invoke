// ============================================================================
// BUFFER - Basic Buffer Implementation
// ============================================================================
globalThis.Buffer = (function() {
    return {
        from: (data, encoding) => {
            if (typeof data === 'string') {
                return new TextEncoder().encode(data);
            }
            return data;
        },
        alloc: (size) => new Uint8Array(size),
        isBuffer: (obj) => obj instanceof Uint8Array
    };
})();