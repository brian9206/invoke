(function() {
    // Register module 'zlib'
    const self = {};
    builtinModule['zlib'] = self;
    
    const { Transform } = require('stream');

    // Internal helper functions
    function convertArrayBufferToBufferSafe(value) {
        if (value && value instanceof ArrayBuffer) {
            return Buffer.from(value);
        } 
        else {
            return value;
        }
    }

    function convertZlibError(err) {
        if (!err) {
            return null;
        }
        
        if (err instanceof Error) {
            return err;
        }
        
        if (typeof err === 'string') {
            return new Error(err);
        }
        
        if (typeof err === 'object') {
            const message = err.message || err.toString() || 'Unknown error';
            const error = new Error(message);
            
            if (err.code !== undefined) error.code = err.code;
            if (err.errno !== undefined) error.errno = err.errno;
            if (err.syscall !== undefined) error.syscall = err.syscall;
            
            return error;
        }
        
        return new Error(String(err));
    }

    // Complete constants
    self.constants = {
        Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BLOCK: 5, Z_TREES: 6,
        Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3,
        Z_MEM_ERROR: -4, Z_BUF_ERROR: -5, Z_VERSION_ERROR: -6, Z_NO_COMPRESSION: 0, Z_BEST_SPEED: 1,
        Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1, Z_FILTERED: 1, Z_HUFFMAN_ONLY: 2, Z_RLE: 3,
        Z_FIXED: 4, Z_DEFAULT_STRATEGY: 0, DEFLATE: 1, INFLATE: 2, GZIP: 3, GUNZIP: 4, DEFLATERAW: 5,
        INFLATERAW: 6, UNZIP: 7, BROTLI_ENCODE: 8, BROTLI_DECODE: 9, BROTLI_OPERATION_PROCESS: 0,
        BROTLI_OPERATION_FLUSH: 1, BROTLI_OPERATION_FINISH: 2, BROTLI_OPERATION_EMIT_METADATA: 3,
        BROTLI_PARAM_MODE: 0, BROTLI_MODE_GENERIC: 0, BROTLI_MODE_TEXT: 1, BROTLI_MODE_FONT: 2,
        BROTLI_PARAM_QUALITY: 1, BROTLI_MIN_QUALITY: 0, BROTLI_MAX_QUALITY: 11, BROTLI_DEFAULT_QUALITY: 11
    };

    // Simple stream class that accumulates data and processes on flush
    class SimpleZlibBase extends Transform {
        constructor(options, syncFunction) {
            super(options);
            this._syncFunction = syncFunction;
            this._chunks = [];
            this.bytesRead = 0;
            this.bytesWritten = 0;
        }
        
        _transform(chunk, encoding, callback) {
            this._chunks.push(chunk);
            this.bytesRead += chunk.length;
            callback();
        }
        
        _flush(callback) {
            try {
                if (this._chunks.length === 0) {
                    return callback();
                }
                
                const combined = Buffer.concat(this._chunks);
                const result = this._syncFunction(combined);
                this.bytesWritten = result.length;
                this.push(result);
                callback();
            } catch (err) {
                callback(convertZlibError(err));
            }
        }
        
        flush(kind = null, callback) {
            // Handle overloaded parameters
            if (typeof kind === 'function') {
                callback = kind;
                kind = null;
            }
            
            // Force flush of buffered data and emit flush event
            this._flush((err) => {
                if (err) {
                    if (callback) callback(err);
                    return;
                }
                
                // Emit flush event and call callback
                this.emit('flush');
                if (callback) callback();
            });
        }
    }

    // Working sync methods using the proven pattern
    self.deflateSync = function(buffer, options) {
        try {
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            const result = _zlib_deflateSync.applySync(undefined, [arrayBuffer, options], { arguments: { copy: true } });
            return convertArrayBufferToBufferSafe(result);
        } catch (err) {
            throw convertZlibError(err);
        }
    };

    self.inflateSync = function(buffer, options) {
        try {
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            const result = _zlib_inflateSync.applySync(undefined, [arrayBuffer, options], { arguments: { copy: true } });
            return convertArrayBufferToBufferSafe(result);
        } catch (err) {
            throw convertZlibError(err);
        }
    };

    self.gzipSync = function(buffer, options) {
        try {
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            const result = _zlib_gzipSync.applySync(undefined, [arrayBuffer, options], { arguments: { copy: true } });
            return convertArrayBufferToBufferSafe(result);
        } catch (err) {
            throw convertZlibError(err);
        }
    };

    self.gunzipSync = function(buffer, options) {
        try {
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            const result = _zlib_gunzipSync.applySync(undefined, [arrayBuffer, options], { arguments: { copy: true } });
            return convertArrayBufferToBufferSafe(result);
        } catch (err) {
            throw convertZlibError(err);
        }
    };

    self.deflateRawSync = function(buffer, options) {
        try {
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            const result = _zlib_deflateRawSync.applySync(undefined, [arrayBuffer, options], { arguments: { copy: true } });
            return convertArrayBufferToBufferSafe(result);
        } catch (err) {
            throw convertZlibError(err);
        }
    };

    self.inflateRawSync = function(buffer, options) {
        try {
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            const result = _zlib_inflateRawSync.applySync(undefined, [arrayBuffer, options], { arguments: { copy: true } });
            return convertArrayBufferToBufferSafe(result);
        } catch (err) {
            throw convertZlibError(err);
        }
    };

    self.unzipSync = function(buffer, options) {
        try {
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            const result = _zlib_unzipSync.applySync(undefined, [arrayBuffer, options], { arguments: { copy: true } });
            return convertArrayBufferToBufferSafe(result);
        } catch (err) {
            throw convertZlibError(err);
        }
    };

    self.brotliCompressSync = function(buffer, options) {
        try {
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            const result = _zlib_brotliCompressSync.applySync(undefined, [arrayBuffer, options], { arguments: { copy: true } });
            return convertArrayBufferToBufferSafe(result);
        } catch (err) {
            throw convertZlibError(err);
        }
    };

    self.brotliDecompressSync = function(buffer, options) {
        try {
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            const result = _zlib_brotliDecompressSync.applySync(undefined, [arrayBuffer, options], { arguments: { copy: true } });
            return convertArrayBufferToBufferSafe(result);
        } catch (err) {
            throw convertZlibError(err);
        }
    };

    self.zstdCompressSync = function(buffer, options) {
        try {
            if (typeof _zlib_zstdCompressSync === 'undefined') {
                throw new Error('Zstd compression is not supported in this environment');
            }
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            const result = _zlib_zstdCompressSync.applySync(undefined, [arrayBuffer, options], { arguments: { copy: true } });
            return convertArrayBufferToBufferSafe(result);
        } catch (err) {
            throw convertZlibError(err);
        }
    };

    self.zstdDecompressSync = function(buffer, options) {
        try {
            if (typeof _zlib_zstdDecompressSync === 'undefined') {
                throw new Error('Zstd decompression is not supported in this environment');
            }
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            const result = _zlib_zstdDecompressSync.applySync(undefined, [arrayBuffer, options], { arguments: { copy: true } });
            return convertArrayBufferToBufferSafe(result);
        } catch (err) {
            throw convertZlibError(err);
        }
    };

    // Async methods following fs.js pattern with proper callback wrapping
    self.deflate = function(buffer, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return _zlib_deflate.applySync(undefined, [arrayBuffer, options, new ivm.Reference((err, result) => {
            if (err) {
                callback(convertZlibError(err));
            } else {
                callback(null, convertArrayBufferToBufferSafe(result));
            }
        })], { arguments: { copy: true } });
    };

    self.inflate = function(buffer, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return _zlib_inflate.applySync(undefined, [arrayBuffer, options, new ivm.Reference((err, result) => {
            if (err) {
                callback(convertZlibError(err));
            } else {
                callback(null, convertArrayBufferToBufferSafe(result));
            }
        })], { arguments: { copy: true } });
    };

    self.gzip = function(buffer, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return _zlib_gzip.applySync(undefined, [arrayBuffer, options, new ivm.Reference((err, result) => {
            if (err) {
                callback(convertZlibError(err));
            } else {
                callback(null, convertArrayBufferToBufferSafe(result));
            }
        })], { arguments: { copy: true } });
    };

    self.gunzip = function(buffer, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return _zlib_gunzip.applySync(undefined, [arrayBuffer, options, new ivm.Reference((err, result) => {
            if (err) {
                callback(convertZlibError(err));
            } else {
                callback(null, convertArrayBufferToBufferSafe(result));
            }
        })], { arguments: { copy: true } });
    };

    self.deflateRaw = function(buffer, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return _zlib_deflateRaw.applySync(undefined, [arrayBuffer, options, new ivm.Reference((err, result) => {
            if (err) {
                callback(convertZlibError(err));
            } else {
                callback(null, convertArrayBufferToBufferSafe(result));
            }
        })], { arguments: { copy: true } });
    };

    self.inflateRaw = function(buffer, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return _zlib_inflateRaw.applySync(undefined, [arrayBuffer, options, new ivm.Reference((err, result) => {
            if (err) {
                callback(convertZlibError(err));
            } else {
                callback(null, convertArrayBufferToBufferSafe(result));
            }
        })], { arguments: { copy: true } });
    };

    self.unzip = function(buffer, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return _zlib_unzip.applySync(undefined, [arrayBuffer, options, new ivm.Reference((err, result) => {
            if (err) {
                callback(convertZlibError(err));
            } else {
                callback(null, convertArrayBufferToBufferSafe(result));
            }
        })], { arguments: { copy: true } });
    };

    self.brotliCompress = function(buffer, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return _zlib_brotliCompress.applySync(undefined, [arrayBuffer, options, new ivm.Reference((err, result) => {
            if (err) {
                callback(convertZlibError(err));
            } else {
                callback(null, convertArrayBufferToBufferSafe(result));
            }
        })], { arguments: { copy: true } });
    };

    self.brotliDecompress = function(buffer, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return _zlib_brotliDecompress.applySync(undefined, [arrayBuffer, options, new ivm.Reference((err, result) => {
            if (err) {
                callback(convertZlibError(err));
            } else {
                callback(null, convertArrayBufferToBufferSafe(result));
            }
        })], { arguments: { copy: true } });
    };

    // Stream classes using simple accumulate-and-process approach
    class Deflate extends SimpleZlibBase {
        constructor(options) { super(options, (buf) => self.deflateSync(buf, options)); }
    }
    class Inflate extends SimpleZlibBase {
        constructor(options) { super(options, (buf) => self.inflateSync(buf, options)); }
    }
    class Gzip extends SimpleZlibBase {
        constructor(options) { super(options, (buf) => self.gzipSync(buf, options)); }
    }
    class Gunzip extends SimpleZlibBase {
        constructor(options) { super(options, (buf) => self.gunzipSync(buf, options)); }
    }
    class DeflateRaw extends SimpleZlibBase {
        constructor(options) { super(options, (buf) => self.deflateRawSync(buf, options)); }
    }
    class InflateRaw extends SimpleZlibBase {
        constructor(options) { super(options, (buf) => self.inflateRawSync(buf, options)); }
    }
    class Unzip extends SimpleZlibBase {
        constructor(options) { super(options, (buf) => self.unzipSync(buf, options)); }
    }
    class BrotliCompress extends SimpleZlibBase {
        constructor(options) { super(options, (buf) => self.brotliCompressSync(buf, options)); }
    }
    class BrotliDecompress extends SimpleZlibBase {
        constructor(options) { super(options, (buf) => self.brotliDecompressSync(buf, options)); }
    }
    class ZstdCompress extends SimpleZlibBase {
        constructor(options) { super(options, (buf) => self.zstdCompressSync(buf, options)); }
    }
    class ZstdDecompress extends SimpleZlibBase {
        constructor(options) { super(options, (buf) => self.zstdDecompressSync(buf, options)); }
    }

    // Export classes
    self.Deflate = Deflate;
    self.Inflate = Inflate;
    self.Gzip = Gzip;
    self.Gunzip = Gunzip;
    self.DeflateRaw = DeflateRaw;
    self.InflateRaw = InflateRaw;
    self.Unzip = Unzip;
    self.BrotliCompress = BrotliCompress;
    self.BrotliDecompress = BrotliDecompress;
    self.ZstdCompress = ZstdCompress;
    self.ZstdDecompress = ZstdDecompress;

    // Factory methods
    self.createDeflate = (options) => new Deflate(options);
    self.createInflate = (options) => new Inflate(options);
    self.createGzip = (options) => new Gzip(options);
    self.createGunzip = (options) => new Gunzip(options);
    self.createDeflateRaw = (options) => new DeflateRaw(options);
    self.createInflateRaw = (options) => new InflateRaw(options);
    self.createUnzip = (options) => new Unzip(options);
    self.createBrotliCompress = (options) => new BrotliCompress(options);
    self.createBrotliDecompress = (options) => new BrotliDecompress(options);
    self.createZstdCompress = (options) => new ZstdCompress(options);
    self.createZstdDecompress = (options) => new ZstdDecompress(options);

    // Basic CRC32 utility
    self.crc32 = function(data, value) {
        try {
            if (typeof _zlib_crc32 !== 'undefined') {
                const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                return _zlib_crc32.applySync(undefined, [arrayBuffer, value], { arguments: { copy: true } });
            }
        } catch (err) {
            // Fallback
        }
        return 0;
    };
})();