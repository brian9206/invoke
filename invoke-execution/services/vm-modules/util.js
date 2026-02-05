const util = {};
module.exports = util;

// ================== POSIX ERROR CODES ==================

const POSIX_ERRNO_CODES = {
    // File/Directory Operations
    ENOENT: { code: 2, message: "No such file or directory" },
    EACCES: { code: 13, message: "Permission denied" },
    EEXIST: { code: 17, message: "File exists" },
    ENOTDIR: { code: 20, message: "Not a directory" },
    EISDIR: { code: 21, message: "Is a directory" },
    ENOTEMPTY: { code: 39, message: "Directory not empty" },
    EMFILE: { code: 24, message: "Too many open files" },
    ENFILE: { code: 23, message: "Too many open files in system" },
    ELOOP: { code: 40, message: "Too many levels of symbolic links" },
    ENAMETOOLONG: { code: 36, message: "File name too long" },
    
    // Memory/Resource
    ENOMEM: { code: 12, message: "Not enough space/cannot allocate memory" },
    ENOSPC: { code: 28, message: "No space left on device" },
    EMLINK: { code: 31, message: "Too many links" },
    EDQUOT: { code: 122, message: "Disk quota exceeded" },
    
    // Process Operations  
    ESRCH: { code: 3, message: "No such process" },
    ECHILD: { code: 10, message: "No child processes" },
    EPERM: { code: 1, message: "Operation not permitted" },
    
    // I/O Operations
    EIO: { code: 5, message: "Input/output error" },
    EINTR: { code: 4, message: "Interrupted system call" },
    EINVAL: { code: 22, message: "Invalid argument" },
    EBADF: { code: 9, message: "Bad file descriptor" },
    EPIPE: { code: 32, message: "Broken pipe" },
    ESPIPE: { code: 29, message: "Illegal seek" },
    EROFS: { code: 30, message: "Read-only file system" },
    
    // Network Operations
    ECONNREFUSED: { code: 111, message: "Connection refused" },
    ECONNRESET: { code: 104, message: "Connection reset" },
    EHOSTUNREACH: { code: 113, message: "Host is unreachable" },
    ENETDOWN: { code: 100, message: "Network is down" },
    ENETUNREACH: { code: 101, message: "Network is unreachable" },
    ENOTCONN: { code: 107, message: "The socket is not connected" },
    ECONNABORTED: { code: 103, message: "Software caused connection abort" },
    ETIMEDOUT: { code: 110, message: "Connection timed out" },
    EADDRINUSE: { code: 98, message: "Address already in use" },
    EADDRNOTAVAIL: { code: 99, message: "Address not available" },
    
    // Generic System Errors
    EBUSY: { code: 16, message: "Device or resource busy" },
    EAGAIN: { code: 11, message: "Resource temporarily unavailable" },
    EWOULDBLOCK: { code: 11, message: "Operation would block" }, // Same as EAGAIN
    ENOSYS: { code: 38, message: "Function not implemented" },
    ENOTSUP: { code: 95, message: "Operation not supported" },
    EOPNOTSUPP: { code: 95, message: "Operation not supported" }, // Alias
    
    // Advanced Features
    EOVERFLOW: { code: 75, message: "Value too large to be stored in data type" },
    EILSEQ: { code: 84, message: "Invalid or incomplete multibyte or wide character" },
    ERANGE: { code: 34, message: "Result too large" },
    EDOM: { code: 33, message: "Mathematics argument out of domain of function" },
    E2BIG: { code: 7, message: "Argument list too long" },
    EFAULT: { code: 14, message: "Bad address" },
    EFBIG: { code: 27, message: "File too large" },
    EMSGSIZE: { code: 90, message: "Message too long" }
};

// Create reverse lookup maps
const ERRNO_TO_NAME = {};
const ERRNO_MAP = {};

for (const [name, info] of Object.entries(POSIX_ERRNO_CODES)) {
    ERRNO_TO_NAME[info.code] = name;
    ERRNO_MAP[name] = info;
}

// ================== SYSTEM ERROR UTILITIES ==================

util.getSystemErrorName = function(err) {
    if (typeof err === 'number') {
        return ERRNO_TO_NAME[Math.abs(err)] || null;
    }
    return null;
};

util.getSystemErrorMap = function() {
    const map = new Map();
    for (const [name, info] of Object.entries(POSIX_ERRNO_CODES)) {
        map.set(name, [info.message, info.code]);
    }
    return map;
};

util.getSystemErrorMessage = function(err) {
    const name = typeof err === 'number' ? ERRNO_TO_NAME[Math.abs(err)] : err;
    if (name && ERRNO_MAP[name]) {
        return ERRNO_MAP[name].message;
    }
    return 'Unknown system error';
};

// ================== PERFORMANCE-OPTIMIZED STRING BUFFER ==================

class StringBuffer {
    constructor(initialCapacity = 256) {
        this.chunks = [];
        this.length = 0;
        this.maxChunks = 100;
    }
    
    append(str) {
        if (typeof str !== 'string') {
            str = String(str);
        }
        this.chunks.push(str);
        this.length += str.length;
        
        // Consolidate when buffer gets too fragmented
        if (this.chunks.length > this.maxChunks) {
            this.consolidate();
        }
        return this;
    }
    
    consolidate() {
        if (this.chunks.length > 1) {
            const consolidated = this.chunks.join('');
            this.chunks = [consolidated];
        }
    }
    
    toString() {
        this.consolidate();
        return this.chunks[0] || '';
    }
    
    clear() {
        this.chunks.length = 0;
        this.length = 0;
    }
}

// ================== CIRCULAR REFERENCE TRACKER ==================

