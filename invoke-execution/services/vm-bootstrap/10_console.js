// ============================================================================
// CONSOLE - Logging Interface
// ============================================================================
globalThis.console = {
    log: (...args) => _consoleLog.applySync(undefined, args.map(arg => {
        if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg);
        return String(arg);
    })),
    info: (...args) => _consoleInfo.applySync(undefined, args.map(arg => {
        if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg);
        return String(arg);
    })),
    warn: (...args) => _consoleWarn.applySync(undefined, args.map(arg => {
        if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg);
        return String(arg);
    })),
    error: (...args) => _consoleError.applySync(undefined, args.map(arg => {
        if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg);
        return String(arg);
    }))
};