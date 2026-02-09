const { VirtualFileSystem } = require('sandbox-fs');
const ivm = require('isolated-vm');
const BuiltinBridge = require('./builtin-bridge');
const NetworkPolicy = require('./network-policy');

/**
 * ExecutionContext - Manages a single function execution
 * Sets up VFS, module loader, fs bridge, and execution environment
 * Uses pre-compiled bootstrap script from isolate pool
 */
class ExecutionContext {
    constructor(isolate, context, packageDir, functionId, packageHash, envVars, compiledScript, projectId, kvStore, networkPolicies) {
        this.isolate = isolate;
        this.context = context;
        this.packageDir = packageDir;
        this.functionId = functionId;
        this.packageHash = packageHash;
        this.envVars = this._sanitizeEnvVars(envVars);
        this.compiledScript = compiledScript;
        this.projectId = projectId;
        this.kvStore = kvStore;
        
        // Initialize network policy enforcement
        // networkPolicies object contains { globalRules, projectRules }
        const globalRules = networkPolicies?.globalRules || [];
        const projectRules = networkPolicies?.projectRules || [];
        this.networkPolicy = new NetworkPolicy(globalRules, projectRules);
        
        // Create VFS instance
        this.vfs = new VirtualFileSystem({});
        this.vfs.mountSync(this.packageDir, '/app');
        
        // Captured logs and response
        this.logs = [];
        this.response = {
            statusCode: 200,
            headers: {},
            data: undefined
        };
    }

    _sanitizeEnvVars(input) {
        const sanitized = {};
        for (const [key, value] of Object.entries(input)) {
            sanitized[String(key)] = String(value);
        }
        return sanitized;
    }
    
    /**
     * Bootstrap the isolate context with globals
     */
    async bootstrap() {
        await this.context.global.set('ivm', ivm);

        // Set up process.env (dynamic, needs to be injected per execution)
        await this._setupProcess();
        
        // Set up timers
        await this._setupTimers();

        // Set up console references (needed for pre-compiled script)
        await this._setupConsoleRefs();

        // Set up built-in module loader reference
        await this._setupBuiltinModuleRef();
        
        // Set up response references (needed for pre-compiled script)
        await this._setupResponseRefs();
        
        // Set up TextEncoder and TextDecoder
        await this._setupTextEncoderDecoder();
        
        // Set up KV store
        await this._setupKVStore();
        
        // Run pre-compiled bootstrap script that sets up all globals
        await this.compiledScript.run(this.context);
    }
    
    /**
     * Set up console reference bindings
     * These are called by the pre-compiled bootstrap script
     */
    async _setupConsoleRefs() {        
        await this.context.global.set('_consoleWrite', new ivm.Reference((data) => {
            this.logs.push({
                level: data.level || 'log',
                message: data.message.map(arg => String(arg)).join(' '),
                timestamp: Date.now()
            });
            
            if (process.env.REDIRECT_OUTPUT === 'true') {
                console[data.level || 'log'](`[Function ${this.functionId}] ${data.message.map(arg => String(arg)).join(' ')}`);
            }
        }));

        await this.context.global.set('_consoleClear', new ivm.Reference(() => {
            this.logs = [];
        }));
    }
    
    /**
     * Console log function that writes to user's function output
     */
    consoleLog(message) {
        this.logs.push({
            level: 'log',
            message: String(message),
            timestamp: Date.now()
        });
    }
    
    /**
     * Set up built-in module references
     * Provides access to whitelisted Node.js core modules
     */
    async _setupBuiltinModuleRef() {
        // Get plain VFS modules directly
        const fsModule = this.vfs.createNodeFSModule();
        const pathModule = this.vfs.createNodePathModule();
        
        // Add fs and path to _builtinModules along with other built-in modules
        // Pass network policy and console logger for network policy enforcement
        await BuiltinBridge.setupAll(
            this.context, 
            fsModule, 
            pathModule, 
            this.networkPolicy, 
            this.consoleLog.bind(this)
        );
    }

