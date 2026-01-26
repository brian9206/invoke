// ============================================================================
// BUFFER - Node.js-Compatible Buffer Implementation
// ============================================================================

globalThis.Buffer = (function() {
    return {
        // Create buffer from various data types
        from: (data, encodingOrOffset, length) => {
            // String: Buffer.from(string, encoding)
            if (typeof data === 'string') {
                const arrayBuffer = _textEncoderEncode.applySync(undefined, [data]);
                return new Uint8Array(arrayBuffer);
            }
            // Uint8Array/Buffer: Buffer.from(buffer)
            if (data instanceof Uint8Array) {
                return new Uint8Array(data);
            }
            // ArrayBuffer: Buffer.from(arrayBuffer, byteOffset, length)
            if (data instanceof ArrayBuffer) {
                const offset = encodingOrOffset || 0;
                const len = length !== undefined ? length : data.byteLength - offset;
                return new Uint8Array(data, offset, len);
            }
            // Array: Buffer.from([1, 2, 3])
            if (Array.isArray(data)) {
                return new Uint8Array(data);
            }
            // Object with length property (array-like)
            if (data && typeof data === 'object' && typeof data.length === 'number') {
                const arr = new Uint8Array(data.length);
                for (let i = 0; i < data.length; i++) {
                    arr[i] = data[i];
                }
                return arr;
            }
            throw new TypeError('The "data" argument must be of type string, Buffer, ArrayBuffer, or Array');
        },
        
        // Allocate buffer (zero-filled)
        alloc: (size, fill, encoding) => {
            const buf = new Uint8Array(size);
            if (fill !== undefined) {
                if (typeof fill === 'number') {
                    buf.fill(fill);
                } else if (typeof fill === 'string') {
                    const fillBuf = Buffer.from(fill, encoding);
                    let offset = 0;
                    while (offset < size) {
                        const remaining = size - offset;
                        const copyLen = Math.min(fillBuf.length, remaining);
                        buf.set(fillBuf.subarray(0, copyLen), offset);
                        offset += copyLen;
                    }
                }
            }
            return buf;
        },
        
        // Allocate buffer (not zero-filled, faster)
        allocUnsafe: (size) => new Uint8Array(size),
        
        // Allocate buffer outside V8 heap (treat same as allocUnsafe in VM)
        allocUnsafeSlow: (size) => new Uint8Array(size),
        
        // Check if object is a Buffer
        isBuffer: (obj) => obj instanceof Uint8Array,
        
        // Check if encoding is supported
        isEncoding: (encoding) => {
            if (!encoding) return false;
            const enc = String(encoding).toLowerCase();
            return enc === 'utf8' || enc === 'utf-8' || 
                   enc === 'hex' || enc === 'base64' ||
                   enc === 'ascii' || enc === 'binary' ||
                   enc === 'latin1' || enc === 'ucs2' || enc === 'utf16le';
        },
        
        // Get byte length of string
        byteLength: (string, encoding) => {
            if (typeof string !== 'string') {
                if (string instanceof Uint8Array || string instanceof ArrayBuffer) {
                    return string.byteLength;
                }
                string = String(string);
            }
            const arrayBuffer = _textEncoderEncode.applySync(undefined, [string]);
            return arrayBuffer.byteLength;
        },
        
        // Concatenate buffers
        concat: (list, totalLength) => {
            if (!Array.isArray(list)) {
                throw new TypeError('The "list" argument must be an Array');
            }
            if (list.length === 0) {
                return new Uint8Array(0);
            }
            
            // Calculate total length if not provided
            let length = totalLength;
            if (length === undefined) {
                length = 0;
                for (const buf of list) {
                    length += buf.length;
                }
            }
            
            const result = new Uint8Array(length);
            let offset = 0;
            for (const buf of list) {
                if (!(buf instanceof Uint8Array)) {
                    throw new TypeError('All list elements must be Buffers');
                }
                const copyLen = Math.min(buf.length, length - offset);
                result.set(buf.subarray(0, copyLen), offset);
                offset += copyLen;
                if (offset >= length) break;
            }
            return result;
        },
        
        // Compare two buffers
        compare: (buf1, buf2) => {
            if (!(buf1 instanceof Uint8Array) || !(buf2 instanceof Uint8Array)) {
                throw new TypeError('Arguments must be Buffers');
            }
            const len = Math.min(buf1.length, buf2.length);
            for (let i = 0; i < len; i++) {
                if (buf1[i] !== buf2[i]) {
                    return buf1[i] < buf2[i] ? -1 : 1;
                }
            }
            return buf1.length === buf2.length ? 0 : (buf1.length < buf2.length ? -1 : 1);
        }
    };
})();