class CircularTracker {
    constructor() {
        this.seen = new WeakSet();
        this.circular = new WeakMap();
        this.refCounter = 0;
    }
    
    track(obj) {
        if (this.seen.has(obj)) {
            if (!this.circular.has(obj)) {
                this.circular.set(obj, ++this.refCounter);
            }
            return this.circular.get(obj);
        }
        this.seen.add(obj);
        return null;
    }
    
    isCircular(obj) {
        return this.circular.has(obj);
    }
    
    getCircularId(obj) {
        return this.circular.get(obj);
    }
}

// ================== UTIL.INSPECT IMPLEMENTATION ==================

// Default inspect options
const defaultOptions = {
    depth: 2,
    colors: false,
    showHidden: false,
    showProxy: false,
    maxArrayLength: 100,
    maxStringLength: 10000,
    breakLength: 80,
    compact: 3,
    customInspect: true,
    getters: false,
    sorted: false,
    numericSeparator: false
};

// Color styles for inspect
const inspectStyles = {
    special: 'cyan',
    number: 'yellow',
    bigint: 'yellow',
    boolean: 'yellow',
    undefined: 'grey',
    null: 'bold',
    string: 'green',
    symbol: 'green',
    date: 'magenta',
    regexp: 'red',
    module: 'underline'
};

const inspectColors = {
    bold: [1, 22],
    italic: [3, 23],
    underline: [4, 24],
    inverse: [7, 27],
    white: [37, 39],
    grey: [90, 39],
    black: [30, 39],
    blue: [34, 39],
    cyan: [36, 39],
    green: [32, 39],
    magenta: [35, 39],
    red: [31, 39],
    yellow: [33, 39]
};

// Custom inspect symbol
const customInspectSymbol = Symbol.for('nodejs.util.inspect.custom');

function stylizeWithColor(str, styleType) {
    const style = inspectStyles[styleType];
    if (style && inspectColors[style]) {
        const codes = inspectColors[style];
        return `\u001b[${codes[0]}m${str}\u001b[${codes[1]}m`;
    }
    return str;
}

function stylizeNoColor(str) {
    return str;
}

function formatPrimitive(value, ctx) {
    const type = typeof value;
    
    if (value === null) {
        return ctx.stylize('null', 'null');
    }
    
    if (type === 'undefined') {
        return ctx.stylize('undefined', 'undefined');
    }
    
    if (type === 'boolean') {
        return ctx.stylize(String(value), 'boolean');
    }
    
    if (type === 'number') {
        if (Object.is(value, -0)) {
            return ctx.stylize('-0', 'number');
        }
        if (!Number.isFinite(value)) {
            return ctx.stylize(String(value), 'number');
        }
        if (ctx.numericSeparator && Math.abs(value) >= 1000) {
            return ctx.stylize(value.toLocaleString(), 'number');
        }
        return ctx.stylize(String(value), 'number');
    }
    
    if (type === 'bigint') {
        let str = String(value);
        if (ctx.numericSeparator && str.length > 4) {
            // Simple separator insertion for bigint
            const num = str.slice(0, -1); // Remove 'n'
            const formatted = Math.abs(Number(num)) >= 1000 ? 
                Number(num).toLocaleString() : num;
            str = formatted + 'n';
        }
        return ctx.stylize(str, 'bigint');
    }
    
    if (type === 'string') {
        if (ctx.maxStringLength && value.length > ctx.maxStringLength) {
            const truncated = value.slice(0, ctx.maxStringLength - 3) + '...';
            return ctx.stylize(`'${truncated}'`, 'string');
        }
        // Escape special characters
        const escaped = value
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
        return ctx.stylize(`'${escaped}'`, 'string');
    }
    
    if (type === 'symbol') {
        return ctx.stylize(String(value), 'symbol');
    }
    
    return String(value);
}

function formatValue(ctx, value, recurseTimes) {
    // Check performance budget (2^27 character limit)
    if (ctx.budget > (1 << 27)) {
        return '[Object]';
    }

    // Handle primitives
    if (value === null || typeof value !== 'object') {
        return formatPrimitive(value, ctx);
    }
    
    // Check circular references
    const circularId = ctx.circular.track(value);
    if (circularId !== null) {
        return `[Circular *${circularId}]`;
    }

    // Depth check
    if (recurseTimes > ctx.depth) {
        if (Array.isArray(value)) {
            return ctx.stylize('[Array]', 'special');
        }
        return ctx.stylize('[Object]', 'special');
    }

    // Handle custom inspect
    if (ctx.customInspect && value[customInspectSymbol]) {
        try {
            const customResult = value[customInspectSymbol](ctx.depth - recurseTimes, ctx);
            if (typeof customResult === 'string') {
                return customResult;
            }
        } catch (err) {
            // Ignore custom inspect errors
        }
    }

    // Handle different object types
    if (Array.isArray(value)) {
        return formatArray(ctx, value, recurseTimes);
    }
    
    if (value instanceof Date) {
        const date = value.toISOString();
        return ctx.stylize(date, 'date');
    }
    
    if (value instanceof RegExp) {
        return ctx.stylize(String(value), 'regexp');
    }
    
    if (value instanceof Error) {
        return formatError(ctx, value, recurseTimes);
    }
    
    if (typeof value === 'function') {
        return formatFunction(ctx, value);
    }

    return formatObject(ctx, value, recurseTimes);
}

function formatArray(ctx, value, recurseTimes) {
    const maxLength = ctx.maxArrayLength;
    const length = value.length;
    const output = [];
    
    const elementsToShow = maxLength < length ? maxLength : length;
    
    for (let i = 0; i < elementsToShow; ++i) {
        if (i in value) {
            output.push(formatValue(ctx, value[i], recurseTimes + 1));
        } else {
            output.push('<empty>');
        }
    }
    
    if (maxLength < length) {
        output.push(`... ${length - maxLength} more items`);
    }
    
    // Update budget
    const result = `[ ${output.join(', ')} ]`;
    ctx.budget += result.length;
    
    return result;
}