    /**
     * Set up process related
     * Must run after pre-compiled script since it overwrites process object
     */
    async _setupProcess() {
        await this.context.global.set('_envVars', this.envVars, { copy: true });
        await this.context.global.set('_arch', process.arch, { copy: true });
        await this.context.global.set('_node_version', process.version, { copy: true });
        await this.context.global.set('_node_versions', process.versions, { copy: true });
        
        // Set HTTP status codes from Node.js http module
        const http = require('http');
        await this.context.global.set('_httpStatusCodes', new ivm.ExternalCopy(http.STATUS_CODES).copyInto());
    }

    /**
     * Set up timer
     */
    async _setupTimers() {
        await this.context.global.set('_sleep', new ivm.Reference((timeoutMs, callback) => {
            setTimeout(() => {
                if (callback) {
                    callback.applyIgnored(undefined, []);
                }
            }, timeoutMs);
        }));
    }

    /**
     * Set up TextEncoder and TextDecoder
     */
    async _setupTextEncoderDecoder() {
        const { TextEncoder: HostTextEncoder, TextDecoder: HostTextDecoder } = require('util');
        
        // Create TextEncoder reference - returns ArrayBuffer via ExternalCopy
        const textEncoderEncode = new ivm.Reference((str) => {
            const encoder = new HostTextEncoder();
            const encoded = encoder.encode(str);
            return new ivm.ExternalCopy(encoded.buffer).copyInto();
        });
        
        // Create TextDecoder reference - receives plain array with copy option
        const textDecoderDecode = new ivm.Reference((arr, encoding = 'utf-8') => {
            const decoder = new HostTextDecoder(encoding);
            return decoder.decode(new Uint8Array(arr));
        }, { arguments: { copy: true } });
        
        await this.context.global.set('_textEncoderEncode', textEncoderEncode);
        await this.context.global.set('_textDecoderDecode', textDecoderDecode);
    }

    /**
     * Set up KV store global object
     * Provides Keyv-compatible interface to user functions
     */
    async _setupKVStore() {
        const self = this;
        
        // Create KV operation references
        const kvGet = new ivm.Reference(async (key) => {
            try {
                const value = await self.kvStore.get(key);
                if (value === undefined || value === null) {
                    return undefined;
                }
                // Return JSON string for safe transfer
                return JSON.stringify(value);
            } catch (error) {
                throw new Error(`KV get error: ${error.message}`);
            }
        });
        
        const kvSet = new ivm.Reference(async (key, jsonStr, ttl) => {
            try {
                // Parse JSON string from VM
                const value = JSON.parse(jsonStr);
                const result = await self.kvStore.set(key, value, ttl);
                return result;
            } catch (error) {
                throw new Error(`KV set error: ${error.message}`);
            }
        });
        
        const kvDelete = new ivm.Reference(async (key) => {
            try {
                return await self.kvStore.delete(key);
            } catch (error) {
                throw new Error(`KV delete error: ${error.message}`);
            }
        });
        
        const kvClear = new ivm.Reference(async () => {
            try {
                await self.kvStore.clear();
                return true;
            } catch (error) {
                throw new Error(`KV clear error: ${error.message}`);
            }
        });
        
        const kvHas = new ivm.Reference(async (key) => {
            try {
                return await self.kvStore.has(key);
            } catch (error) {
                throw new Error(`KV has error: ${error.message}`);
            }
        });
        
        // Set references
        await this.context.global.set('_kvGet', kvGet);
        await this.context.global.set('_kvSet', kvSet);
        await this.context.global.set('_kvDelete', kvDelete);
        await this.context.global.set('_kvClear', kvClear);
        await this.context.global.set('_kvHas', kvHas);
    }

