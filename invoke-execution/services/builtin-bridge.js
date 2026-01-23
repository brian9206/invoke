const ivm = require('isolated-vm');

/**
 * Builtin module bridge for isolated-vm context
 * Provides access to Node.js core modules within the VM
 * 
 * Architecture: Uses flattened globals with naming convention _moduleName_methodName
 * This allows the VM to reconstruct module objects generically without hardcoded structure
 */
class BuiltinBridge {
    /**
     * Recursively flatten a module object to individual globals with naming convention
     * @param {ivm.Context} context - The isolated-vm context
     * @param {string} moduleName - Name of the module (e.g., 'fs', 'crypto')
     * @param {Object} moduleObj - Module object with methods/properties
     * @param {string} prefix - Current prefix for nested properties
     */
    static setModuleGlobals(context, moduleName, moduleObj, prefix = '') {
        const currentPrefix = prefix || `_${moduleName}_`;
        
        for (const [key, value] of Object.entries(moduleObj)) {
            const globalName = `${currentPrefix}${key}`;
            
            // Handle nested objects (e.g., fs.promises, util.types)
            if (value && typeof value === 'object' && !value.applySync && !value.copyInto) {
                // This is a plain object or external copy, recurse into it
                this.setModuleGlobals(context, moduleName, value, `${currentPrefix}${key}_`);
            } else {
                // This is an ivm.Reference or ExternalCopy, set directly
                context.global.setSync(globalName, value);
            }
        }
    }
    
    /**
     * Set up all built-in module references in the VM context
     * @param {ivm.Context} context - The isolated-vm context
     * @param {Object} fsModule - The fs module object with ivm.Reference methods
     * @param {Object} pathModule - The path module object with ivm.Reference methods
     */
    static async setupAll(context, fsModule, pathModule) {
        // Set fs module references (flattened with naming convention)
        this.setupFS(context, fsModule);
        
        // Set path module references (flattened with naming convention)
        this.setupPath(context, pathModule);
        
        // Set up other built-in modules (flattened with naming convention)
        this.setupCrypto(context);
        this.setupQuerystring(context);
        this.setupUrl(context);
        this.setupUtil(context);
        this.setupBuffer(context);
        this.setupEvents(context);
        this.setupStringDecoder(context);
        this.setupZlib(context);
        
        // Set metadata array of available modules
        await context.global.set(
            '_moduleNames',
            new ivm.ExternalCopy(['fs', 'path', 'crypto', 'querystring', 'url', 'util', 'buffer', 'events', 'string_decoder', 'zlib']).copyInto()
        );
    }
    
    /**
     * Setup fs module (from VFS)
     */
    static setupFS(context, fsModule) {
        // fsModule is the VFS-based fs with all methods as ivm.Reference
        // Flatten it using naming convention: _fs_readFileSync, _fs_promises_readFile, etc.
        this.setModuleGlobals(context, 'fs', fsModule);
    }
    
    /**
     * Setup path module (from VFS)
     */
    static setupPath(context, pathModule) {
        // pathModule is the VFS-based path with all methods as ivm.Reference
        // Flatten it using naming convention: _path_join, _path_resolve, etc.
        this.setModuleGlobals(context, 'path', pathModule);
    }
    
    /**
     * Setup crypto module
     */
    static setupCrypto(context) {
        const crypto = this.createCryptoModule();
        this.setModuleGlobals(context, 'crypto', crypto);
    }
    
    /**
     * Setup querystring module
     */
    static setupQuerystring(context) {
        const querystring = this.createQuerystringModule();
        this.setModuleGlobals(context, 'querystring', querystring);
    }
    
    /**
     * Setup url module
     */
    static setupUrl(context) {
        const url = this.createUrlModule();
        this.setModuleGlobals(context, 'url', url);
    }
    
    /**
     * Setup util module
     */
    static setupUtil(context) {
        const util = this.createUtilModule();
        this.setModuleGlobals(context, 'util', util);
    }
    
    /**
     * Setup buffer module
     */
    static setupBuffer(context) {
        const buffer = this.createBufferModule();
        this.setModuleGlobals(context, 'buffer', buffer);
    }
    
