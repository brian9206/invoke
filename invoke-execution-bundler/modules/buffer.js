const buffer = require('buffer/');

globalThis.Buffer = buffer.Buffer;

// prevent polyfill detection logic in some libraries
delete globalThis.Buffer.TYPED_ARRAY_SUPPORT;

module.exports = buffer;