function formatObject(ctx, value, recurseTimes) {
    const keys = Object.keys(value);
    const symbols = Object.getOwnPropertySymbols(value);
    
    if (ctx.showHidden) {
        keys.push(...Object.getOwnPropertyNames(value).filter(key => !keys.includes(key)));
    }
    
    if (ctx.sorted) {
        keys.sort();
    }
    
    const output = [];
    
    // Format regular properties
    for (const key of keys) {
        const desc = Object.getOwnPropertyDescriptor(value, key);
        if (!ctx.showHidden && !desc.enumerable) continue;
        
        const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
        const formattedValue = formatValue(ctx, value[key], recurseTimes + 1);
        output.push(`${formattedKey}: ${formattedValue}`);
    }
    
    // Format symbol properties
    if (symbols.length > 0) {
        for (const sym of symbols) {
            if (ctx.showHidden || Object.getOwnPropertyDescriptor(value, sym).enumerable) {
                const formattedValue = formatValue(ctx, value[sym], recurseTimes + 1);
                output.push(`[${String(sym)}]: ${formattedValue}`);
            }
        }
    }
    
    const result = output.length === 0 ? '{}' : `{ ${output.join(', ')} }`;
    ctx.budget += result.length;
    
    return result;
}

function formatError(ctx, value, recurseTimes) {
    const name = value.name || 'Error';
    const message = value.message || '';
    let result = `${name}`;
    if (message) {
        result += `: ${message}`;
    }
    return ctx.stylize(result, 'special');
}

function formatFunction(ctx, value) {
    const name = value.name || 'anonymous';
    return ctx.stylize(`[Function: ${name}]`, 'special');
}

util.inspect = function(value, options) {
    // Merge options with defaults
    const opts = Object.assign({}, defaultOptions, options);
    
    // Create context
    const ctx = {
        depth: opts.depth,
        maxArrayLength: opts.maxArrayLength,
        maxStringLength: opts.maxStringLength,
        breakLength: opts.breakLength,
        customInspect: opts.customInspect,
        showHidden: opts.showHidden,
        showProxy: opts.showProxy,
        sorted: opts.sorted,
        numericSeparator: opts.numericSeparator,
        stylize: opts.colors ? stylizeWithColor : stylizeNoColor,
        circular: new CircularTracker(),
        budget: 0
    };
    
    return formatValue(ctx, value, 0);
};

// Inspect configuration
util.inspect.custom = customInspectSymbol;
util.inspect.defaultOptions = defaultOptions;
util.inspect.styles = inspectStyles;
util.inspect.colors = inspectColors;

// ================== BASIC TYPE CHECKING ==================

// Deprecated methods (kept for compatibility)
util.isArray = Array.isArray;

util.isDate = function(value) {
    return value instanceof Date;
};

util.isError = function(value) {
    return value instanceof Error;
};

util.isRegExp = function(value) {
    return value instanceof RegExp;
};

// Deep equality check
util.isDeepStrictEqual = function(a, b) {
    return deepStrictEqual(a, b);
};

function deepStrictEqual(a, b) {
    if (Object.is(a, b)) {
        return true;
    }
    
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
        return false;
    }
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) {
        return false;
    }
    
    for (const key of keysA) {
        if (!keysB.includes(key) || !deepStrictEqual(a[key], b[key])) {
            return false;
        }
    }
    
    return true;
}

// ================== UTIL.TYPES IMPLEMENTATION ==================

util.types = {};

// ArrayBuffer family
util.types.isArrayBuffer = function(value) {
    return value instanceof ArrayBuffer;
};

util.types.isSharedArrayBuffer = function(value) {
    return typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer;
};

util.types.isArrayBufferView = function(value) {
    return ArrayBuffer.isView(value);
};

util.types.isAnyArrayBuffer = function(value) {
    return value instanceof ArrayBuffer || 
            (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer);
};

// Typed Arrays
util.types.isTypedArray = function(value) {
    return ArrayBuffer.isView(value) && !(value instanceof DataView);
};

util.types.isUint8Array = function(value) {
    return value instanceof Uint8Array;
};

util.types.isUint8ClampedArray = function(value) {
    return value instanceof Uint8ClampedArray;
};

util.types.isUint16Array = function(value) {
    return value instanceof Uint16Array;
};

util.types.isUint32Array = function(value) {
    return value instanceof Uint32Array;
};

util.types.isInt8Array = function(value) {
    return value instanceof Int8Array;
};

util.types.isInt16Array = function(value) {
    return value instanceof Int16Array;
};

util.types.isInt32Array = function(value) {
    return value instanceof Int32Array;
};

util.types.isBigInt64Array = function(value) {
    return typeof BigInt64Array !== 'undefined' && value instanceof BigInt64Array;
};

util.types.isBigUint64Array = function(value) {
    return typeof BigUint64Array !== 'undefined' && value instanceof BigUint64Array;
};

util.types.isFloat32Array = function(value) {
    return value instanceof Float32Array;
};

util.types.isFloat64Array = function(value) {
    return value instanceof Float64Array;
};

util.types.isDataView = function(value) {
    return value instanceof DataView;
};

// Basic object types
util.types.isDate = function(value) {
    return value instanceof Date;
};

util.types.isRegExp = function(value) {
    return value instanceof RegExp;
};

// Collections
util.types.isMap = function(value) {
    return value instanceof Map;
};

util.types.isSet = function(value) {
    return value instanceof Set;
};