    /**
     * Setup events module
     */
    static setupEvents(context) {
        const events = this.createEventsModule();
        this.setModuleGlobals(context, 'events', events);
    }
    
    /**
     * Setup string_decoder module
     */
    static setupStringDecoder(context) {
        const stringDecoder = this.createStringDecoderModule();
        this.setModuleGlobals(context, 'string_decoder', stringDecoder);
    }
    
    /**
     * Setup zlib module
     */
    static setupZlib(context) {
        const zlib = this.createZlibModule();
        this.setModuleGlobals(context, 'zlib', zlib);
    }

    // =========================================================================
    // MODULE CREATORS - Create module objects with ivm.Reference methods
    // =========================================================================
    
    /**
     * Create crypto module
     */
    static createCryptoModule() {
        const crypto = require('crypto');
        
        return {
            // Simplified hash function (no chaining, direct computation)
            createHash: new ivm.Reference(function(algorithm) {
                // Return a simple hash builder ID that can be used
                const hashId = Math.random().toString(36);
                const hash = crypto.createHash(algorithm);
                
                // Store hash instance temporarily
                if (!global.__hashStore) global.__hashStore = new Map();
                global.__hashStore.set(hashId, hash);
                
                return hashId;
            }),
            
            // Hash update (works on stored hash instance)
            _hashUpdate: new ivm.Reference(function(hashId, data) {
                const hash = global.__hashStore?.get(hashId);
                if (hash) {
                    hash.update(data);
                }
                return hashId; // Return for chaining
            }),
            
            // Hash digest (completes and cleans up)
            _hashDigest: new ivm.Reference(function(hashId, encoding) {
                const hash = global.__hashStore?.get(hashId);
                if (hash) {
                    const result = hash.digest(encoding);
                    global.__hashStore.delete(hashId);
                    return result;
                }
                return '';
            }),
            
            // HMAC
            createHmac: new ivm.Reference(function(algorithm, key) {
                const hmacId = Math.random().toString(36);
                const hmac = crypto.createHmac(algorithm, key);
                
                if (!global.__hmacStore) global.__hmacStore = new Map();
                global.__hmacStore.set(hmacId, hmac);
                
                return hmacId;
            }),
            
            _hmacUpdate: new ivm.Reference(function(hmacId, data) {
                const hmac = global.__hmacStore?.get(hmacId);
                if (hmac) {
                    hmac.update(data);
                }
                return hmacId;
            }),
            
            _hmacDigest: new ivm.Reference(function(hmacId, encoding) {
                const hmac = global.__hmacStore?.get(hmacId);
                if (hmac) {
                    const result = hmac.digest(encoding);
                    global.__hmacStore.delete(hmacId);
                    return result;
                }
                return '';
            }),
            
            // Random bytes
            randomBytes: new ivm.Reference(function(size) {
                return crypto.randomBytes(size).toString('hex');
            }),
            
            // UUID
            randomUUID: new ivm.Reference(function() {
                return crypto.randomUUID();
            }),
            
            // Constants
            constants: new ivm.ExternalCopy(crypto.constants).copyInto()
        };
    }
    
    /**
     * Create querystring module
     */
    static createQuerystringModule() {
        const querystring = require('querystring');
        
        return {
            parse: new ivm.Reference(function(str, sep, eq, options) {
                return new ivm.ExternalCopy(querystring.parse(str, sep, eq, options)).copyInto();
            }),
            stringify: new ivm.Reference(function(obj, sep, eq, options) {
                return querystring.stringify(obj, sep, eq, options);
            }),
            escape: new ivm.Reference(function(str) {
                return querystring.escape(str);
            }),
            unescape: new ivm.Reference(function(str) {
                return querystring.unescape(str);
            })
        };
    }
    
