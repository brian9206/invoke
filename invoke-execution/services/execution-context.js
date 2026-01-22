const { VirtualFileSystem } = require('sandbox-fs');
const ivm = require('isolated-vm');
const ModuleLoader = require('./module-loader');
const FSBridge = require('./fs-bridge');

/**
 * ExecutionContext - Manages a single function execution
 * Sets up VFS, module loader, fs bridge, and execution environment
 */
class ExecutionContext {
    constructor(isolate, context, packageDir, functionId, packageHash, envVars) {
        this.isolate = isolate;
        this.context = context;
        this.packageDir = packageDir;
        this.functionId = functionId;
        this.packageHash = packageHash;
        this.envVars = envVars;
        
        // Create VFS instance
        this.vfs = new VirtualFileSystem({ root: packageDir });
        
        // Create module loader
        this.moduleLoader = new ModuleLoader(
            this.vfs,
            this.isolate,
            this.context,
            this.functionId,
            this.packageHash,
            this.packageDir
        );
        
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
    
    /**
     * Bootstrap the isolate context with globals
     */
    async bootstrap() {
        // Compile and run bootstrap script in this isolate's context
        const bootstrapCode = `
(function() {
    // Helper function to create req object with methods
    globalThis._createReqObject = function(reqData) {
        return {
            ...reqData,
            get(headerName) {
                return this.headers[headerName.toLowerCase()];
            },
            header(headerName) {
                return this.get(headerName);
            },
            is(type) {
                const contentType = this.headers['content-type'] || '';
                return contentType.includes(type);
            },
            accepts(types) {
                const acceptHeader = this.headers['accept'] || '*/*';
                if (typeof types === 'string') {
                    return acceptHeader.includes(types) ? types : false;
                }
                if (Array.isArray(types)) {
                    for (const type of types) {
                        if (acceptHeader.includes(type)) return type;
                    }
                    return false;
                }
                return acceptHeader;
            }
        };
    };
})();
`;
        
        try {
            const bootstrapScript = await this.isolate.compileScript(bootstrapCode);
            await bootstrapScript.run(this.context);
        } catch (error) {
            throw new Error(`Failed to bootstrap context: ${error.message}`);
        }
        
        // Set up console
        await this._setupConsole();
        
        // Set up Buffer
        await this._setupBuffer();
        
        // Set up timers
        await this._setupTimers();
        
        // Set up process.env
        await this._setupProcessEnv();
        
        // Set up require (module loader)
        await this._setupRequire();
    }
    
    /**
     * Set up console logging
     */
    async _setupConsole() {
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
        
        // Create console object in isolate
        const consoleCode = `
            globalThis.console = {
                log: (...args) => _consoleLog.applySync(undefined, args),
                info: (...args) => _consoleInfo.applySync(undefined, args),
                warn: (...args) => _consoleWarn.applySync(undefined, args),
                error: (...args) => _consoleError.applySync(undefined, args)
            };
        `;
        
        await this.context.global.set('_consoleLog', consoleLog);
        await this.context.global.set('_consoleInfo', consoleInfo);
        await this.context.global.set('_consoleWarn', consoleWarn);
        await this.context.global.set('_consoleError', consoleError);
        
        await this.isolate.compileScript(consoleCode).then(script => script.run(this.context));
    }
    
    /**
     * Set up Buffer
     */
    async _setupBuffer() {
        // Transfer Buffer class
        const bufferCode = `
            globalThis.Buffer = (function() {
                // Simple Buffer implementation for isolate
                // For now, just expose the basic functionality
                return {
                    from: (data, encoding) => {
                        if (typeof data === 'string') {
                            return new TextEncoder().encode(data);
                        }
                        return data;
                    },
                    alloc: (size) => new Uint8Array(size),
                    isBuffer: (obj) => obj instanceof Uint8Array
                };
            })();
        `;
        
        await this.isolate.compileScript(bufferCode).then(script => script.run(this.context));
    }
    
    /**
     * Set up timers (disabled for security/simplicity)
     */
    async _setupTimers() {
        // Timers are not supported in the sandbox for security reasons
        // User functions should execute synchronously and return immediately
        const notSupported = new ivm.Reference(() => {
            throw new Error('Timers (setTimeout/setInterval) are not supported in sandbox. Functions should execute synchronously.');
        });
        
        await this.context.global.set('setTimeout', notSupported);
        await this.context.global.set('setInterval', notSupported);
        await this.context.global.set('clearTimeout', notSupported);
        await this.context.global.set('clearInterval', notSupported);
    }
    
    /**
     * Set up process.env
     */
    async _setupProcessEnv() {
        const processCode = `
            globalThis.process = {
                env: _envVars
            };
        `;
        
        await this.context.global.set('_envVars', new ivm.ExternalCopy(this.envVars).copyInto());
        await this.isolate.compileScript(processCode).then(script => script.run(this.context));
    }
    
    /**
     * Set up require function
     */
    async _setupRequire() {
        const self = this;
        const vfs = this.vfs;
        const nodePath = require('path');
        
        // Create fs and path module References
        const vfsFs = vfs.createNodeFSModule();
        
        // Create fs module with References
        const fsReadFileSync = new ivm.Reference((path, encoding) => vfsFs.readFileSync(path, encoding || 'utf8'));
        const fsReaddirSync = new ivm.Reference((path) => vfsFs.readdirSync(path));
        const fsStatSync = new ivm.Reference((path) => {
            const stats = vfsFs.statSync(path);
            return JSON.stringify({
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                size: stats.size,
                mtime: stats.mtime,
                ctime: stats.ctime
            });
        });
        const fsExistsSync = new ivm.Reference((path) => vfsFs.existsSync(path));
        
        // Create path module References
        const pathNormalize = new ivm.Reference((p) => nodePath.posix.normalize(p));
        const pathJoin = new ivm.Reference((...args) => nodePath.posix.join(...args));
        const pathResolve = new ivm.Reference((...args) => nodePath.posix.resolve(...args));
        const pathDirname = new ivm.Reference((p) => nodePath.posix.dirname(p));
        const pathBasename = new ivm.Reference((p, ext) => nodePath.posix.basename(p, ext));
        const pathExtname = new ivm.Reference((p) => nodePath.posix.extname(p));
        const pathIsAbsolute = new ivm.Reference((p) => nodePath.posix.isAbsolute(p));
        const pathRelative = new ivm.Reference((from, to) => nodePath.posix.relative(from, to));
        
        // Set all References on global
        await this.context.global.set('_fs_readFileSync', fsReadFileSync);
        await this.context.global.set('_fs_readdirSync', fsReaddirSync);
        await this.context.global.set('_fs_statSync', fsStatSync);
        await this.context.global.set('_fs_existsSync', fsExistsSync);
        
        await this.context.global.set('_path_normalize', pathNormalize);
        await this.context.global.set('_path_join', pathJoin);
        await this.context.global.set('_path_resolve', pathResolve);
        await this.context.global.set('_path_dirname', pathDirname);
        await this.context.global.set('_path_basename', pathBasename);
        await this.context.global.set('_path_extname', pathExtname);
        await this.context.global.set('_path_isAbsolute', pathIsAbsolute);
        await this.context.global.set('_path_relative', pathRelative);
        
        // Create require function that returns fs and path modules
        const requireCode = `
            globalThis.require = function(moduleName) {
                if (moduleName === 'fs') {
                    return {
                        readFileSync: function(path, encoding) { 
                            return _fs_readFileSync.applySync(undefined, [path, encoding]); 
                        },
                        readdirSync: function(path) { 
                            return _fs_readdirSync.applySync(undefined, [path]); 
                        },
                        statSync: function(path) { 
                            const statsJson = _fs_statSync.applySync(undefined, [path]);
                            const stats = JSON.parse(statsJson);
                            stats.isFile = () => stats.isFile;
                            stats.isDirectory = () => stats.isDirectory;
                            return stats;
                        },
                        existsSync: function(path) { 
                            return _fs_existsSync.applySync(undefined, [path]); 
                        }
                    };
                }
                
                if (moduleName === 'path') {
                    return {
                        sep: '/',
                        delimiter: ':',
                        normalize: function(p) { return _path_normalize.applySync(undefined, [p]); },
                        join: function(...args) { return _path_join.applySync(undefined, args); },
                        resolve: function(...args) { return _path_resolve.applySync(undefined, args); },
                        dirname: function(p) { return _path_dirname.applySync(undefined, [p]); },
                        basename: function(p, ext) { return _path_basename.applySync(undefined, [p, ext]); },
                        extname: function(p) { return _path_extname.applySync(undefined, [p]); },
                        isAbsolute: function(p) { return _path_isAbsolute.applySync(undefined, [p]); },
                        relative: function(from, to) { return _path_relative.applySync(undefined, [from, to]); }
                    };
                }
                
                // Handle relative requires
                if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
                    throw new Error('Relative module requires are not yet supported in this implementation');
                }
                
                // Handle built-in modules that should use host versions
                if (moduleName === 'util' || moduleName === 'buffer') {
                    throw new Error(\`Module '\${moduleName}' should be accessed via global objects\`);
                }
                
                // Block all other requires
                throw new Error(\`Module '\${moduleName}' is not available in sandbox environment. Available: fs, path\`);
            };
        `;
        
        await this.isolate.compileScript(requireCode).then(script => script.run(this.context));
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
     * Create and transfer response object
     */
    async setupResponse() {
        const self = this;
        
        // Create response capture methods that don't return objects
        const resStatus = new ivm.Reference((code) => {
            self.response.statusCode = code;
        });
        
        const resJson = new ivm.Reference((jsonString) => {
            // Store as parsed object for compatibility
            self.response.data = JSON.parse(jsonString);
            self.response.headers['content-type'] = 'application/json';
        });
        
        const resSend = new ivm.Reference((data) => {
            // Store data as-is (already stringified if it was an object)
            self.response.data = data;
            
            // Only set content-type if not already set by user
            if (!self.response.headers['content-type']) {
                // Try to detect if it's JSON
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
                
                // Determine content type from extension
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
        
        // Create res object in isolate
        const resCode = `
            globalThis.res = {
                status(code) {
                    _resStatus.applySync(undefined, [code]);
                    return this;
                },
                json(data) {
                    // Serialize to JSON string before passing across boundary
                    const jsonString = JSON.stringify(data);
                    _resJson.applySync(undefined, [jsonString]);
                    return this;
                },
                send(data) {
                    // Send data as-is (string) or stringify if object
                    // Don't auto-detect content type - let user set it explicitly or leave as-is
                    let sendData;
                    if (typeof data === 'string') {
                        sendData = data;
                    } else if (typeof data === 'object') {
                        sendData = JSON.stringify(data);
                    } else {
                        sendData = String(data);
                    }
                    _resSend.applySync(undefined, [sendData]);
                    return this;
                },
                sendFile(filePath, options) {
                    _resSendFile.applySync(undefined, [filePath, options || {}]);
                    return this;
                },
                setHeader(name, value) {
                    _resSetHeader.applySync(undefined, [String(name), String(value)]);
                    return this;
                },
                set(name, value) {
                    return this.setHeader(name, value);
                },
                get(name) {
                    return _resGet.applySync(undefined, [String(name)]);
                },
                end(data) {
                    if (data !== undefined) {
                        const endData = typeof data === 'object' ? JSON.stringify(data) : String(data);
                        _resEnd.applySync(undefined, [endData]);
                    }
                    return this;
                }
            };
        `;
        
        await this.context.global.set('_resStatus', resStatus);
        await this.context.global.set('_resJson', resJson);
        await this.context.global.set('_resSend', resSend);
        await this.context.global.set('_resSendFile', resSendFile);
        await this.context.global.set('_resSetHeader', resSetHeader);
        await this.context.global.set('_resGet', resGet);
        await this.context.global.set('_resEnd', resEnd);
        
        await this.isolate.compileScript(resCode).then(script => script.run(this.context));
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
            
            // Clear module cache
            if (this.moduleLoader) {
                this.moduleLoader.executionCache.clear();
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