util.types.isWeakMap = function(value) {
    return value instanceof WeakMap;
};

util.types.isWeakSet = function(value) {
    return value instanceof WeakSet;
};

// Iterators
util.types.isMapIterator = function(value) {
    return Object.prototype.toString.call(value) === '[object Map Iterator]';
};

util.types.isSetIterator = function(value) {
    return Object.prototype.toString.call(value) === '[object Set Iterator]';
};

// Functions
util.types.isFunction = function(value) {
    return typeof value === 'function';
};

util.types.isAsyncFunction = function(value) {
    return Object.prototype.toString.call(value) === '[object AsyncFunction]';
};

util.types.isGeneratorFunction = function(value) {
    return Object.prototype.toString.call(value) === '[object GeneratorFunction]';
};

util.types.isGeneratorObject = function(value) {
    return Object.prototype.toString.call(value) === '[object Generator]';
};

// Promise
util.types.isPromise = function(value) {
    return value instanceof Promise;
};

// Boxed primitives
util.types.isBoxedPrimitive = function(value) {
    return util.types.isBooleanObject(value) ||
            util.types.isNumberObject(value) ||
            util.types.isStringObject(value) ||
            util.types.isSymbolObject(value) ||
            util.types.isBigIntObject(value);
};

util.types.isBooleanObject = function(value) {
    return typeof value === 'object' && value !== null && value instanceof Boolean;
};

util.types.isNumberObject = function(value) {
    return typeof value === 'object' && value !== null && value instanceof Number;
};

util.types.isStringObject = function(value) {
    return typeof value === 'object' && value !== null && value instanceof String;
};

util.types.isSymbolObject = function(value) {
    return typeof value === 'object' && value !== null && value instanceof Symbol;
};

util.types.isBigIntObject = function(value) {
    return typeof value === 'object' && value !== null && 
            Object.prototype.toString.call(value) === '[object BigInt]';
};

// Arguments object
util.types.isArgumentsObject = function(value) {
    return Object.prototype.toString.call(value) === '[object Arguments]';
};

// Complex type detection (simplified for VM)
util.types.isProxy = function(value) {
    // Proxy detection is limited in VM environment
    // This is a best-effort implementation
    try {
        return typeof value === 'object' && value !== null && 
                value.constructor === undefined && 
                Object.getPrototypeOf(value) === null;
    } catch {
        return false;
    }
};

util.types.isExternal = function(value) {
    // External values are V8-specific and not available in VM
    return false;
};

util.types.isModuleNamespaceObject = function(value) {
    // Module namespace detection is limited
    return typeof value === 'object' && value !== null &&
            Object.prototype.toString.call(value) === '[object Module]';
};

// Native error types
util.types.isNativeError = function(value) {
    return value instanceof Error ||
            value instanceof EvalError ||
            value instanceof RangeError ||
            value instanceof ReferenceError ||
            value instanceof SyntaxError ||
            value instanceof TypeError ||
            value instanceof URIError;
};

// Crypto objects (placeholder - would need crypto module integration)
util.types.isKeyObject = function(value) {
    // Would need integration with crypto module
    return false;
};

util.types.isCryptoKey = function(value) {
    // Would need integration with crypto module  
    return false;
};

// ================== INHERITANCE UTILITIES ==================

util.inherits = function(ctor, superCtor) {
    if (ctor === undefined || ctor === null) {
        throw new TypeError('The constructor to "inherits" must not be null or undefined');
    }
    
    if (superCtor === undefined || superCtor === null) {
        throw new TypeError('The super constructor to "inherits" must not be null or undefined');
    }
    
    if (superCtor.prototype === undefined) {
        throw new TypeError('The super constructor to "inherits" must have a prototype');
    }
    
    ctor.super_ = superCtor;
    Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
};

// ================== OBJECT EXTENSION (DEPRECATED) ==================

util._extend = function(target, source) {
    // Shallow copy properties from source to target
    if (target == null) {
        throw new TypeError('target argument must not be null or undefined');
    }
    
    const to = Object(target);
    
    if (source == null) {
        return to;
    }
    
    const from = Object(source);
    const keys = Object.keys(from);
    
    for (let i = 0; i < keys.length; i++) {
        to[keys[i]] = from[keys[i]];
    }
    
    return to;
};

// ================== TEXT ENCODING/DECODING ==================

// TextEncoder class
util.TextEncoder = class TextEncoder {
    constructor() {
        this.encoding = 'utf-8';
    }
    
    encode(input = '') {
        return _textEncoderEncode.applySync(undefined, [String(input)]);
    }
    
    encodeInto(source, destination) {
        if (!(destination instanceof Uint8Array)) {
            throw new TypeError('destination must be a Uint8Array');
        }
        
        const encoded = this.encode(source);
        const copyLength = Math.min(encoded.length, destination.length);
        
        for (let i = 0; i < copyLength; i++) {
            destination[i] = encoded[i];
        }
        
        return {
            read: source.length,
            written: copyLength
        };
    }
};

// TextDecoder class
util.TextDecoder = class TextDecoder {
    constructor(encoding = 'utf-8', options = {}) {
        this.encoding = encoding.toLowerCase();
        this.fatal = !!options.fatal;
        this.ignoreBOM = !!options.ignoreBOM;
        
        // Validate encoding
        const supportedEncodings = ['utf-8', 'utf8', 'ascii', 'latin1', 'binary'];
        if (!supportedEncodings.includes(this.encoding)) {
            throw new TypeError(`Unsupported encoding: ${encoding}`);
        }
    }
    
    decode(input) {
        if (input === undefined) {
            return '';
        }
        
        // Convert ArrayBuffer to Uint8Array if needed
        if (input instanceof Uint8Array) {
            input = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
        }
        
        const res = _textDecoderDecode.applySync(undefined, [input, this.encoding], { arguments: { copy: true } });
        console.log('nigger', new Uint8Array(input).toString());
        return res;
    }
};

