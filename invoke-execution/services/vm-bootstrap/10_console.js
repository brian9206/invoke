// ============================================================================
// CONSOLE - Logging Interface
// ============================================================================
globalThis.console = {
    log: (...args) => _consoleLog.applySync(undefined, args),
    info: (...args) => _consoleInfo.applySync(undefined, args),
    warn: (...args) => _consoleWarn.applySync(undefined, args),
    error: (...args) => _consoleError.applySync(undefined, args)
};