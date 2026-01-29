// ============================================================================
// TIMERS implementation
// ============================================================================
(function() {
    let handle = 1;
    const timerIds = new Set();

    function sleep(delay) {
        return new Promise((resolve) => {
            _sleepAsync(delay || 0, () => resolve());
        });
    }
    
    function _sleepAsync(delay, callback) {
        // Call the host-side _sleep with a callback wrapper
        const wrappedCallback = new ivm.Reference(callback);
        _sleep.applySync(undefined, [delay, wrappedCallback]);
    }

    globalThis.sleep = sleep;
    
    globalThis.setTimeout = (callback, delay, ...args) => {
        handle++;

        const timerId = handle;
        timerIds.add(timerId);

        sleep(delay || 0).then(() => {
            if (timerIds.has(timerId)) {
                callback(...args);
                timerIds.delete(timerId);
            }
        });

        return timerId;
    };

    globalThis.setInterval = (callback, delay, ...args) => {
        handle++;

        const timerId = handle;
        timerIds.add(timerId);

        const schedule = () => {
            sleep(delay || 0).then(() => {
                if (timerIds.has(timerId)) {
                    callback(...args);
                    schedule();
                }
            });
        }

        schedule();
        return timerId;
    };


    globalThis.clearTimeout = (timerId) => {
        timerIds.delete(timerId);
    };

    globalThis.clearInterval = globalThis.clearTimeout;

    globalThis.setImmediate = function (fn, ...args) {
        return setTimeout(fn, 0, ...args);
    };

    globalThis.clearImmediate = function (id) {
        clearTimeout(id);
    };
})();