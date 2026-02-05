(function() {
    const process = require('process');

    const { 
        setTimeout, 
        setInterval, 
        setImmediate, 
        clearTimeout, 
        clearInterval, 
        clearImmediate, 
        sleep,
    } = require('timers');

    const { TextEncoder, TextDecoder } = require('util');
    const { Buffer } = require('buffer');
    const { EventEmitter } = require('events');

    // === Expose globals ===

    globalThis.process = process;

    globalThis.setTimeout = setTimeout;
    globalThis.setInterval = setInterval;
    globalThis.setImmediate = setImmediate;
    globalThis.clearTimeout = clearTimeout;
    globalThis.clearInterval = clearInterval;
    globalThis.clearImmediate = clearImmediate;
    globalThis.sleep = sleep;

    globalThis.TextEncoder = TextEncoder;
    globalThis.TextDecoder = TextDecoder;

    globalThis.Buffer = Buffer;

    globalThis.EventEmitter = EventEmitter;
})();