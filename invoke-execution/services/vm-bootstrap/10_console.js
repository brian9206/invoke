// ============================================================================
// CONSOLE - Logging Interface
// ============================================================================
(function() {
    function formatArgs(args) {
        return args.map(arg => {
            if (arg === undefined) return 'undefined';
            if (arg === null) return 'null';
            if (arg instanceof Error) return arg.stack;
            if (typeof arg === 'object') return JSON.stringify(arg);
            return String(arg);
        })
    }

    globalThis.console = {
        log: (...args) => _consoleLog.applySync(undefined, formatArgs(args)),
        info: (...args) => _consoleInfo.applySync(undefined, formatArgs(args)),
        warn: (...args) => _consoleWarn.applySync(undefined, formatArgs(args)),
        error: (...args) => _consoleError.applySync(undefined, formatArgs(args))
    };
})();
