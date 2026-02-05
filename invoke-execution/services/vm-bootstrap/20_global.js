(function() {
    globalThis.process = require('process');

    const { 
        setTimeout, 
        setInterval, 
        setImmediate, 
        clearTimeout, 
        clearInterval, 
        clearImmediate, 
        sleep,
    } = require('timers');

    globalThis.setTimeout = setTimeout;
    globalThis.setInterval = setInterval;
    globalThis.setImmediate = setImmediate;
    globalThis.clearTimeout = clearTimeout;
    globalThis.clearInterval = clearInterval;
    globalThis.clearImmediate = clearImmediate;
    globalThis.sleep = sleep;

    const { Event, CustomEvent, EventTarget, AbortController, AbortSignal } = require('_eventtarget');
    globalThis.Event = Event;
    globalThis.CustomEvent = CustomEvent;
    globalThis.EventTarget = EventTarget;
    globalThis.AbortController = AbortController;
    globalThis.AbortSignal = AbortSignal;

    const { TextEncoder, TextDecoder } = require('util');
    globalThis.TextEncoder = TextEncoder;
    globalThis.TextDecoder = TextDecoder;

    const { EventEmitter } = require('events');
    globalThis.EventEmitter = EventEmitter;

    const { Buffer } = require('buffer');
    globalThis.Buffer = Buffer;

    const fetch = require('node-fetch');
    globalThis.fetch = fetch;
    globalThis.Headers = fetch.Headers;
    globalThis.Request = fetch.Request;
    globalThis.Response = fetch.Response;
})();