// ================== ANSI/VT CONTROL CHARACTER UTILITIES ==================

util.stripVTControlCharacters = function(str) {
    if (typeof str !== 'string') {
        return str;
    }
    
    // Remove ANSI escape sequences and VT control characters
    return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // ANSI CSI sequences
                .replace(/\x1b\][0-9;]*\x07/g, '')       // OSC sequences
                .replace(/\x1b[()][AB012]/g, '')         // Character set sequences
                .replace(/[\x00-\x1f\x7f-\x9f]/g, '');   // Control characters
};

// ================== COLOR/STYLE TEXT UTILITIES ==================

util.styleText = function(format, text) {
    if (typeof text !== 'string') {
        text = String(text);
    }
    
    const styles = {
        reset: [0, 0],
        bold: [1, 22],
        dim: [2, 22],
        italic: [3, 23],
        underline: [4, 24],
        overline: [53, 55],
        inverse: [7, 27],
        hidden: [8, 28],
        strikethrough: [9, 29],
        black: [30, 39],
        red: [31, 39],
        green: [32, 39],
        yellow: [33, 39],
        blue: [34, 39],
        magenta: [35, 39],
        cyan: [36, 39],
        white: [37, 39],
        gray: [90, 39],
        grey: [90, 39],
        bgBlack: [40, 49],
        bgRed: [41, 49],
        bgGreen: [42, 49],
        bgYellow: [43, 49],
        bgBlue: [44, 49],
        bgMagenta: [45, 49],
        bgCyan: [46, 49],
        bgWhite: [47, 49]
    };
    
    const style = styles[format];
    if (!style) {
        return text;
    }
    
    // Check if colors should be disabled (basic terminal detection)
    const supportsColor = typeof process !== 'undefined' && 
                            process.env && 
                            process.env.FORCE_COLOR !== '0' &&
                            (process.env.FORCE_COLOR || process.env.TERM !== 'dumb');
    
    if (!supportsColor) {
        return text;
    }
    
    return `\x1b[${style[0]}m${text}\x1b[${style[1]}m`;
};

// ================== USV STRING UTILITIES ==================

util.toUSVString = function(string) {
    if (typeof string !== 'string') {
        return String(string);
    }
    
    // Replace unpaired surrogates with U+FFFD replacement character
    return string.replace(/[\uD800-\uDFFF]/g, function(match, offset, str) {
        const code = match.charCodeAt(0);
        
        if (code >= 0xD800 && code <= 0xDBFF) {
            // High surrogate
            const next = str.charCodeAt(offset + 1);
            if (next >= 0xDC00 && next <= 0xDFFF) {
                // Valid surrogate pair
                return match;
            }
            // Unpaired high surrogate
            return '\uFFFD';
        } else {
            // Low surrogate - check if preceded by high surrogate
            const prev = str.charCodeAt(offset - 1);
            if (prev >= 0xD800 && prev <= 0xDBFF) {
                // Valid surrogate pair (already handled)
                return match;
            }
            // Unpaired low surrogate
            return '\uFFFD';
        }
    });
};

// ================== STRING FORMATTING UTILITIES ==================

function formatRegExp(value) {
    return String(value);
}

function formatNumber(value, formatType) {
    switch (formatType) {
        case 'd':
        case 'i':
            return String(parseInt(value) || 0);
        case 'f':
            return String(parseFloat(value) || 0);
        case 'j':
            try {
                return JSON.stringify(value);
            } catch {
                return '[Circular]';
            }
        case 'o':
        case 'O':
            return util.inspect(value);
        case 's':
        default:
            return String(value);
    }
}

util.format = function(f, ...args) {
    if (typeof f !== 'string') {
        return [f, ...args].map(arg => util.inspect(arg)).join(' ');
    }
    
    let i = 0;
    const str = f.replace(/%[sdifjoO%]/g, function(x) {
        if (x === '%%') {
            return '%'; // Handle %% first, don't consume args
        }
        if (i >= args.length) return x;
        
        switch (x) {
            case '%s': return String(args[i++]);
            case '%d':
            case '%i': return String(parseInt(args[i++]) || 0);
            case '%f': return String(parseFloat(args[i++]) || 0);
            case '%j':
                try {
                    return JSON.stringify(args[i++]);
                } catch {
                    return '[Circular]';
                }
            case '%o':
            case '%O': return util.inspect(args[i++]);
            default:
                return x;
        }
    });
    
    // Append remaining arguments
    const remaining = args.slice(i);
    if (remaining.length > 0) {
        return str + ' ' + remaining.map(arg => util.inspect(arg)).join(' ');
    }
    
    return str;
};

util.formatWithOptions = function(options, f, ...args) {
    if (typeof options !== 'object' || options === null) {
        throw new TypeError('options must be an object');
    }
    
    // Override global inspect options temporarily
    const originalOptions = Object.assign({}, defaultOptions);
    Object.assign(defaultOptions, options);
    
    try {
        return util.format(f, ...args);
    } finally {
        Object.assign(defaultOptions, originalOptions);
    }
};

// ================== ASYNC UTILITIES ==================

// Symbol for custom promisify implementations
const customPromisifySymbol = Symbol.for('nodejs.util.promisify.custom');

