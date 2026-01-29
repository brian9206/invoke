// ============================================================================
// CONSOLE - Full Logging Interface for Pure V8 Isolate
// ============================================================================
(function () {
    function formatArgs(args) {
        return args.map(arg => {
            if (arg === undefined) return 'undefined';
            if (arg === null) return 'null';
            if (arg instanceof Error) return arg.stack;
            if (typeof arg === 'object') {
                try { return JSON.stringify(arg); }
                catch (e) { return '[Unserializable]'; }
            }
            return String(arg);
        });
    }

    const timers = {};
    const counters = {};

    const console = {
        log: (...args) => _consoleWrite.applySync(undefined, [{ level: 'log', message: formatArgs(args) }], { arguments: { copy: true } }),
        info: (...args) => _consoleWrite.applySync(undefined, [{ level: 'info', message: formatArgs(args) }], { arguments: { copy: true } }),
        warn: (...args) => _consoleWrite.applySync(undefined, [{ level: 'warn', message: formatArgs(args) }], { arguments: { copy: true } }),
        error: (...args) => _consoleWrite.applySync(undefined, [{ level: 'error', message: formatArgs(args) }], { arguments: { copy: true } }),
        debug: (...args) => _consoleWrite.applySync(undefined, [{ level: 'debug', message: formatArgs(args) }], { arguments: { copy: true } }),
        clear: () => _consoleClear.applySync(undefined, []),

        assert: (condition, ...args) => {
            if (!condition) {
                console.error('Assertion failed:', ...args);
            }
        },

        dir: (obj) => {
            try {
                console.log(JSON.stringify(obj, null, 2));
            } catch (e) {
                console.log('[Unserializable]');
            }
        },

        trace: (...args) => {
            const err = new Error(formatArgs(args).join(' '));
            console.log(err.stack);
        },

        time: (label = 'default') => {
            timers[label] = Date.now();
        },

        timeEnd: (label = 'default') => {
            if (timers[label]) {
                const duration = Date.now() - timers[label];
                console.log(`${label}: ${duration}ms`);
                delete timers[label];
            } else {
                console.warn(`No such label: ${label}`);
            }
        },

        count: (label = 'default') => {
            counters[label] = (counters[label] || 0) + 1;
            console.log(`${label}: ${counters[label]}`);
        },

        countReset: (label = 'default') => {
            if (counters[label]) {
                counters[label] = 0;
            }
        },

        group: (...args) => {
            console.log('--- group start ---', ...args);
        },

        groupCollapsed: (...args) => {
            console.log('--- group collapsed ---', ...args);
        },

        groupEnd: () => {
            console.log('--- group end ---');
        },

        table: (data) => {
            try {
                if (Array.isArray(data)) {
                    const headers = Object.keys(data[0] || {});
                    const rows = data.map(row => headers.map(h => row[h]));
                    console.log(JSON.stringify({ headers, rows }, null, 2));
                } else {
                    console.log(JSON.stringify(data, null, 2));
                }
            } catch (e) {
                console.log('[Unserializable]');
            }
        }
    };

    globalThis.console = console;
})();