    /**
     * Set up response object reference bindings
     * These are called by the pre-compiled bootstrap script
     */
    async _setupResponseRefs() {
        const self = this;
        
        const resStatus = new ivm.Reference((code) => {
            self.response.statusCode = code;
        });
        
        const resSend = new ivm.Reference((externalCopy) => {
            const hostBuffer = externalCopy.copy();
            self.response.data = Buffer.from(hostBuffer);
            
            // Auto-detect content-type if not set
            if (!self.response.headers['content-type']) {
                try {
                    const asString = self.response.data.toString('utf8');
                    JSON.parse(asString);
                    self.response.headers['content-type'] = 'application/json';
                } catch {
                    self.response.headers['content-type'] = 'text/plain';
                }
            }
        }, { arguments: { copy: true } });
        
        const resSendFile = new ivm.Reference((filePath, options = {}) => {
            try {
                const path = require('path');
                const vfsFs = self.vfs.createNodeFSModule();
                
                const ext = path.extname(filePath).toLowerCase();
                const contentTypes = {
                    '.html': 'text/html', '.htm': 'text/html',
                    '.css': 'text/css', '.js': 'application/javascript',
                    '.json': 'application/json', '.xml': 'application/xml',
                    '.txt': 'text/plain', '.png': 'image/png',
                    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif', '.svg': 'image/svg+xml',
                    '.ico': 'image/x-icon', '.webp': 'image/webp',
                    '.pdf': 'application/pdf', '.zip': 'application/zip',
                    '.woff': 'font/woff', '.woff2': 'font/woff2',
                    '.ttf': 'font/ttf', '.otf': 'font/otf'
                };
                
                const contentType = contentTypes[ext] || 'application/octet-stream';
                
                // Read as buffer (no encoding)
                const buffer = vfsFs.readFileSync(filePath);
                
                self.response.headers['content-type'] = contentType;
                self.response.data = buffer;
                
                if (options.maxAge !== undefined) {
                    self.response.headers['cache-control'] = `public, max-age=${options.maxAge}`;
                }
            } catch (error) {
                throw new Error(`Failed to send file: ${error.message}`);
            }
        });
        
        const resSetHeader = new ivm.Reference((name, value) => {
            self.response.headers[name.toLowerCase()] = value;
        });
        
        const resGet = new ivm.Reference((name) => {
            return self.response.headers[name.toLowerCase()];
        });
        
        const resAppendHeader = new ivm.Reference((name, value) => {
            const lowerName = name.toLowerCase();
            const existing = self.response.headers[lowerName];
            
            if (existing) {
                // For Set-Cookie, allow multiple values as array
                if (lowerName === 'set-cookie') {
                    if (Array.isArray(existing)) {
                        existing.push(value);
                    } else {
                        self.response.headers[lowerName] = [existing, value];
                    }
                } else {
                    // For other headers, concatenate with comma
                    self.response.headers[lowerName] = `${existing}, ${value}`;
                }
            } else {
                self.response.headers[lowerName] = value;
            }
        });
        
        const resRemoveHeader = new ivm.Reference((name) => {
            delete self.response.headers[name.toLowerCase()];
        });
        
        const resEnd = new ivm.Reference((externalCopy) => {
            if (externalCopy !== null && externalCopy !== undefined) {
                // externalCopy is already an ExternalCopy instance due to { externalCopy: true }
                const hostBuffer = externalCopy.copy();
                self.response.data = Buffer.from(hostBuffer);
            }
        });
        
        await this.context.global.set('_resStatus', resStatus);
        await this.context.global.set('_resSend', resSend);
        await this.context.global.set('_resSendFile', resSendFile);
        await this.context.global.set('_resSetHeader', resSetHeader);
        await this.context.global.set('_resGet', resGet);
        await this.context.global.set('_resAppendHeader', resAppendHeader);
        await this.context.global.set('_resRemoveHeader', resRemoveHeader);
        await this.context.global.set('_resEnd', resEnd);
    }
    
    /**
     * Create and transfer request object
     */
    async setupRequest(reqData) {
        // Transfer req data
        await this.context.global.set('_reqData', new ivm.ExternalCopy(reqData).copyInto());
        
        // Create req object using bootstrap helper
        const reqCode = `
            globalThis.req = _createReqObject(_reqData);
        `;
        
        await this.isolate.compileScript(reqCode).then(script => script.run(this.context));
    }

    /**
     * setupResponse is no longer needed
     * Response references are already set up in bootstrap via _setupResponseRefs
     */
    async setupResponse() {
        // References already set up in bootstrap
        // No additional work needed
    }
    
    /**
     * Get captured logs
     */
    getLogs() {
        return this.logs;
    }
    
    /**
     * Get response data
     */
    getResponse() {
        return this.response;
    }
    
    /**
     * Cleanup resources
     */
    cleanup() {
        try {
            // Close VFS
            if (this.vfs && !this.vfs.closed) {
                this.vfs.close();
            }
            
            // Dispose context
            if (this.context) {
                this.context.release();
            }
        } catch (error) {
            console.error('[ExecutionContext] Error during cleanup:', error);
        }
    }
}

module.exports = ExecutionContext;