util.promisify = function(original) {
    if (typeof original !== 'function') {
        throw new TypeError('original must be a function');
    }
    
    // Check for custom promisify implementation
    if (original[customPromisifySymbol]) {
        const customPromisify = original[customPromisifySymbol];
        if (typeof customPromisify !== 'function') {
            throw new TypeError('custom promisify must be a function');
        }
        return customPromisify;
    }
    
    // Create promisified function
    function promisified(...args) {
        return new Promise((resolve, reject) => {
            try {
                original.call(this, ...args, (err, ...values) => {
                    if (err) {
                        reject(err);
                    } else if (values.length === 0) {
                        resolve();
                    } else if (values.length === 1) {
                        resolve(values[0]);
                    } else {
                        resolve(values);
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    }
    
    Object.setPrototypeOf(promisified, Object.getPrototypeOf(original));
    Object.defineProperties(promisified, {
        name: { value: original.name },
        length: { value: Math.max(0, original.length - 1) }
    });
    
    return promisified;
};

util.promisify.custom = customPromisifySymbol;

util.callbackify = function(original) {
    if (typeof original !== 'function') {
        throw new TypeError('original must be a function');
    }
    
    function callbackified(...args) {
        const callback = args.pop();
        if (typeof callback !== 'function') {
            throw new TypeError('last argument must be a callback function');
        }
        
        Promise.resolve().then(() => {
            return original.apply(this, args);
        }).then((result) => {
            // Use nextTick equivalent (setTimeout with 0)
            setTimeout(() => callback(null, result), 0);
        }).catch((err) => {
            setTimeout(() => callback(err), 0);
        });
    }
    
    Object.setPrototypeOf(callbackified, Object.getPrototypeOf(original));
    Object.defineProperties(callbackified, {
        name: { value: original.name },
        length: { value: original.length + 1 }
    });
    
    return callbackified;
};

// ================== ABORT CONTROLLER UTILITIES ==================

util.transferableAbortController = function() {
    if (typeof AbortController === 'undefined') {
        throw new Error('AbortController is not available in this environment');
    }
    const controller = new AbortController();
    // In a real implementation, this would make the controller transferable
    // For VM environment, we'll return a regular AbortController
    return controller;
};

util.transferableAbortSignal = function(signal) {
    if (!(signal instanceof AbortSignal)) {
        throw new TypeError('signal must be an AbortSignal');
    }
    // In VM environment, just return the signal as-is
    return signal;
};

util.aborted = function(signal, resource) {
    if (typeof AbortSignal === 'undefined') {
        throw new Error('AbortSignal is not available in this environment');
    }
    if (!(signal instanceof AbortSignal)) {
        throw new TypeError('signal must be an AbortSignal');
    }
    
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            resolve();
            return;
        }
        
        const onAbort = () => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        };
        
        signal.addEventListener('abort', onAbort);
    });
};

// ================== DEPRECATION UTILITIES ==================

const deprecationWarnings = new Set();

util.deprecate = function(fn, msg, code) {
    if (typeof fn !== 'function') {
        throw new TypeError('fn must be a function');
    }
    
    if (typeof msg !== 'string') {
        throw new TypeError('msg must be a string');
    }
    
    function deprecated(...args) {
        const warningKey = code || msg;
        
        if (!deprecationWarnings.has(warningKey)) {
            deprecationWarnings.add(warningKey);
            
            const warning = code ? 
                `[${code}] DeprecationWarning: ${msg}` :
                `DeprecationWarning: ${msg}`;
                
            // In VM environment, use console.warn
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(warning);
            }
        }
        
        return fn.apply(this, args);
    }
    
    Object.setPrototypeOf(deprecated, Object.getPrototypeOf(fn));
    Object.defineProperties(deprecated, {
        name: { value: fn.name },
        length: { value: fn.length }
    });
    
    return deprecated;
};

// ================== DEBUG LOGGING ==================

const debugLoggers = {};

util.debuglog = function(section, callback) {
    if (typeof section !== 'string') {
        throw new TypeError('section must be a string');
    }
    
    if (debugLoggers[section]) {
        return debugLoggers[section];
    }
    
    // Check NODE_DEBUG environment variable
    const nodeDebug = (typeof process !== 'undefined' && 
                        process.env && 
                        process.env.NODE_DEBUG) || '';
    
    const debugSections = nodeDebug.split(/[\s,]+/).filter(Boolean);
    const enabled = debugSections.includes(section) || 
                    debugSections.includes('*');
    
    function debugLogger(...args) {
        if (enabled) {
            const formatted = util.format(...args);
            const output = `${section.toUpperCase()} ${process.pid || 'VM'}: ${formatted}`;
            
            if (typeof console !== 'undefined' && console.error) {
                console.error(output);
            }
        }
    }
    
    debugLogger.enabled = enabled;
    debugLoggers[section] = debugLogger;
    
    return debugLogger;
};

// Alias for debuglog
util.debug = util.debuglog;

// ================== COMMAND LINE ARGUMENT PARSING ==================

util.parseArgs = function(config = {}) {
    const {
        args = typeof process !== 'undefined' && process.argv ? 
                process.argv.slice(2) : [],
        options = {},
        strict = true,
        allowPositionals = true,
        tokens = false
    } = config;
    
    const result = {
        values: {},
        positionals: []
    };
    
    if (tokens) {
        result.tokens = [];
    }
    
    const optionConfig = {};
    const aliases = {};
    
    // Process option configuration
    for (const [name, option] of Object.entries(options)) {
        optionConfig[name] = {
            type: option.type || 'boolean',
            multiple: !!option.multiple,
            default: option.default,
            short: option.short
        };
        
        // Set up short option alias
        if (option.short) {
            aliases[option.short] = name;
        }
    }
    
    let i = 0;
    while (i < args.length) {
        const arg = args[i];
        
        if (arg === '--') {
            // Everything after -- is positional
            i++;
            while (i < args.length) {
                result.positionals.push(args[i]);
                if (tokens) {
                    result.tokens.push({
                        kind: 'positional',
                        index: i - 1,
                        value: args[i]
                    });
                }
                i++;
            }
            break;
        }
        
        if (arg.startsWith('--')) {
            // Long option
            const [optName, optValue] = arg.slice(2).split('=', 2);
            const option = optionConfig[optName];
            
            if (!option && strict) {
                throw new Error(`Unknown option: --${optName}`);
            }
            
            if (option) {
                let value;
                
                if (option.type === 'boolean') {
                    value = optValue !== 'false';
                } else {
                    if (optValue !== undefined) {
                        value = optValue;
                    } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                        value = args[++i];
                    } else {
                        throw new Error(`Option --${optName} requires a value`);
                    }
                }
                
                if (option.multiple) {
                    if (!result.values[optName]) {
                        result.values[optName] = [];
                    }
                    result.values[optName].push(value);
                } else {
                    result.values[optName] = value;
                }
                
                if (tokens) {
                    result.tokens.push({
                        kind: 'option',
                        name: optName,
                        value: value,
                        index: i
                    });
                }
            }
        } else if (arg.startsWith('-') && arg.length > 1) {
            // Short option(s)
            const shortOpts = arg.slice(1);
            
            for (let j = 0; j < shortOpts.length; j++) {
                const shortOpt = shortOpts[j];
                const optName = aliases[shortOpt];
                const option = optName ? optionConfig[optName] : null;
                
                if (!option && strict) {
                    throw new Error(`Unknown option: -${shortOpt}`);
                }
                
                if (option) {
                    let value;
                    
                    if (option.type === 'boolean') {
                        value = true;
                    } else {
                        // Value can be attached or next arg
                        if (j < shortOpts.length - 1) {
                            value = shortOpts.slice(j + 1);
                            j = shortOpts.length; // Consume rest of string
                        } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                            value = args[++i];
                        } else {
                            throw new Error(`Option -${shortOpt} requires a value`);
                        }
                    }
                    
                    if (option.multiple) {
                        if (!result.values[optName]) {
                            result.values[optName] = [];
                        }
                        result.values[optName].push(value);
                    } else {
                        result.values[optName] = value;
                    }
                    
                    if (tokens) {
                        result.tokens.push({
                            kind: 'option',
                            name: optName,
                            value: value,
                            index: i
                        });
                    }
                }
            }
        } else {
            // Positional argument
            if (!allowPositionals && strict) {
                throw new Error(`Unexpected positional argument: ${arg}`);
            }
            
            result.positionals.push(arg);
            if (tokens) {
                result.tokens.push({
                    kind: 'positional',
                    index: i,
                    value: arg
                });
            }
        }
        
        i++;
    }
    
    // Apply defaults
    for (const [name, option] of Object.entries(optionConfig)) {
        if (!(name in result.values) && option.default !== undefined) {
            result.values[name] = option.default;
        }
    }
    
    return result;
};

