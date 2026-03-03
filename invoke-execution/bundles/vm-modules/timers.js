// ============================================================================
// TIMERS MODULE - Node.js v24 Compatible Implementation
// ============================================================================
// Implements both 'timers' and 'timers/promises' modules with full API support
// including Timeout/Immediate classes, ref/unref, AbortSignal, and async iterators
// ============================================================================

// ========================================================================
// Shared Timer Infrastructure
// ========================================================================

let timerIdCounter = 0;
const activeTimers = new Map(); // Map<id, TimerState>

function sleep(delay) {
    return new Promise((resolve) => {
        const wrappedCallback = new ivm.Reference(resolve);
        _sleep.applySync(undefined, [delay || 0, wrappedCallback]);
    });
}

// ========================================================================
// Timer Classes
// ========================================================================

class Timeout {
    constructor(callback, delay, args, repeat) {
        this._id = ++timerIdCounter;
        this._callback = callback;
        this._delay = delay || 0;
        this._args = args || [];
        this._repeat = repeat || false;
        this._cleared = false;
        this._refed = true; // Track ref state (no-op in isolated-vm)
        this._startTime = Date.now();
        
        activeTimers.set(this._id, this);
        this._schedule();
    }
    
    _schedule() {
        if (this._cleared) return;
        
        sleep(this._delay).then(() => {
            if (this._cleared || !activeTimers.has(this._id)) return;
            
            try {
                this._callback(...this._args);
            } catch (err) {
                // Let errors propagate to global error handler
                throw err;
            }
            
            if (this._repeat && !this._cleared) {
                this._startTime = Date.now();
                this._schedule();
            } else {
                this._clear();
            }
        });
    }
    
    _clear() {
        this._cleared = true;
        activeTimers.delete(this._id);
    }
    
    ref() {
        // No-op in isolated-vm (no process to keep alive)
        this._refed = true;
        return this;
    }
    
    unref() {
        // No-op in isolated-vm (no process to keep alive)
        this._refed = false;
        return this;
    }
    
    hasRef() {
        return this._refed;
    }
    
    refresh() {
        if (this._cleared) return this;
        
        // Reset the timer by rescheduling from now
        this._startTime = Date.now();
        // Note: In a full implementation, we'd cancel the pending sleep
        // For now, this updates the start time for tracking purposes
        return this;
    }
    
    [Symbol.toPrimitive]() {
        return this._id;
    }
}

class Immediate {
    constructor(callback, args) {
        this._id = ++timerIdCounter;
        this._callback = callback;
        this._args = args || [];
        this._cleared = false;
        this._refed = true;
        
        activeTimers.set(this._id, this);
        this._schedule();
    }
    
    _schedule() {
        if (this._cleared) return;
        
        sleep(0).then(() => {
            if (this._cleared || !activeTimers.has(this._id)) return;
            
            try {
                this._callback(...this._args);
            } catch (err) {
                throw err;
            }
            
            this._clear();
        });
    }
    
    _clear() {
        this._cleared = true;
        activeTimers.delete(this._id);
    }
    
    ref() {
        this._refed = true;
        return this;
    }
    
    unref() {
        this._refed = false;
        return this;
    }
    
    hasRef() {
        return this._refed;
    }
    
    [Symbol.toPrimitive]() {
        return this._id;
    }
}

// ========================================================================
// Main 'timers' Module
// ========================================================================

const timers = { sleep };
module.exports = timers;

timers.setTimeout = function(callback, delay, ...args) {
    if (typeof callback !== 'function') {
        throw new TypeError('Callback must be a function');
    }
    return new Timeout(callback, delay, args, false);
};

timers.setInterval = function(callback, delay, ...args) {
    if (typeof callback !== 'function') {
        throw new TypeError('Callback must be a function');
    }
    return new Timeout(callback, delay, args, true);
};

timers.setImmediate = function(callback, ...args) {
    if (typeof callback !== 'function') {
        throw new TypeError('Callback must be a function');
    }
    return new Immediate(callback, args);
};

timers.clearTimeout = function(timeout) {
    if (timeout && typeof timeout._clear === 'function') {
        timeout._clear();
    } else if (typeof timeout === 'number') {
        // Support clearing by ID for compatibility
        const timer = activeTimers.get(timeout);
        if (timer && timer._clear) {
            timer._clear();
        }
    }
};

timers.clearInterval = timers.clearTimeout;

timers.clearImmediate = function(immediate) {
    if (immediate && typeof immediate._clear === 'function') {
        immediate._clear();
    } else if (typeof immediate === 'number') {
        const timer = activeTimers.get(immediate);
        if (timer && timer._clear) {
            timer._clear();
        }
    }
};

// Export classes
timers.Timeout = Timeout;
timers.Immediate = Immediate;

// ========================================================================
// 'timers/promises' Module
// ========================================================================

const timersPromises = {};
timers.promises = timersPromises;

