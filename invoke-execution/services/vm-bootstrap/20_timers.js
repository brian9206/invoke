// ============================================================================
// TIMERS - Disabled for Security
// ============================================================================
(function() {
    const notSupported = () => {
        throw new Error('Timers (setTimeout/setInterval) are not supported in sandbox. Functions should execute synchronously.');
    };
    
    globalThis.setTimeout = notSupported;
    globalThis.setInterval = notSupported;
    globalThis.clearTimeout = notSupported;
    globalThis.clearInterval = notSupported;
})();