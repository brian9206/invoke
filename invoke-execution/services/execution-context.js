const { VirtualFileSystem } = require('sandbox-fs');
const ivm = require('isolated-vm');
const FSBridge = require('./vfs-bridge');
const BuiltinBridge = require('./builtin-bridge');

/**
 * ExecutionContext - Manages a single function execution
 * Sets up VFS, module loader, fs bridge, and execution environment
 * Uses pre-compiled bootstrap script from isolate pool
 */
class ExecutionContext {
    constructor(isolate, context, packageDir, functionId, packageHash, envVars, compiledScript) {
        this.isolate = isolate;
        this.context = context;
        this.packageDir = packageDir;
        this.functionId = functionId;
        this.packageHash = packageHash;
        this.envVars = this._sanitizeEnvVars(envVars);
        this.compiledScript = compiledScript;
        
        // Create VFS instance
        this.vfs = new VirtualFileSystem({ root: packageDir });
        
        // Create FS bridge
        this.fsBridge = new FSBridge(this.vfs);
        
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
        
        // Run pre-compiled bootstrap script that sets up all globals
        await this.compiledScript.run(this.context);
    }
    
    /**
     * Set up console reference bindings
     * These are called by the pre-compiled bootstrap script
     */
    async _setupConsoleRefs() {
        const self = this;
        
        const consoleLog = new ivm.Reference((...args) => {
            self.logs.push({
                level: 'log',
                message: args.map(arg => String(arg)).join(' '),
                timestamp: Date.now()
            });
        });
        
        const consoleInfo = new ivm.Reference((...args) => {
            self.logs.push({
                level: 'info',
                message: args.map(arg => String(arg)).join(' '),
                timestamp: Date.now()
            });
        });
        
        const consoleWarn = new ivm.Reference((...args) => {
            self.logs.push({
                level: 'warn',
                message: args.map(arg => String(arg)).join(' '),
                timestamp: Date.now()
            });
        });
        
        const consoleError = new ivm.Reference((...args) => {
            self.logs.push({
                level: 'error',
                message: args.map(arg => String(arg)).join(' '),
                timestamp: Date.now()
            });
        });
        
        await this.context.global.set('_consoleLog', consoleLog);
        await this.context.global.set('_consoleInfo', consoleInfo);
        await this.context.global.set('_consoleWarn', consoleWarn);
        await this.context.global.set('_consoleError', consoleError);
    }
    
    /**
     * Set up built-in module references
     * Provides access to whitelisted Node.js core modules
     * Note: This is now handled in _setupFSRefs to combine all modules
     */
    async _setupBuiltinModuleRef() {
        // Get complete fs and path modules from FSBridge
        const fsModule = this.fsBridge.getFSModule();
        const pathModule = this.fsBridge.getPathModule();
        
        // Add fs and path to _builtinModules along with other built-in modules
        await BuiltinBridge.setupAll(this.context, fsModule, pathModule);
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
    }

    /**
     * Set up timer
     */
    async _setupTimers() {
        await this.context.global.set('_sleep', new ivm.Reference((timeoutMs) => {
            return new Promise((resolve) => setTimeout(() => resolve(), timeoutMs));
        }));
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
        
        const resJson = new ivm.Reference((jsonString) => {
            self.response.data = JSON.parse(jsonString);
            self.response.headers['content-type'] = 'application/json';
        });
        
        const resSend = new ivm.Reference((data) => {
            self.response.data = data;
            
            if (!self.response.headers['content-type']) {
                if (typeof data === 'string') {
                    try {
                        JSON.parse(data);
                        self.response.headers['content-type'] = 'application/json';
                    } catch {
                        self.response.headers['content-type'] = 'text/plain';
                    }
                } else {
                    self.response.headers['content-type'] = 'text/plain';
                }
            }
        });
        
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
                const content = vfsFs.readFileSync(filePath, 'utf8');
                
                self.response.headers['content-type'] = contentType;
                self.response.data = content;
                
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
        
        const resEnd = new ivm.Reference((data) => {
            if (data !== undefined) {
                self.response.data = data;
            }
        });
        
        await this.context.global.set('_resStatus', resStatus);
        await this.context.global.set('_resJson', resJson);
        await this.context.global.set('_resSend', resSend);
        await this.context.global.set('_resSendFile', resSendFile);
        await this.context.global.set('_resSetHeader', resSetHeader);
        await this.context.global.set('_resGet', resGet);
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