    /**
     * Create url module
     */
    static createUrlModule() {
        const { URL, URLSearchParams } = require('url');
        
        return {
            // URL class constructor
            URL: new ivm.Reference(function(input, base) {
                const url = new URL(input, base);
                return new ivm.ExternalCopy({
                    href: url.href,
                    origin: url.origin,
                    protocol: url.protocol,
                    username: url.username,
                    password: url.password,
                    host: url.host,
                    hostname: url.hostname,
                    port: url.port,
                    pathname: url.pathname,
                    search: url.search,
                    hash: url.hash
                }).copyInto();
            }),
            
            // URLSearchParams class constructor
            URLSearchParams: new ivm.Reference(function(init) {
                const paramsId = Math.random().toString(36);
                const params = new URLSearchParams(init);
                
                if (!global.__urlSearchParamsStore) global.__urlSearchParamsStore = new Map();
                global.__urlSearchParamsStore.set(paramsId, params);
                
                return paramsId;
            }),
            
            _urlSearchParams_append: new ivm.Reference((paramsId, name, value) => {
                const params = global.__urlSearchParamsStore?.get(paramsId);
                if (params) params.append(name, value);
            }),
            
            _urlSearchParams_delete: new ivm.Reference((paramsId, name) => {
                const params = global.__urlSearchParamsStore?.get(paramsId);
                if (params) params.delete(name);
            }),
            
            _urlSearchParams_get: new ivm.Reference((paramsId, name) => {
                const params = global.__urlSearchParamsStore?.get(paramsId);
                return params ? params.get(name) : null;
            }),
            
            _urlSearchParams_getAll: new ivm.Reference((paramsId, name) => {
                const params = global.__urlSearchParamsStore?.get(paramsId);
                return params ? params.getAll(name) : [];
            }),
            
            _urlSearchParams_has: new ivm.Reference((paramsId, name) => {
                const params = global.__urlSearchParamsStore?.get(paramsId);
                return params ? params.has(name) : false;
            }),
            
            _urlSearchParams_set: new ivm.Reference((paramsId, name, value) => {
                const params = global.__urlSearchParamsStore?.get(paramsId);
                if (params) params.set(name, value);
            }),
            
            _urlSearchParams_toString: new ivm.Reference((paramsId) => {
                const params = global.__urlSearchParamsStore?.get(paramsId);
                return params ? params.toString() : '';
            })
        };
    }
    
    /**
     * Create util module
     */
    static createUtilModule() {
        const util = require('util');
        
        return {
            // Type checking
            types: {
                isArrayBuffer: new ivm.Reference((value) => util.types.isArrayBuffer(value)),
                isDate: new ivm.Reference((value) => util.types.isDate(value)),
                isMap: new ivm.Reference((value) => util.types.isMap(value)),
                isPromise: new ivm.Reference((value) => util.types.isPromise(value)),
                isRegExp: new ivm.Reference((value) => util.types.isRegExp(value)),
                isSet: new ivm.Reference((value) => util.types.isSet(value)),
                isTypedArray: new ivm.Reference((value) => util.types.isTypedArray(value))
            },
            
            // Formatting
            format: new ivm.Reference(function(...args) {
                return util.format(...args);
            }),
            
            // Inspection
            inspect: new ivm.Reference(function(object, options) {
                return util.inspect(object, options);
            }),
            
            // Promisify (limited support)
            promisify: new ivm.Reference(function(fn) {
                // Return a reference to promisified function
                return new ivm.Reference(util.promisify(fn));
            })
        };
    }
    
    /**
     * Create buffer module
     */
    static createBufferModule() {
        return {
            // Buffer from string
            from: new ivm.Reference(function(data, encoding) {
                return Buffer.from(data, encoding);
            }),
            
            // Buffer allocation
            alloc: new ivm.Reference(function(size, fill, encoding) {
                return Buffer.alloc(size, fill, encoding);
            }),
            
            // Unsafe buffer allocation
            allocUnsafe: new ivm.Reference(function(size) {
                return Buffer.allocUnsafe(size);
            }),
            
            // Concatenation
            concat: new ivm.Reference(function(list, totalLength) {
                return Buffer.concat(list, totalLength);
            }),
            
            // Type check
            isBuffer: new ivm.Reference(function(obj) {
                return Buffer.isBuffer(obj);
            })
        };
    }
    