// ================== MIME TYPE UTILITIES ==================

util.MIMEType = class MIMEType {
    constructor(input) {
        if (typeof input !== 'string') {
            throw new TypeError('input must be a string');
        }
        
        // Basic MIME type parsing
        const match = input.match(/^([^\/\s]+)\/([^;\s]+)(?:\s*;\s*(.*))?$/);
        if (!match) {
            throw new TypeError('Invalid MIME type');
        }
        
        this.type = match[1].toLowerCase();
        this.subtype = match[2].toLowerCase();
        this.params = new util.MIMEParams();
        
        if (match[3]) {
            // Parse parameters
            const params = match[3].split(';');
            for (const param of params) {
                const [key, value] = param.split('=', 2);
                if (key && value) {
                    this.params.set(key.trim(), value.trim().replace(/^"|"$/g, ''));
                }
            }
        }
    }
    
    get essence() {
        return `${this.type}/${this.subtype}`;
    }
    
    toString() {
        let result = this.essence;
        
        for (const [key, value] of this.params) {
            result += `; ${key}=${value}`;
        }
        
        return result;
    }
};

util.MIMEParams = class MIMEParams extends Map {
    constructor(init) {
        super();
        
        if (init) {
            if (typeof init[Symbol.iterator] === 'function') {
                for (const [key, value] of init) {
                    this.set(key, value);
                }
            }
        }
    }
    
    set(key, value) {
        if (typeof key !== 'string' || typeof value !== 'string') {
            throw new TypeError('key and value must be strings');
        }
        
        return super.set(key.toLowerCase(), value);
    }
    
    get(key) {
        if (typeof key !== 'string') {
            return undefined;
        }
        
        return super.get(key.toLowerCase());
    }
    
    has(key) {
        if (typeof key !== 'string') {
            return false;
        }
        
        return super.has(key.toLowerCase());
    }
    
    delete(key) {
        if (typeof key !== 'string') {
            return false;
        }
        
        return super.delete(key.toLowerCase());
    }
};

// ================== DIFF ALGORITHM (MYERS) ==================

util.diff = function(actual, expected) {
    if (typeof actual === 'string' && typeof expected === 'string') {
        return diffLines(actual.split('\n'), expected.split('\n'));
    }
    
    if (Array.isArray(actual) && Array.isArray(expected)) {
        return diffLines(actual, expected);
    }
    
    // For non-string/array inputs, convert to inspected strings and diff
    const actualStr = util.inspect(actual);
    const expectedStr = util.inspect(expected);
    
    return diffLines(actualStr.split('\n'), expectedStr.split('\n'));
};

