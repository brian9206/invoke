// ============================================================================
// TIMERS implementation
// ============================================================================
(function() {
    let handle = 1;
    const timerIds = new Set();

    function sleep(delay) {
        return _sleep.apply(undefined, [delay || 0]);
    }

    globalThis.sleep = sleep;
    
    globalThis.setTimeout = (callback, delay) => {
        handle++;

        const timerId = handle;
        timerIds.add(timerId);

        sleep(delay).then(() => {
            if (timerIds.has(timerId)) {
                callback();
                timerIds.delete(timerId);
            }
        });

        return timerId;
    };

    globalThis.setInterval = (callback, delay) => {
        handle++;

        const timerId = handle;
        timerIds.add(timerId);

        const schedule = () => {
            sleep(delay).then(() => {
                if (timerIds.has(timerId)) {
                    callback();
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