// Scheduler API
const scheduler = {
    wait: function(delay, options) {
        const actualDelay = typeof delay === 'number' ? delay : 0;
        options = options || {};
        
        return new Promise((resolve, reject) => {
            const signal = options.signal;
            
            // Check if already aborted
            if (signal && signal.aborted) {
                const error = new Error('The operation was aborted');
                error.name = 'AbortError';
                error.code = 'ABORT_ERR';
                reject(error);
                return;
            }
            
            const timeout = new Timeout(() => {
                if (abortListener) {
                    signal.removeEventListener('abort', abortListener);
                }
                resolve();
            }, actualDelay, [], false);
            
            // Handle ref option (no-op but track state)
            if (options.ref === false) {
                timeout.unref();
            }
            
            // Handle abort signal
            let abortListener = null;
            if (signal) {
                abortListener = () => {
                    timeout._clear();
                    const error = new Error('The operation was aborted');
                    error.name = 'AbortError';
                    error.code = 'ABORT_ERR';
                    reject(error);
                };
                signal.addEventListener('abort', abortListener);
            }
        });
    },
    
    yield: function() {
        // Yield control to the event loop
        return sleep(0);
    }
};

timersPromises.scheduler = scheduler;

// Promise-based setTimeout
timersPromises.setTimeout = function(delay, value, options) {
    const actualDelay = typeof delay === 'number' ? delay : 0;
    options = options || {};
    
    return new Promise((resolve, reject) => {
        const signal = options.signal;
        
        // Check if already aborted
        if (signal && signal.aborted) {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            error.code = 'ABORT_ERR';
            reject(error);
            return;
        }
        
        const timeout = new Timeout(() => {
            if (abortListener) {
                signal.removeEventListener('abort', abortListener);
            }
            resolve(value);
        }, actualDelay, [], false);
        
        // Handle ref option
        if (options.ref === false) {
            timeout.unref();
        }
        
        // Handle abort signal
        let abortListener = null;
        if (signal) {
            abortListener = () => {
                timeout._clear();
                const error = new Error('The operation was aborted');
                error.name = 'AbortError';
                error.code = 'ABORT_ERR';
                reject(error);
            };
            signal.addEventListener('abort', abortListener);
        }
    });
};

// Promise-based setImmediate
timersPromises.setImmediate = function(value, options) {
    options = options || {};
    
    return new Promise((resolve, reject) => {
        const signal = options.signal;
        
        // Check if already aborted
        if (signal && signal.aborted) {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            error.code = 'ABORT_ERR';
            reject(error);
            return;
        }
        
        const immediate = new Immediate(() => {
            if (abortListener) {
                signal.removeEventListener('abort', abortListener);
            }
            resolve(value);
        }, []);
        
        // Handle ref option
        if (options.ref === false) {
            immediate.unref();
        }
        
        // Handle abort signal
        let abortListener = null;
        if (signal) {
            abortListener = () => {
                immediate._clear();
                const error = new Error('The operation was aborted');
                error.name = 'AbortError';
                error.code = 'ABORT_ERR';
                reject(error);
            };
            signal.addEventListener('abort', abortListener);
        }
    });
};

// Async iterator-based setInterval
timersPromises.setInterval = function(delay, value, options) {
    const actualDelay = typeof delay === 'number' ? delay : 0;
    options = options || {};
    const signal = options.signal;
    
    // Check if already aborted
    if (signal && signal.aborted) {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        error.code = 'ABORT_ERR';
        throw error;
    }
    
    let timeout = null;
    let resolveNext = null;
    let rejectNext = null;
    let stopped = false;
    
    const scheduleNext = () => {
        if (stopped) return;
        
        timeout = new Timeout(() => {
            if (stopped) return;
            if (resolveNext) {
                resolveNext({ value: value, done: false });
                resolveNext = null;
                rejectNext = null;
            }
            scheduleNext();
        }, actualDelay, [], false);
        
        // Handle ref option
        if (options.ref === false) {
            timeout.unref();
        }
    };
    
    // Handle abort signal
    let abortListener = null;
    if (signal) {
        abortListener = () => {
            stopped = true;
            if (timeout) {
                timeout._clear();
            }
            if (rejectNext) {
                const error = new Error('The operation was aborted');
                error.name = 'AbortError';
                error.code = 'ABORT_ERR';
                rejectNext(error);
                resolveNext = null;
                rejectNext = null;
            }
        };
        signal.addEventListener('abort', abortListener);
    }
    
    scheduleNext();
    
    // Return async iterator
    return {
        [Symbol.asyncIterator]() {
            return this;
        },
        
        next() {
            if (stopped) {
                return Promise.resolve({ value: undefined, done: true });
            }
            
            return new Promise((resolve, reject) => {
                resolveNext = resolve;
                rejectNext = reject;
            });
        },
        
        return() {
            stopped = true;
            if (timeout) {
                timeout._clear();
            }
            if (abortListener && signal) {
                signal.removeEventListener('abort', abortListener);
            }
            return Promise.resolve({ value: undefined, done: true });
        }
    };
};