function diffLines(actual, expected) {
    const n = actual.length;
    const m = expected.length;
    const max = n + m;
    
    const v = {};
    const trace = [];
    
    v[1] = 0;
    
    for (let d = 0; d <= max; d++) {
        trace.push(Object.assign({}, v));
        
        for (let k = -d; k <= d; k += 2) {
            let x;
            
            if (k === -d || (k !== d && v[k - 1] < v[k + 1])) {
                x = v[k + 1];
            } else {
                x = v[k - 1] + 1;
            }
            
            let y = x - k;
            
            while (x < n && y < m && actual[x] === expected[y]) {
                x++;
                y++;
            }
            
            v[k] = x;
            
            if (x >= n && y >= m) {
                return buildDiff(trace, actual, expected, d);
            }
        }
    }
    
    // Fallback - shouldn't reach here
    return [];
}

function buildDiff(trace, actual, expected, d) {
    const diff = [];
    let x = actual.length;
    let y = expected.length;
    
    for (let t = d; t >= 0; t--) {
        const v = trace[t];
        const k = x - y;
        
        let prevK;
        if (k === -t || (k !== t && v[k - 1] < v[k + 1])) {
            prevK = k + 1;
        } else {
            prevK = k - 1;
        }
        
        const prevX = v[prevK];
        const prevY = prevX - prevK;
        
        while (x > prevX && y > prevY) {
            diff.unshift({ type: 'common', value: actual[x - 1] });
            x--;
            y--;
        }
        
        if (t > 0) {
            if (x > prevX) {
                diff.unshift({ type: 'removed', value: actual[x - 1] });
                x--;
            } else {
                diff.unshift({ type: 'added', value: expected[y - 1] });
                y--;
            }
        }
    }
    
    return diff;
};

// ================== ENVIRONMENT FILE PARSING ==================

util.parseEnv = function(content) {
    if (typeof content !== 'string') {
        throw new TypeError('content must be a string');
    }
    
    const result = {};
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines and comments
        if (!line || line.startsWith('#')) {
            continue;
        }
        
        // Find the first = sign
        const equalIndex = line.indexOf('=');
        if (equalIndex === -1) {
            continue;
        }
        
        const key = line.slice(0, equalIndex).trim();
        let value = line.slice(equalIndex + 1).trim();
        
        // Handle quoted values
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        
        // Handle escaped characters in double quotes
        if (line.slice(equalIndex + 1).trim().startsWith('"')) {
            value = value.replace(/\\n/g, '\n')
                        .replace(/\\r/g, '\r')
                        .replace(/\\t/g, '\t')
                        .replace(/\\\\/g, '\\')
                        .replace(/\\"/g, '"');
        }
        
        result[key] = value;
    }
    
    return result;
};

// ================== PROCESS SIGNAL UTILITIES (MOCK) ==================

util.convertProcessSignalToExitCode = function(signalCode) {
    // POSIX signal to exit code mapping
    const signalMap = {
        'SIGHUP': 129,    // 128 + 1
        'SIGINT': 130,    // 128 + 2
        'SIGQUIT': 131,   // 128 + 3
        'SIGILL': 132,    // 128 + 4
        'SIGTRAP': 133,   // 128 + 5
        'SIGABRT': 134,   // 128 + 6
        'SIGBUS': 135,    // 128 + 7
        'SIGFPE': 136,    // 128 + 8
        'SIGKILL': 137,   // 128 + 9
        'SIGUSR1': 138,   // 128 + 10
        'SIGSEGV': 139,   // 128 + 11
        'SIGUSR2': 140,   // 128 + 12
        'SIGPIPE': 141,   // 128 + 13
        'SIGALRM': 142,   // 128 + 14
        'SIGTERM': 143,   // 128 + 15
        'SIGCHLD': 145,   // 128 + 17
        'SIGCONT': 146,   // 128 + 18
        'SIGSTOP': 147,   // 128 + 19
        'SIGTSTP': 148,   // 128 + 20
        'SIGTTIN': 149,   // 128 + 21
        'SIGTTOU': 150,   // 128 + 22
        'SIGURG': 151,    // 128 + 23
        'SIGXCPU': 152,   // 128 + 24
        'SIGXFSZ': 153,   // 128 + 25
        'SIGVTALRM': 154, // 128 + 26
        'SIGPROF': 155,   // 128 + 27
        'SIGWINCH': 156,  // 128 + 28
        'SIGIO': 157,     // 128 + 29
        'SIGPWR': 158,    // 128 + 30
        'SIGSYS': 159     // 128 + 31
    };
    
    if (typeof signalCode === 'string') {
        return signalMap[signalCode.toUpperCase()] || 128;
    }
    
    if (typeof signalCode === 'number' && signalCode > 0 && signalCode < 32) {
        return 128 + signalCode;
    }
    
    return 128;
};

util.setTraceSigInt = function(enable) {
    // No-op in VM environment - would require host process integration
    return undefined;
};

// ================== CALL SITES (LIMITED IMPLEMENTATION) ==================

util.getCallSites = function() {
    // Limited implementation - V8's CallSite API is not available in VM
    // Return basic stack trace information
    try {
        throw new Error();
    } catch (err) {
        const stack = err.stack || '';
        const lines = stack.split('\n').slice(1); // Skip the error message
        
        return lines.map((line, index) => {
            const match = line.match(/^\s*at\s+(.+?)(?:\s+\((.+?):(\d+):(\d+)\))?$/);
            
            return {
                getFunctionName: () => match ? match[1] : 'unknown',
                getFileName: () => match ? match[2] : 'unknown',
                getLineNumber: () => match ? parseInt(match[3]) || 0 : 0,
                getColumnNumber: () => match ? parseInt(match[4]) || 0 : 0,
                isNative: () => false,
                isToplevel: () => index === 0,
                isEval: () => false,
                isConstructor: () => false,
                toString: () => line.trim()
            };
        });
    }
};


