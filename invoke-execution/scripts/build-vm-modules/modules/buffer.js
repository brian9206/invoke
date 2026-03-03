const buffer = require('buffer/');

// prevent polyfill detection logic in some libraries
delete buffer.Buffer.TYPED_ARRAY_SUPPORT;

module.exports = buffer;