    /**
     * Create events module (EventEmitter)
     */
    static createEventsModule() {
        const { EventEmitter } = require('events');
        
        return {
            EventEmitter: new ivm.Reference(function() {
                const emitterId = Math.random().toString(36);
                const emitter = new EventEmitter();
                
                if (!global.__eventEmitterStore) global.__eventEmitterStore = new Map();
                global.__eventEmitterStore.set(emitterId, emitter);
                
                return emitterId;
            }),
            
            _eventEmitter_on: new ivm.Reference((emitterId, event, listener) => {
                const emitter = global.__eventEmitterStore?.get(emitterId);
                if (emitter) emitter.on(event, listener);
            }),
            
            _eventEmitter_once: new ivm.Reference((emitterId, event, listener) => {
                const emitter = global.__eventEmitterStore?.get(emitterId);
                if (emitter) emitter.once(event, listener);
            }),
            
            _eventEmitter_emit: new ivm.Reference((emitterId, event, ...args) => {
                const emitter = global.__eventEmitterStore?.get(emitterId);
                return emitter ? emitter.emit(event, ...args) : false;
            }),
            
            _eventEmitter_removeListener: new ivm.Reference((emitterId, event, listener) => {
                const emitter = global.__eventEmitterStore?.get(emitterId);
                if (emitter) emitter.removeListener(event, listener);
            }),
            
            _eventEmitter_removeAllListeners: new ivm.Reference((emitterId, event) => {
                const emitter = global.__eventEmitterStore?.get(emitterId);
                if (emitter) emitter.removeAllListeners(event);
            }),
            
            _eventEmitter_listenerCount: new ivm.Reference((emitterId, event) => {
                const emitter = global.__eventEmitterStore?.get(emitterId);
                return emitter ? emitter.listenerCount(event) : 0;
            })
        };
    }
    
    /**
     * Create string_decoder module
     */
    static createStringDecoderModule() {
        const { StringDecoder } = require('string_decoder');
        
        return {
            StringDecoder: new ivm.Reference(function(encoding) {
                const decoderId = Math.random().toString(36);
                const decoder = new StringDecoder(encoding);
                
                if (!global.__stringDecoderStore) global.__stringDecoderStore = new Map();
                global.__stringDecoderStore.set(decoderId, decoder);
                
                return decoderId;
            }),
            
            _stringDecoder_write: new ivm.Reference((decoderId, buffer) => {
                const decoder = global.__stringDecoderStore?.get(decoderId);
                return decoder ? decoder.write(buffer) : '';
            }),
            
            _stringDecoder_end: new ivm.Reference((decoderId, buffer) => {
                const decoder = global.__stringDecoderStore?.get(decoderId);
                if (decoder) {
                    const result = decoder.end(buffer);
                    global.__stringDecoderStore.delete(decoderId);
                    return result;
                }
                return '';
            })
        };
    }
    
    /**
     * Create zlib module
     */
    static createZlibModule() {
        const zlib = require('zlib');
        
        return {
            // Compression
            gzip: new ivm.Reference(function(buffer, callback) {
                zlib.gzip(buffer, callback);
            }),
            gzipSync: new ivm.Reference(function(buffer, options) {
                return zlib.gzipSync(buffer, options);
            }),
            
            // Decompression
            gunzip: new ivm.Reference(function(buffer, callback) {
                zlib.gunzip(buffer, callback);
            }),
            gunzipSync: new ivm.Reference(function(buffer, options) {
                return zlib.gunzipSync(buffer, options);
            }),
            
            // Deflate
            deflate: new ivm.Reference(function(buffer, callback) {
                zlib.deflate(buffer, callback);
            }),
            deflateSync: new ivm.Reference(function(buffer, options) {
                return zlib.deflateSync(buffer, options);
            }),
            
            // Inflate
            inflate: new ivm.Reference(function(buffer, callback) {
                zlib.inflate(buffer, callback);
            }),
            inflateSync: new ivm.Reference(function(buffer, options) {
                return zlib.inflateSync(buffer, options);
            })
        };
    }
}

module.exports = BuiltinBridge;