// Extend Uint8Array prototype with Buffer methods
if (!Uint8Array.prototype._bufferMethodsAdded) {
    // toString - decode buffer to string
    Uint8Array.prototype.toString = function(encoding = 'utf-8') {
        const arr = Array.from(this);
        return _textDecoderDecode.applySync(undefined, [arr, encoding || 'utf-8']);
    };
    
    // write - write string to buffer at offset
    Uint8Array.prototype.write = function(string, offset, length, encoding) {
        // Handle overloads: write(string, offset, length, encoding) or write(string, offset, encoding) or write(string, encoding)
        if (typeof offset === 'string') {
            encoding = offset;
            offset = 0;
            length = this.length;
        } else if (typeof length === 'string') {
            encoding = length;
            length = this.length - offset;
        } else {
            offset = offset || 0;
            length = length !== undefined ? length : (this.length - offset);
        }
        
        const arrayBuffer = _textEncoderEncode.applySync(undefined, [string]);
        const bytes = new Uint8Array(arrayBuffer);
        const writeLen = Math.min(bytes.length, length);
        this.set(bytes.subarray(0, writeLen), offset);
        return writeLen;
    };
    
    // copy - copy buffer to target
    Uint8Array.prototype.copy = function(target, targetStart, sourceStart, sourceEnd) {
        targetStart = targetStart || 0;
        sourceStart = sourceStart || 0;
        sourceEnd = sourceEnd !== undefined ? sourceEnd : this.length;
        
        const len = Math.min(sourceEnd - sourceStart, target.length - targetStart);
        target.set(this.subarray(sourceStart, sourceStart + len), targetStart);
        return len;
    };
    
    // equals - check if buffers are equal
    Uint8Array.prototype.equals = function(other) {
        if (!(other instanceof Uint8Array)) return false;
        if (this.length !== other.length) return false;
        for (let i = 0; i < this.length; i++) {
            if (this[i] !== other[i]) return false;
        }
        return true;
    };
    
    // compare - compare with another buffer
    Uint8Array.prototype.compare = function(other) {
        return Buffer.compare(this, other);
    };
    
    // fill - fill buffer with value
    Uint8Array.prototype.fill = function(value, offset, end) {
        offset = offset || 0;
        end = end !== undefined ? end : this.length;
        
        if (typeof value === 'number') {
            for (let i = offset; i < end; i++) {
                this[i] = value;
            }
        } else if (typeof value === 'string') {
            const fillBuf = Buffer.from(value);
            let pos = offset;
            while (pos < end) {
                const remaining = end - pos;
                const copyLen = Math.min(fillBuf.length, remaining);
                this.set(fillBuf.subarray(0, copyLen), pos);
                pos += copyLen;
            }
        }
        return this;
    };
    
    // includes - check if buffer contains value
    Uint8Array.prototype.includes = function(value, byteOffset) {
        return this.indexOf(value, byteOffset) !== -1;
    };
    
    // indexOf - find index of value
    Uint8Array.prototype.indexOf = function(value, byteOffset) {
        byteOffset = byteOffset || 0;
        
        if (typeof value === 'number') {
            for (let i = byteOffset; i < this.length; i++) {
                if (this[i] === value) return i;
            }
        } else if (typeof value === 'string') {
            const searchBuf = Buffer.from(value);
            for (let i = byteOffset; i <= this.length - searchBuf.length; i++) {
                let match = true;
                for (let j = 0; j < searchBuf.length; j++) {
                    if (this[i + j] !== searchBuf[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) return i;
            }
        } else if (value instanceof Uint8Array) {
            for (let i = byteOffset; i <= this.length - value.length; i++) {
                let match = true;
                for (let j = 0; j < value.length; j++) {
                    if (this[i + j] !== value[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) return i;
            }
        }
        return -1;
    };
    
    // toJSON - convert to JSON representation
    Uint8Array.prototype.toJSON = function() {
        return {
            type: 'Buffer',
            data: Array.from(this)
        };
    };
    
    Uint8Array.prototype._bufferMethodsAdded = true;
}