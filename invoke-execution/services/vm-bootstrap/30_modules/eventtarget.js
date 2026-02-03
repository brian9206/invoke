'use strict';

// Node.js EventTarget and Event API based on Node.js v25.5.0 specification
// https://nodejs.org/api/events.html#eventtarget-and-event-api
// Includes integrated AbortController and AbortSignal

(function () {
    // This module will be exposed directly in globalThis in the VM isolates
    // See the end of this file for the global setup code

    const kIsNodeStyleListener = Symbol('kIsNodeStyleListener');
    const kTrustEvent = Symbol('kTrustEvent');
    const kStopImmediatePropagation = Symbol('kStopImmediatePropagation');
    const kEventTargetListeners = Symbol('kEventTargetListeners');
    const kMaxListeners = Symbol('kMaxListeners');

    // Event Phase constants
    const NONE = 0;
    const CAPTURING_PHASE = 1;
    const AT_TARGET = 2;
    const BUBBLING_PHASE = 3;

    class Event {
        constructor(type, options = {}) {
            if (typeof type !== 'string') {
                throw new TypeError('The "type" argument must be of type string');
            }

            this[kTrustEvent] = false;

            // Core event properties
            this.type = type;
            this.bubbles = !!options.bubbles;
            this.cancelable = !!options.cancelable;
            this.composed = !!options.composed;

            // State properties
            this.defaultPrevented = false;
            this.eventPhase = NONE;
            this.timeStamp = Date.now();
            this.isTrusted = false;

            // Target properties (set during dispatch)
            this.target = null;
            this.currentTarget = null;
            this.srcElement = null;

            // Legacy properties
            this.cancelBubble = false;
            this.returnValue = true;
        }

        get [Symbol.toStringTag]() {
            return 'Event';
        }

        preventDefault() {
            if (this.cancelable) {
                this.defaultPrevented = true;
                this.returnValue = false;
            }
        }

        stopPropagation() {
            // In Node.js EventTarget, this doesn't do much since there's no hierarchy
        }

        stopImmediatePropagation() {
            this[kStopImmediatePropagation] = true;
        }

        composedPath() {
            // Node.js EventTarget doesn't support event propagation hierarchy
            return this.eventPhase === NONE ? [] : [this.currentTarget];
        }

        initEvent(type, bubbles = false, cancelable = false) {
            // Legacy method - deprecated but included for compatibility
            if (this.eventPhase !== NONE) {
                return;
            }

            this.type = type;
            this.bubbles = bubbles;
            this.cancelable = cancelable;
        }
    }

    class CustomEvent extends Event {
        constructor(type, options = {}) {
            super(type, options);
            this.detail = options.detail ?? null;
        }

        get [Symbol.toStringTag]() {
            return 'CustomEvent';
        }
    }

    class EventTarget {
        constructor() {
            this[kEventTargetListeners] = new Map();
            this[kMaxListeners] = 10; // Default max listeners
        }

        get [Symbol.toStringTag]() {
            return 'EventTarget';
        }

        addEventListener(type, listener, options = {}) {
            if (typeof type !== 'string') {
                throw new TypeError('The "type" argument must be of type string');
            }

            if (typeof listener !== 'function' &&
                (typeof listener !== 'object' || listener === null || typeof listener.handleEvent !== 'function')) {
                return; // Invalid listener, silently ignore like browsers do
            }

            // Normalize options
            if (typeof options === 'boolean') {
                options = { capture: options };
            }

            const once = !!options.once;
            const passive = !!options.passive;
            const capture = !!options.capture;
            const signal = options.signal;

            // Check if AbortSignal is already aborted
            if (signal && signal.aborted) {
                return;
            }

            const listeners = this[kEventTargetListeners];
            if (!listeners.has(type)) {
                listeners.set(type, new Set());
            }

            const typeListeners = listeners.get(type);

            // Create listener wrapper
            const listenerObj = {
                listener,
                once,
                passive,
                capture,
                removed: false
            };

            // Check for duplicate (same listener + capture combination)
            for (const existing of typeListeners) {
                if (existing.listener === listener && existing.capture === capture) {
                    return; // Already registered, ignore
                }
            }

            typeListeners.add(listenerObj);

            // Handle AbortSignal
            if (signal) {
                const abortListener = () => {
                    this.removeEventListener(type, listener, { capture });
                };
                signal.addEventListener('abort', abortListener, { once: true });

                // Store reference to abort listener for cleanup
                listenerObj.abortListener = abortListener;
                listenerObj.signal = signal;
            }

            // Check max listeners warning
            const maxListeners = this[kMaxListeners];
            if (maxListeners > 0 && typeListeners.size > maxListeners && !typeListeners.warned) {
                typeListeners.warned = true;
                const warning = new Error(
                    `Possible EventTarget memory leak detected. ${typeListeners.size} ${type} listeners added. ` +
                    `Use setMaxListeners() to increase limit`
                );
                warning.name = 'MaxListenersExceededWarning';
                warning.target = this;
                warning.type = type;
                warning.count = typeListeners.size;

                // Emit warning like Node.js does
                if (console && console.warn) {
                    console.warn(warning);
                }
            }
        }

        removeEventListener(type, listener, options = {}) {
            if (typeof type !== 'string') {
                return;
            }

            if (typeof options === 'boolean') {
                options = { capture: options };
            }

            const capture = !!options.capture;
            const listeners = this[kEventTargetListeners];
            const typeListeners = listeners.get(type);

            if (!typeListeners) {
                return;
            }

            for (const listenerObj of typeListeners) {
                if (listenerObj.listener === listener && listenerObj.capture === capture) {
                    listenerObj.removed = true;
                    typeListeners.delete(listenerObj);

                    // Clean up AbortSignal listener if present
                    if (listenerObj.signal && listenerObj.abortListener) {
                        listenerObj.signal.removeEventListener('abort', listenerObj.abortListener);
                    }

                    if (typeListeners.size === 0) {
                        listeners.delete(type);
                    }
                    break;
                }
            }
        }

        dispatchEvent(event) {
            if (!(event instanceof Event)) {
                throw new TypeError('The "event" argument must be an instance of Event');
            }

            // Set event target properties
            event.target = this;
            event.currentTarget = this;
            event.srcElement = this;
            event.eventPhase = AT_TARGET;
            event[kStopImmediatePropagation] = false;

            const type = event.type;
            const listeners = this[kEventTargetListeners];
            const typeListeners = listeners.get(type);

            if (!typeListeners || typeListeners.size === 0) {
                return !event.defaultPrevented;
            }

            // Create array of listeners to call (in registration order)
            const listenersToCall = Array.from(typeListeners).filter(obj => !obj.removed);

            for (const listenerObj of listenersToCall) {
                if (event[kStopImmediatePropagation]) {
                    break;
                }

                try {
                    const { listener, once, passive } = listenerObj;

                    if (typeof listener === 'function') {
                        listener.call(this, event);
                    } else if (listener && typeof listener.handleEvent === 'function') {
                        listener.handleEvent(event);
                    }

                    // Remove once listeners
                    if (once) {
                        this.removeEventListener(type, listener, { capture: listenerObj.capture });
                    }
                } catch (error) {
                    // Handle errors in event listeners - emit to process.nextTick like Node.js
                    if (typeof process !== 'undefined' && process.nextTick) {
                        process.nextTick(() => {
                            throw error;
                        });
                    } else {
                        // Fallback for environments without process
                        setTimeout(() => {
                            throw error;
                        }, 0);
                    }
                }
            }

            // Reset event phase
            event.eventPhase = NONE;

            return !event.defaultPrevented;
        }
    }

    // NodeEventTarget - Node.js specific extension
    /*class NodeEventTarget extends EventTarget {
        constructor() {
            super();
        }

        get [Symbol.toStringTag]() {
            return 'NodeEventTarget';
        }

        // EventEmitter-like methods
        addListener(type, listener) {
            this.addEventListener(type, listener);
            return this;
        }

        on(type, listener) {
            this.addEventListener(type, listener);
            return this;
        }

        once(type, listener) {
            this.addEventListener(type, listener, { once: true });
            return this;
        }

        removeListener(type, listener, options) {
            this.removeEventListener(type, listener, options);
            return this;
        }

        off(type, listener, options) {
            this.removeEventListener(type, listener, options);
            return this;
        }

        removeAllListeners(type) {
            const listeners = this[kEventTargetListeners];

            if (type === undefined) {
                // Remove all listeners for all events
                for (const [eventType, typeListeners] of listeners) {
                    for (const listenerObj of typeListeners) {
                        listenerObj.removed = true;
                        if (listenerObj.signal && listenerObj.abortListener) {
                            listenerObj.signal.removeEventListener('abort', listenerObj.abortListener);
                        }
                    }
                }
                listeners.clear();
            } else {
                // Remove all listeners for specific event type
                const typeListeners = listeners.get(type);
                if (typeListeners) {
                    for (const listenerObj of typeListeners) {
                        listenerObj.removed = true;
                        if (listenerObj.signal && listenerObj.abortListener) {
                            listenerObj.signal.removeEventListener('abort', listenerObj.abortListener);
                        }
                    }
                    listeners.delete(type);
                }
            }

            return this;
        }

        emit(type, arg) {
            // Simple emit that creates an event-like object
            let event;
            if (arg instanceof Event) {
                event = arg;
            } else {
                event = new Event(type);
                if (arg !== undefined) {
                    event.detail = arg;
                }
            }

            return this.dispatchEvent(event);
        }

        eventNames() {
            const listeners = this[kEventTargetListeners];
            return Array.from(listeners.keys());
        }

        listenerCount(type) {
            const listeners = this[kEventTargetListeners];
            const typeListeners = listeners.get(type);
            return typeListeners ? typeListeners.size : 0;
        }

        setMaxListeners(n) {
            if (typeof n !== 'number' || n < 0 || Number.isNaN(n)) {
                throw new RangeError('The value of "n" is out of range. It must be a non-negative number');
            }
            this[kMaxListeners] = n;
            return this;
        }

        getMaxListeners() {
            return this[kMaxListeners];
        }
    }*/

    // AbortSignal implementation
    const SECRET = {};

    class AbortSignal extends EventTarget {
        constructor(secret) {
            if (secret !== SECRET) {
                throw new TypeError("Illegal constructor.");
            }
            super();
            this._aborted = false;
            this._onabort = null;
        }

        get [Symbol.toStringTag]() {
            return 'AbortSignal';
        }

        get onabort() {
            return this._onabort;
        }

        set onabort(callback) {
            const existing = this._onabort;
            if (existing) {
                this.removeEventListener("abort", existing);
            }
            this._onabort = callback;
            if (callback) {
                this.addEventListener("abort", callback);
            }
        }

        get aborted() {
            return this._aborted;
        }

        // Static method for creating already aborted signals
        static abort(reason) {
            const signal = new AbortSignal(SECRET);
            signal._aborted = true;
            if (reason !== undefined) {
                signal.reason = reason;
            }
            return signal;
        }

        // Static method for timeout signals
        static timeout(milliseconds) {
            const signal = new AbortSignal(SECRET);
            setTimeout(() => {
                if (!signal._aborted) {
                    signal._aborted = true;
                    signal.reason = new Error('The operation was aborted due to timeout');
                    signal.dispatchEvent(new Event("abort"));
                }
            }, milliseconds);
            return signal;
        }
    }

    // AbortController implementation
    class AbortController {
        constructor() {
            this._signal = new AbortSignal(SECRET);
        }

        get [Symbol.toStringTag]() {
            return 'AbortController';
        }

        get signal() {
            return this._signal;
        }

        abort(reason) {
            const signal = this.signal;
            if (!signal.aborted) {
                signal._aborted = true;
                if (reason !== undefined) {
                    signal.reason = reason;
                }
                signal.dispatchEvent(new Event("abort"));
            }
        }
    }

    // Expose module
        
    // EventTarget and Event API (includes AbortController and AbortSignal)
    globalThis.Event = Event;
    globalThis.CustomEvent = CustomEvent;
    globalThis.EventTarget = EventTarget;
    globalThis.AbortController = AbortController;
    globalThis.AbortSignal = AbortSignal;
})();
