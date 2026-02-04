const ivm = require('isolated-vm');
const mime = require('mime-types');
const net = require('net');
const crypto = require('crypto');
const zlib = require('zlib');
const tls = require('tls');
const dns = require('dns');

/**
 * Builtin module bridge for isolated-vm context
 * Provides access to Node.js core modules within the VM
 * 
 * Architecture: Uses flattened globals with naming convention _moduleName_methodName
 * This allows the VM to reconstruct module objects generically without hardcoded structure
 */
class BuiltinBridge {    
    /**
     * Set up all built-in module references in the VM context
     * @param {ivm.Context} context - The isolated-vm context
     * @param {Object} fsModule - The fs module object with ivm.Reference methods
     * @param {Object} pathModule - The path module object with ivm.Reference methods
     */
    static async setupAll(context, fsModule, pathModule) {
        this.setupFS(context, fsModule);
        this.setupPath(context, pathModule);
        this.setupMimeTypes(context);
        this.setupCrypto(context);
        this.setupZlib(context);
        this.setupNet(context);
        this.setupTLS(context);
        this.setupDNS(context);
    }
    
    /**
     * Setup fs module (from VFS)
     */
    static setupFS(context, fsModule) {
        function convertErrorObject(value) {
            if (!value || typeof value.message !== 'string') {
                return value;
            }

            return new Error('__FS_ERROR__:' + JSON.stringify(value));
        }

        // Sync methods
        context.global.setSync('_fs_readFileSync', new ivm.Reference((path, encoding) => {
            try {
                if (encoding === null || encoding === undefined) {
                    const buffer = fsModule.readFileSync(path);
                    return BuiltinBridge._bufferToArrayBuffer(buffer);
                }
                return fsModule.readFileSync(path, encoding);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_writeFileSync', new ivm.Reference((path, data, encoding) => {
            try {
                // Convert ArrayBuffer from VM to Buffer if needed
                if (data instanceof ArrayBuffer) {
                    data = BuiltinBridge._arrayBufferToBuffer(data);
                }
                return fsModule.writeFileSync(path, data, encoding);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_appendFileSync', new ivm.Reference((path, data, encoding) => {
            try {
                if (data instanceof ArrayBuffer) {
                    data = BuiltinBridge._arrayBufferToBuffer(data);
                }
                return fsModule.appendFileSync(path, data, encoding);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_statSync', new ivm.Reference((path) => {
            try {
                const stats = fsModule.statSync(path);
                return BuiltinBridge._serializeStats(stats);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_readdirSync', new ivm.Reference((path, options) => {
            try {
                return fsModule.readdirSync(path, options);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_existsSync', new ivm.Reference((path) => {
            try {
                return fsModule.existsSync(path);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_accessSync', new ivm.Reference((path, mode) => {
            try {
                return fsModule.accessSync(path, mode);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_mkdirSync', new ivm.Reference((path, options) => {
            try {
                return fsModule.mkdirSync(path, options);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_unlinkSync', new ivm.Reference((path) => {
            try {
                return fsModule.unlinkSync(path);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_rmdirSync', new ivm.Reference((path, options) => {
            try {
                return fsModule.rmdirSync(path, options);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_renameSync', new ivm.Reference((oldPath, newPath) => {
            try {
                return fsModule.renameSync(oldPath, newPath);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_copyFileSync', new ivm.Reference((src, dest, flags) => {
            try {
                return fsModule.copyFileSync(src, dest, flags);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_chmodSync', new ivm.Reference((path, mode) => {
            try {
                return fsModule.chmodSync(path, mode);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_chownSync', new ivm.Reference((path, uid, gid) => {
            try {
                return fsModule.chownSync(path, uid, gid);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_openSync', new ivm.Reference((path, flags, mode) => {
            try {
                return fsModule.openSync(path, flags, mode);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_closeSync', new ivm.Reference((fd) => {
            try {
                return fsModule.closeSync(fd);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_readSync', new ivm.Reference((fd, buffer, offset, length, position) => {
            try {
                // Convert ArrayBuffer from VM to Buffer
                if (buffer instanceof ArrayBuffer) {
                    buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
                }
                const bytesRead = fsModule.readSync(fd, buffer, offset, length, position);
                // Return both bytesRead and filled buffer as ArrayBuffer
                return new ivm.ExternalCopy({ bytesRead, buffer: BuiltinBridge._bufferToArrayBuffer(buffer) }).copyInto();
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_writeSync', new ivm.Reference((fd, buffer, offset, length, position) => {
            try {
                // Convert ArrayBuffer from VM to Buffer
                if (buffer instanceof ArrayBuffer) {
                    buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
                }
                return fsModule.writeSync(fd, buffer, offset, length, position);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_truncateSync', new ivm.Reference((path, len) => {
            try {
                return fsModule.truncateSync(path, len);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_ftruncateSync', new ivm.Reference((fd, len) => {
            try {
                return fsModule.ftruncateSync(fd, len);
            }
            catch (err) {
                throw convertErrorObject(err);
            }
        }));

        // Async callback methods
        context.global.setSync('_fs_readFile', new ivm.Reference((path, encodingOrCallback, callback) => {
            const actualCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
            const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
            
            fsModule.readFile(path, encoding, (err, data) => {
                if (!err && !encoding && Buffer.isBuffer(data)) {
                    data = BuiltinBridge._bufferToArrayBuffer(data);
                }
                actualCallback.applySync(undefined, [convertErrorObject(err), data], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_writeFile', new ivm.Reference((path, data, encodingOrCallback, callback) => {
            const actualCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
            const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
            
            if (data instanceof ArrayBuffer) {
                data = BuiltinBridge._arrayBufferToBuffer(data);
            }
            
            fsModule.writeFile(path, data, encoding, (err) => {
                actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_appendFile', new ivm.Reference((path, data, encodingOrCallback, callback) => {
            const actualCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
            const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
            
            if (data instanceof ArrayBuffer) {
                data = BuiltinBridge._arrayBufferToBuffer(data);
            }
            
            fsModule.appendFile(path, data, encoding, (err) => {
                actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_stat', new ivm.Reference((path, callback) => {
            fsModule.stat(path, (err, stats) => {
                const serializedStats = stats ? BuiltinBridge._serializeStats(stats) : null;
                callback.applySync(undefined, [convertErrorObject(err), serializedStats], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_readdir', new ivm.Reference((path, optionsOrCallback, callback) => {
            const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
            const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;
            
            fsModule.readdir(path, options, (err, files) => {
                actualCallback.applySync(undefined, [convertErrorObject(err), files], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_access', new ivm.Reference((path, modeOrCallback, callback) => {
            const actualCallback = typeof modeOrCallback === 'function' ? modeOrCallback : callback;
            const mode = typeof modeOrCallback === 'number' ? modeOrCallback : undefined;
            
            fsModule.access(path, mode, (err) => {
                actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_mkdir', new ivm.Reference((path, optionsOrCallback, callback) => {
            const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
            const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;
            
            fsModule.mkdir(path, options, (err) => {
                actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_unlink', new ivm.Reference((path, callback) => {
            fsModule.unlink(path, (err) => {
                callback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_rmdir', new ivm.Reference((path, optionsOrCallback, callback) => {
            const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
            const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;
            
            fsModule.rmdir(path, options, (err) => {
                actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_rename', new ivm.Reference((oldPath, newPath, callback) => {
            fsModule.rename(oldPath, newPath, (err) => {
                callback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_copyFile', new ivm.Reference((src, dest, flagsOrCallback, callback) => {
            const actualCallback = typeof flagsOrCallback === 'function' ? flagsOrCallback : callback;
            const flags = typeof flagsOrCallback === 'number' ? flagsOrCallback : undefined;
            
            fsModule.copyFile(src, dest, flags, (err) => {
                actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_chmod', new ivm.Reference((path, mode, callback) => {
            fsModule.chmod(path, mode, (err) => {
                callback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_chown', new ivm.Reference((path, uid, gid, callback) => {
            fsModule.chown(path, uid, gid, (err) => {
                callback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_open', new ivm.Reference((path, flags, modeOrCallback, callback) => {
            const actualCallback = typeof modeOrCallback === 'function' ? modeOrCallback : callback;
            const mode = typeof modeOrCallback === 'number' ? modeOrCallback : undefined;
            
            fsModule.open(path, flags, mode, (err, fd) => {
                actualCallback.applySync(undefined, [convertErrorObject(err), fd], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_close', new ivm.Reference((fd, callback) => {
            fsModule.close(fd, (err) => {
                callback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_read', new ivm.Reference((fd, buffer, offset, length, position, callback) => {
            if (buffer instanceof ArrayBuffer) {
                buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
            }
            
            fsModule.read(fd, buffer, offset, length, position, (err, bytesRead) => {
                const bufferArrayBuffer = BuiltinBridge._bufferToArrayBuffer(buffer);
                callback.applySync(undefined, [convertErrorObject(err), bytesRead, bufferArrayBuffer], { arguments: { copy: true } });
            });
        }));

        context.global.setSync('_fs_write', new ivm.Reference((fd, buffer, offsetOrCallback, lengthOrCallback, positionOrCallback, callback) => {
            let actualCallback, offset, length, position;
            
            if (typeof offsetOrCallback === 'function') {
                actualCallback = offsetOrCallback;
            } else if (typeof lengthOrCallback === 'function') {
                actualCallback = lengthOrCallback;
                offset = offsetOrCallback;
            } else if (typeof positionOrCallback === 'function') {
                actualCallback = positionOrCallback;
                offset = offsetOrCallback;
                length = lengthOrCallback;
            } else {
                actualCallback = callback;
                offset = offsetOrCallback;
                length = lengthOrCallback;
                position = positionOrCallback;
            }
            
            if (buffer instanceof ArrayBuffer) {
                buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
            }
            
            fsModule.write(fd, buffer, offset, length, position, (err, bytesWritten) => {
                actualCallback.applySync(undefined, [convertErrorObject(err), bytesWritten], { arguments: { copy: true } });
            });
        }));

        // Stream methods (throw errors)
        context.global.setSync('_fs_createReadStream', new ivm.Reference((path, options) => {
            throw new Error('fs.createReadStream() is not supported in isolated environment');
        }));

        context.global.setSync('_fs_createWriteStream', new ivm.Reference((path, options) => {
            throw new Error('fs.createWriteStream() is not supported in isolated environment');
        }));

        // Setup fs.promises API - direct globals pattern
        context.global.setSync('_fs_promises_readFile', new ivm.Reference(async (path, encoding) => {
            try {
                if (encoding === null || encoding === undefined) {
                    const buffer = await fsModule.promises.readFile(path);
                    return BuiltinBridge._bufferToArrayBuffer(buffer);
                }
                return await fsModule.promises.readFile(path, encoding);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_writeFile', new ivm.Reference(async (path, data, encoding) => {
            try {
                if (data instanceof ArrayBuffer) {
                    data = BuiltinBridge._arrayBufferToBuffer(data);
                }
                return await fsModule.promises.writeFile(path, data, encoding);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_appendFile', new ivm.Reference(async (path, data, encoding) => {
            try {
                if (data instanceof ArrayBuffer) {
                    data = BuiltinBridge._arrayBufferToBuffer(data);
                }
                return await fsModule.promises.appendFile(path, data, encoding);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_stat', new ivm.Reference(async (path) => {
            try {
                const stats = await fsModule.promises.stat(path);
                return BuiltinBridge._serializeStats(stats);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_readdir', new ivm.Reference(async (path, options) => {
            try {
                return await fsModule.promises.readdir(path, options);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_access', new ivm.Reference(async (path, mode) => {
            try {
                return await fsModule.promises.access(path, mode);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_mkdir', new ivm.Reference(async (path, options) => {
            try {
                return await fsModule.promises.mkdir(path, options);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_unlink', new ivm.Reference(async (path) => {
            try {
                return await fsModule.promises.unlink(path);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_rmdir', new ivm.Reference(async (path, options) => {
            try {
                return await fsModule.promises.rmdir(path, options);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_rename', new ivm.Reference(async (oldPath, newPath) => {
            try {
                return await fsModule.promises.rename(oldPath, newPath);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_copyFile', new ivm.Reference(async (src, dest, flags) => {
            try {
                return await fsModule.promises.copyFile(src, dest, flags);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_chmod', new ivm.Reference(async (path, mode) => {
            try {
                return await fsModule.promises.chmod(path, mode);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        context.global.setSync('_fs_promises_chown', new ivm.Reference(async (path, uid, gid) => {
            try {
                return await fsModule.promises.chown(path, uid, gid);
            } catch (err) {
                throw convertErrorObject(err);
            }
        }));

        // Set fs.constants
        context.global.set('_fs_constants', fsModule.constants, { copy: true });
    }
    
    /**
     * Setup path module (from VFS)
     */
    static setupPath(context, pathModule) {
        // Expose sep and delimiter as direct values
        context.global.set('_path_sep', pathModule.sep);
        context.global.set('_path_delimiter', pathModule.delimiter);
        
        context.global.setSync('_path_normalize', new ivm.Reference((p) => pathModule.normalize(p)));
        context.global.setSync('_path_join', new ivm.Reference((...args) => pathModule.join(...args)));
        context.global.setSync('_path_resolve', new ivm.Reference((...args) => pathModule.resolve(...args)));
        context.global.setSync('_path_dirname', new ivm.Reference((p) => pathModule.dirname(p)));
        context.global.setSync('_path_basename', new ivm.Reference((p, ext) => pathModule.basename(p, ext)));
        context.global.setSync('_path_extname', new ivm.Reference((p) => pathModule.extname(p)));
        context.global.setSync('_path_isAbsolute', new ivm.Reference((p) => pathModule.isAbsolute(p)));
        context.global.setSync('_path_relative', new ivm.Reference((from, to) => pathModule.relative(from, to)));
        context.global.setSync('_path_parse', new ivm.Reference((p) => {
            const result = pathModule.parse(p);
            return new ivm.ExternalCopy(result).copyInto();
        }));
        context.global.setSync('_path_format', new ivm.Reference((obj) => pathModule.format(obj)));
    }

    /**
     * Setup mime-types module
     */
    static setupMimeTypes(context) {
        context.global.setSync('_mime_types_lookup', new ivm.Reference((...args) => mime.lookup(...args)));
        context.global.setSync('_mime_types_contentType', new ivm.Reference((...args) => mime.contentType(...args)));
        context.global.setSync('_mime_types_extension', new ivm.Reference((...args) => mime.extension(...args)));
        context.global.setSync('_mime_types_charset', new ivm.Reference((...args) => mime.charset(...args)));
        context.global.setSync('_mime_types_types', new ivm.Reference((arg) => mime.types[arg]));
        context.global.setSync('_mime_types_extensions', new ivm.Reference((arg) => mime.extensions[arg]));
    }
    
    /**
     * Setup crypto module
     */
    static setupNet(context) {
        
        // Map to store socket instances using handle-based state management
        const netHandles = new Map();
        let handleCounter = 0;
        
        // Helper: Create a unique handle for socket objects
        function createHandle(obj) {
            const handleId = ++handleCounter;
            netHandles.set(handleId, obj);
            return handleId;
        }
        
        // Helper: Get object from handle
        function getHandle(handleId) {
            const obj = netHandles.get(handleId);
            if (!obj) {
                throw new Error('Invalid net handle');
            }
            return obj;
        }
        
        // Helper: Remove handle when socket closes
        function removeHandle(handleId) {
            netHandles.delete(handleId);
        }
        
        // net.Socket() - Create an unconnected socket
        context.global.setSync('_net_createSocket', new ivm.Reference(() => {
            const socket = new net.Socket();
            const handleId = createHandle(socket);
            
            // Auto-remove handle when socket closes
            socket.once('close', () => {
                removeHandle(handleId);
            });
            
            return handleId;
        }));
        
        // net.createConnection(port, host, connectCallback)
        context.global.setSync('_net_createConnection', new ivm.Reference((port, host, connectCallback) => {
            // If port is not provided, create an unconnected socket
            let socket;
            if (port === undefined || port === null) {
                socket = new net.Socket();
            } else {
                // Create socket and initiate connection
                socket = new net.Socket();
                
                // Set a connection timeout to prevent hanging
                const connectionTimeout = setTimeout(() => {
                    if (!socket.connecting && socket.readyState !== 'open') {
                        const timeoutError = {
                            message: 'Connection timeout',
                            code: 'ETIMEDOUT',
                            errno: -110,
                            syscall: 'connect'
                        };
                        socket.destroy();
                        if (connectCallback) {
                            connectCallback.applyIgnored(undefined, [timeoutError]);
                        }
                    }
                }, 10000); // 10 second timeout
                
                // Setup connection
                socket.connect(port, host, () => {
                    clearTimeout(connectionTimeout);
                    if (connectCallback) {
                        connectCallback.applyIgnored(undefined, [null]);
                    }
                });
                
                socket.once('error', (err) => {
                    clearTimeout(connectionTimeout);
                    const errorObj = {
                        message: err instanceof Error ? err.message : String(err),
                        code: err.code || 'ECONNREFUSED',
                        errno: err.errno,
                        syscall: err.syscall
                    };
                    if (connectCallback) {
                        connectCallback.applyIgnored(undefined, [errorObj]);
                    }
                    removeHandle(handleId);
                });
            }
            
            const handleId = createHandle(socket);
            
            // Auto-remove handle when socket closes
            socket.once('close', () => {
                removeHandle(handleId);
            });
            
            return handleId;
        }));
        
        // socket.write(data, callback)
        context.global.setSync('_net_socketWrite', new ivm.Reference((handleId, data, callback) => {
            const socket = getHandle(handleId);
            
            // Convert ArrayBuffer to Buffer if needed
            if (data instanceof ArrayBuffer) {
                data = BuiltinBridge._arrayBufferToBuffer(data);
            }
            
            try {
                return socket.write(data, (err) => {
                    if (callback) {
                        callback.applyIgnored(undefined, [err]);
                    }
                });
            } catch (err) {
                throw err;
            }
        }));
        
        // socket.read(size)
        context.global.setSync('_net_socketRead', new ivm.Reference((handleId, size) => {
            const socket = getHandle(handleId);
            const data = socket.read(size);
            
            if (data && Buffer.isBuffer(data)) {
                return BuiltinBridge._bufferToArrayBuffer(data);
            }
            return data;
        }));
        
        // socket.destroy()
        context.global.setSync('_net_socketDestroy', new ivm.Reference((handleId) => {
            const socket = getHandle(handleId);
            socket.destroy();
            removeHandle(handleId);
        }));
        
        // socket.connect(port, host, connectCallback)
        context.global.setSync('_net_socketConnect', new ivm.Reference((handleId, port, host, connectCallback) => {
            const socket = getHandle(handleId);
            
            // Setup listeners for socket events
            if (connectCallback) {
                socket.once('connect', () => {
                    connectCallback.applyIgnored(undefined, [null]);
                });
                
                socket.once('error', (err) => {
                    const errorObj = {
                        message: err instanceof Error ? err.message : String(err),
                        code: err.code || 'ECONNREFUSED',
                        errno: err.errno,
                        syscall: err.syscall
                    };
                    connectCallback.applyIgnored(undefined, [errorObj]);
                });
            }
            
            socket.connect(port, host);
        }));
        
        // socket.end()
        context.global.setSync('_net_socketEnd', new ivm.Reference((handleId, callback) => {
            const socket = getHandle(handleId);
            
            if (callback) {
                socket.end((err) => {
                    callback.applyIgnored(undefined, [err]);
                });
            } else {
                socket.end();
            }
        }));
        
        // socket.pause()
        context.global.setSync('_net_socketPause', new ivm.Reference((handleId) => {
            const socket = getHandle(handleId);
            socket.pause();
        }));
        
        // socket.resume()
        context.global.setSync('_net_socketResume', new ivm.Reference((handleId) => {
            const socket = getHandle(handleId);
            socket.resume();
        }));
        
        // socket.setTimeout(timeout, callback)
        context.global.setSync('_net_socketSetTimeout', new ivm.Reference((handleId, timeout, callback) => {
            const socket = getHandle(handleId);
            
            if (callback) {
                socket.setTimeout(timeout, () => {
                    callback.applyIgnored(undefined, []);
                });
            } else {
                socket.setTimeout(timeout);
            }
        }));
        
        // socket.setNoDelay(noDelay)
        context.global.setSync('_net_socketSetNoDelay', new ivm.Reference((handleId, noDelay) => {
            const socket = getHandle(handleId);
            socket.setNoDelay(noDelay);
        }));
        
        // socket.setKeepAlive(enable, initialDelay)
        context.global.setSync('_net_socketSetKeepAlive', new ivm.Reference((handleId, enable, initialDelay) => {
            const socket = getHandle(handleId);
            socket.setKeepAlive(enable, initialDelay);
        }));
        
        // socket.localAddress getter
        context.global.setSync('_net_socketGetLocalAddress', new ivm.Reference((handleId) => {
            const socket = getHandle(handleId);
            return socket.localAddress;
        }));
        
        // socket.localPort getter
        context.global.setSync('_net_socketGetLocalPort', new ivm.Reference((handleId) => {
            const socket = getHandle(handleId);
            return socket.localPort;
        }));
        
        // socket.remoteAddress getter
        context.global.setSync('_net_socketGetRemoteAddress', new ivm.Reference((handleId) => {
            const socket = getHandle(handleId);
            return socket.remoteAddress;
        }));
        
        // socket.remotePort getter
        context.global.setSync('_net_socketGetRemotePort', new ivm.Reference((handleId) => {
            const socket = getHandle(handleId);
            return socket.remotePort;
        }));
        
        // socket.remoteFamily getter
        context.global.setSync('_net_socketGetRemoteFamily', new ivm.Reference((handleId) => {
            const socket = getHandle(handleId);
            return socket.remoteFamily;
        }));
        
        // socket.bytesRead getter
        context.global.setSync('_net_socketGetBytesRead', new ivm.Reference((handleId) => {
            const socket = getHandle(handleId);
            return socket.bytesRead;
        }));
        
        // socket.bytesWritten getter
        context.global.setSync('_net_socketGetBytesWritten', new ivm.Reference((handleId) => {
            const socket = getHandle(handleId);
            return socket.bytesWritten;
        }));
        
        // socket.readyState getter
        context.global.setSync('_net_socketGetReadyState', new ivm.Reference((handleId) => {
            const socket = getHandle(handleId);
            return socket.readyState;
        }));
        
        // socket.on(event, listener) - for setting up event listeners
        context.global.setSync('_net_socketOn', new ivm.Reference((handleId, event, listener) => {
            const socket = getHandle(handleId);
            
            socket.on(event, function(...args) {
                try {
                    // For 'data' events, convert Buffer using ivm.ExternalCopy (same as fs module)
                    if (event === 'data' && args.length > 0 && Buffer.isBuffer(args[0])) {
                        const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(args[0]);
                        listener.applySync(undefined, [arrayBuffer], { arguments: { copy: true } });
                    } else if (event === 'error' && args.length > 0) {
                        // For error events, use the same pattern as fs module
                        const error = args[0];
                        const errorObj = {
                            message: error instanceof Error ? error.message : String(error),
                            code: typeof error.code === 'string' || typeof error.code === 'number' ? error.code : 'UNKNOWN_ERROR',
                            errno: typeof error.errno === 'string' || typeof error.errno === 'number' ? error.errno : undefined,
                            syscall: typeof error.syscall === 'string' ? error.syscall : undefined
                        };
                        // Remove undefined properties
                        Object.keys(errorObj).forEach(key => {
                            if (errorObj[key] === undefined) {
                                delete errorObj[key];
                            }
                        });
                        // Use fs module pattern: create Error with JSON serialized data
                        const transferableError = new Error('__NET_ERROR__:' + JSON.stringify(errorObj));
                        listener.applySync(undefined, [transferableError], { arguments: { copy: true } });
                    } else {
                        // For other events, sanitize args to ensure transferability
                        const safeArgs = args.map(arg => {
                            if (arg === null || arg === undefined) return arg;
                            if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') return arg;
                            if (Buffer.isBuffer(arg)) return BuiltinBridge._bufferToArrayBuffer(arg);
                            // For objects, create a plain object copy
                            if (typeof arg === 'object') {
                                try {
                                    return JSON.parse(JSON.stringify(arg));
                                } catch (e) {
                                    return String(arg);
                                }
                            }
                            return String(arg);
                        });
                        listener.applySync(undefined, safeArgs, { arguments: { copy: true } });
                    }
                } catch (err) {
                    // Event listener errors should not crash
                    console.error('Error in socket event listener for', event, ':', err);
                }
            });
        }));
        
        // socket.once(event, listener)
        context.global.setSync('_net_socketOnce', new ivm.Reference((handleId, event, listener) => {
            const socket = getHandle(handleId);
            
            socket.once(event, function(...args) {
                try {
                    // Same handling as 'on' for event-specific data conversion
                    if (event === 'data' && args.length > 0 && Buffer.isBuffer(args[0])) {
                        const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(args[0]);
                        listener.applySync(undefined, [arrayBuffer], { arguments: { copy: true } });
                    } else if (event === 'error' && args.length > 0) {
                        // For error events, use the same pattern as fs module
                        const error = args[0];
                        const errorObj = {
                            message: error instanceof Error ? error.message : String(error),
                            code: typeof error.code === 'string' || typeof error.code === 'number' ? error.code : 'UNKNOWN_ERROR',
                            errno: typeof error.errno === 'string' || typeof error.errno === 'number' ? error.errno : undefined,
                            syscall: typeof error.syscall === 'string' ? error.syscall : undefined
                        };
                        // Remove undefined properties
                        Object.keys(errorObj).forEach(key => {
                            if (errorObj[key] === undefined) {
                                delete errorObj[key];
                            }
                        });
                        // Use fs module pattern: create Error with JSON serialized data
                        const transferableError = new Error('__NET_ERROR__:' + JSON.stringify(errorObj));
                        listener.applySync(undefined, [transferableError], { arguments: { copy: true } });
                    } else {
                        // For other events, sanitize args to ensure transferability
                        const safeArgs = args.map(arg => {
                            if (arg === null || arg === undefined) return arg;
                            if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') return arg;
                            if (Buffer.isBuffer(arg)) return BuiltinBridge._bufferToArrayBuffer(arg);
                            // For objects, create a plain object copy
                            if (typeof arg === 'object') {
                                try {
                                    return JSON.parse(JSON.stringify(arg));
                                } catch (e) {
                                    return String(arg);
                                }
                            }
                            return String(arg);
                        });
                        listener.applySync(undefined, safeArgs, { arguments: { copy: true } });
                    }
                } catch (err) {
                    console.error('Error in socket event listener for', event, ':', err);
                }
            });
        }));
        
        // socket.removeListener(event, listener)
        context.global.setSync('_net_socketRemoveListener', new ivm.Reference((handleId, event, listener) => {
            const socket = getHandle(handleId);
            socket.removeListener(event, listener);
        }));
    }

    static setupCrypto(context) {
        
        // Map to store stateful crypto objects (Hash, Hmac)
        // Using Map with numeric IDs instead of WeakMap because handle objects
        // cannot be transferred across VM boundary and maintain identity
        const cryptoHandles = new Map();
        let handleCounter = 0;
        
        // Helper: Create a unique handle for stateful objects
        function createHandle(obj) {
            const handleId = ++handleCounter;
            cryptoHandles.set(handleId, obj);
            return handleId;
        }
        
        // Helper: Get object from handle
        function getHandle(handleId) {
            const obj = cryptoHandles.get(handleId);
            if (!obj) {
                throw new Error('Invalid crypto handle');
            }
            return obj;
        }
        
        // Random functions (stateless)
        context.global.setSync('_crypto_randomBytes', new ivm.Reference((size) => {
            const buffer = crypto.randomBytes(size);
            return BuiltinBridge._bufferToArrayBuffer(buffer);
        }));
        
        context.global.setSync('_crypto_randomUUID', new ivm.Reference(() => {
            return crypto.randomUUID();
        }));
        
        context.global.setSync('_crypto_randomInt', new ivm.Reference((min, max) => {
            // Node.js supports randomInt(max) and randomInt(min, max)
            // When called as randomInt(100), min=undefined and max=100
            if (min === undefined && max !== undefined) {
                return crypto.randomInt(max);
            } else if (max === undefined) {
                return crypto.randomInt(min);
            }
            return crypto.randomInt(min, max);
        }));
        
        // pbkdf2Sync (stateless)
        context.global.setSync('_crypto_pbkdf2Sync', new ivm.Reference((password, salt, iterations, keylen, digest) => {
            // Convert ArrayBuffer to Buffer if needed
            if (password instanceof ArrayBuffer) {
                password = BuiltinBridge._arrayBufferToBuffer(password);
            }
            if (salt instanceof ArrayBuffer) {
                salt = BuiltinBridge._arrayBufferToBuffer(salt);
            }
            const result = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest);
            return BuiltinBridge._bufferToArrayBuffer(result);
        }));
        
        // pbkdf2 (async with callback)
        context.global.setSync('_crypto_pbkdf2', new ivm.Reference((password, salt, iterations, keylen, digest, callback) => {
            // Convert ArrayBuffer to Buffer if needed
            if (password instanceof ArrayBuffer) {
                password = BuiltinBridge._arrayBufferToBuffer(password);
            }
            if (salt instanceof ArrayBuffer) {
                salt = BuiltinBridge._arrayBufferToBuffer(salt);
            }
            
            crypto.pbkdf2(password, salt, iterations, keylen, digest, (err, derivedKey) => {
                if (err) {
                    callback.applyIgnored(undefined, [err, null]);
                } else {
                    const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(derivedKey);
                    callback.applyIgnored(undefined, [null, arrayBuffer]);
                }
            });
        }));
        
        // Hash functions (stateful)
        context.global.setSync('_crypto_createHash', new ivm.Reference((algorithm) => {
            const hash = crypto.createHash(algorithm);
            const handle = createHandle(hash);
            return handle;
        }));
        
        context.global.setSync('_crypto_hashUpdate', new ivm.Reference((handle, data, inputEncoding) => {
            const hash = getHandle(handle);
            // Convert ArrayBuffer to Buffer if needed
            if (data instanceof ArrayBuffer) {
                data = BuiltinBridge._arrayBufferToBuffer(data);
            }
            hash.update(data, inputEncoding);
            return handle; // Return handle for chaining
        }));
        
        context.global.setSync('_crypto_hashDigest', new ivm.Reference((handle, encoding) => {
            const hash = getHandle(handle);
            const result = hash.digest(encoding);
            
            // If no encoding specified, return Buffer as ArrayBuffer
            if (!encoding) {
                return BuiltinBridge._bufferToArrayBuffer(result);
            }
            return result; // String if encoding specified
        }));
        
        // Hmac functions (stateful)
        context.global.setSync('_crypto_createHmac', new ivm.Reference((algorithm, key) => {
            // Convert ArrayBuffer to Buffer if needed
            if (key instanceof ArrayBuffer) {
                key = BuiltinBridge._arrayBufferToBuffer(key);
            }
            const hmac = crypto.createHmac(algorithm, key);
            const handle = createHandle(hmac);
            return handle;
        }));
        
        context.global.setSync('_crypto_hmacUpdate', new ivm.Reference((handle, data, inputEncoding) => {
            const hmac = getHandle(handle);
            // Convert ArrayBuffer to Buffer if needed
            if (data instanceof ArrayBuffer) {
                data = BuiltinBridge._arrayBufferToBuffer(data);
            }
            hmac.update(data, inputEncoding);
            return handle; // Return handle for chaining
        }));
        
        context.global.setSync('_crypto_hmacDigest', new ivm.Reference((handle, encoding) => {
            const hmac = getHandle(handle);
            const result = hmac.digest(encoding);
            
            // If no encoding specified, return Buffer as ArrayBuffer
            if (!encoding) {
                return BuiltinBridge._bufferToArrayBuffer(result);
            }
            return result; // String if encoding specified
        }));
        
        // Cipher functions (stateful)
        context.global.setSync('_crypto_createCipheriv', new ivm.Reference((algorithm, key, iv, options) => {
            // Convert ArrayBuffer to Buffer if needed
            if (key instanceof ArrayBuffer) {
                key = BuiltinBridge._arrayBufferToBuffer(key);
            }
            if (iv instanceof ArrayBuffer) {
                iv = BuiltinBridge._arrayBufferToBuffer(iv);
            }
            const cipher = crypto.createCipheriv(algorithm, key, iv, options);
            const handle = createHandle(cipher);
            return handle;
        }));
        
        context.global.setSync('_crypto_cipherUpdate', new ivm.Reference((handle, data, inputEncoding, outputEncoding) => {
            const cipher = getHandle(handle);
            // Convert ArrayBuffer to Buffer if needed
            if (data instanceof ArrayBuffer) {
                data = BuiltinBridge._arrayBufferToBuffer(data);
            }
            const result = cipher.update(data, inputEncoding, outputEncoding);
            
            // Return Buffer as ArrayBuffer if no outputEncoding
            if (!outputEncoding && Buffer.isBuffer(result)) {
                return BuiltinBridge._bufferToArrayBuffer(result);
            }
            return result; // String if encoding specified
        }));
        
        context.global.setSync('_crypto_cipherFinal', new ivm.Reference((handle, outputEncoding) => {
            const cipher = getHandle(handle);
            const result = cipher.final(outputEncoding);
            
            // Don't delete handle - getAuthTag() is called after final() for AEAD modes
            
            // Return Buffer as ArrayBuffer if no outputEncoding
            if (!outputEncoding && Buffer.isBuffer(result)) {
                return BuiltinBridge._bufferToArrayBuffer(result);
            }
            return result; // String if encoding specified
        }));
        
        context.global.setSync('_crypto_cipherSetAutoPadding', new ivm.Reference((handle, autoPadding) => {
            const cipher = getHandle(handle);
            cipher.setAutoPadding(autoPadding);
            return handle; // Return handle for chaining
        }));
        
        context.global.setSync('_crypto_cipherGetAuthTag', new ivm.Reference((handle) => {
            const cipher = getHandle(handle);
            const tag = cipher.getAuthTag();
            return BuiltinBridge._bufferToArrayBuffer(tag);
        }));
        
        // Decipher functions (stateful)
        context.global.setSync('_crypto_createDecipheriv', new ivm.Reference((algorithm, key, iv, options) => {
            // Convert ArrayBuffer to Buffer if needed
            if (key instanceof ArrayBuffer) {
                key = BuiltinBridge._arrayBufferToBuffer(key);
            }
            if (iv instanceof ArrayBuffer) {
                iv = BuiltinBridge._arrayBufferToBuffer(iv);
            }
            const decipher = crypto.createDecipheriv(algorithm, key, iv, options);
            const handle = createHandle(decipher);
            return handle;
        }));
        
        context.global.setSync('_crypto_decipherUpdate', new ivm.Reference((handle, data, inputEncoding, outputEncoding) => {
            const decipher = getHandle(handle);
            // Convert ArrayBuffer to Buffer if needed
            if (data instanceof ArrayBuffer) {
                data = BuiltinBridge._arrayBufferToBuffer(data);
            }
            const result = decipher.update(data, inputEncoding, outputEncoding);
            
            // Return Buffer as ArrayBuffer if no outputEncoding
            if (!outputEncoding && Buffer.isBuffer(result)) {
                return BuiltinBridge._bufferToArrayBuffer(result);
            }
            return result; // String if encoding specified
        }));
        
        context.global.setSync('_crypto_decipherFinal', new ivm.Reference((handle, outputEncoding) => {
            const decipher = getHandle(handle);
            const result = decipher.final(outputEncoding);
            
            // Don't delete handle - may need to access decipher object after final()
            
            // Return Buffer as ArrayBuffer if no outputEncoding
            if (!outputEncoding && Buffer.isBuffer(result)) {
                return BuiltinBridge._bufferToArrayBuffer(result);
            }
            return result; // String if encoding specified
        }));
        
        context.global.setSync('_crypto_decipherSetAutoPadding', new ivm.Reference((handle, autoPadding) => {
            const decipher = getHandle(handle);
            decipher.setAutoPadding(autoPadding);
            return handle; // Return handle for chaining
        }));
        
        context.global.setSync('_crypto_decipherSetAuthTag', new ivm.Reference((handle, buffer) => {
            const decipher = getHandle(handle);
            // Convert ArrayBuffer to Buffer if needed
            if (buffer instanceof ArrayBuffer) {
                buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
            }
            decipher.setAuthTag(buffer);
            return handle; // Return handle for chaining
        }));
        
        // Key generation functions
        context.global.setSync('_crypto_generateKeyPairSync', new ivm.Reference((type, options) => {
            const { publicKey, privateKey } = crypto.generateKeyPairSync(type, options);
            
            // Export keys as PEM strings for easy transfer across VM boundary
            const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
            const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
            
            return new ivm.ExternalCopy({ 
                publicKey: publicKeyPem, 
                privateKey: privateKeyPem 
            }).copyInto();
        }));
        
        context.global.setSync('_crypto_generateKeyPair', new ivm.Reference((type, options, callback) => {
            crypto.generateKeyPair(type, options, (err, publicKey, privateKey) => {
                if (err) {
                    callback.applyIgnored(undefined, [err, null]);
                } else {
                    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
                    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
                    
                    const result = new ivm.ExternalCopy({ 
                        publicKey: publicKeyPem, 
                        privateKey: privateKeyPem 
                    }).copyInto();
                    
                    callback.applyIgnored(undefined, [null, result]);
                }
            });
        }));
        
        // Stateless sign/verify functions
        context.global.setSync('_crypto_sign', new ivm.Reference((algorithm, data, privateKey) => {
            // Convert ArrayBuffer to Buffer if needed
            if (data instanceof ArrayBuffer) {
                data = BuiltinBridge._arrayBufferToBuffer(data);
            }
            
            const signature = crypto.sign(algorithm, data, privateKey);
            return BuiltinBridge._bufferToArrayBuffer(signature);
        }));
        
        context.global.setSync('_crypto_verify', new ivm.Reference((algorithm, data, publicKey, signature) => {
            // Convert ArrayBuffers to Buffers
            if (data instanceof ArrayBuffer) {
                data = BuiltinBridge._arrayBufferToBuffer(data);
            }
            if (signature instanceof ArrayBuffer) {
                signature = BuiltinBridge._arrayBufferToBuffer(signature);
            }
            
            return crypto.verify(algorithm, data, publicKey, signature);
        }));
        
        // Sign class functions (stateful)
        context.global.setSync('_crypto_createSign', new ivm.Reference((algorithm) => {
            const sign = crypto.createSign(algorithm);
            const handle = createHandle(sign);
            return handle;
        }));
        
        context.global.setSync('_crypto_signUpdate', new ivm.Reference((handle, data, inputEncoding) => {
            const sign = getHandle(handle);
            // Convert ArrayBuffer to Buffer if needed
            if (data instanceof ArrayBuffer) {
                data = BuiltinBridge._arrayBufferToBuffer(data);
            }
            sign.update(data, inputEncoding);
            return handle; // Return handle for chaining
        }));
        
        context.global.setSync('_crypto_signSign', new ivm.Reference((handle, privateKey, outputEncoding) => {
            const sign = getHandle(handle);
            const signature = sign.sign(privateKey, outputEncoding);
            
            // Don't delete handle - matches Cipher behavior
            
            // Return Buffer as ArrayBuffer if no outputEncoding
            if (!outputEncoding && Buffer.isBuffer(signature)) {
                return BuiltinBridge._bufferToArrayBuffer(signature);
            }
            return signature; // String if encoding specified
        }));
        
        // Verify class functions (stateful)
        context.global.setSync('_crypto_createVerify', new ivm.Reference((algorithm) => {
            const verify = crypto.createVerify(algorithm);
            const handle = createHandle(verify);
            return handle;
        }));
        
        context.global.setSync('_crypto_verifyUpdate', new ivm.Reference((handle, data, inputEncoding) => {
            const verify = getHandle(handle);
            // Convert ArrayBuffer to Buffer if needed
            if (data instanceof ArrayBuffer) {
                data = BuiltinBridge._arrayBufferToBuffer(data);
            }
            verify.update(data, inputEncoding);
            return handle; // Return handle for chaining
        }));
        
        context.global.setSync('_crypto_verifyVerify', new ivm.Reference((handle, publicKey, signature, signatureEncoding) => {
            const verify = getHandle(handle);
            // Convert ArrayBuffer to Buffer if needed
            if (signature instanceof ArrayBuffer) {
                signature = BuiltinBridge._arrayBufferToBuffer(signature);
            }
            return verify.verify(publicKey, signature, signatureEncoding);
        }));
        
        // Public/Private key encryption functions
        context.global.setSync('_crypto_publicEncrypt', new ivm.Reference((key, buffer) => {
            // Convert ArrayBuffer to Buffer if needed
            if (buffer instanceof ArrayBuffer) {
                buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
            }
            
            const encrypted = crypto.publicEncrypt(key, buffer);
            return BuiltinBridge._bufferToArrayBuffer(encrypted);
        }));
        
        context.global.setSync('_crypto_privateDecrypt', new ivm.Reference((key, buffer) => {
            // Convert ArrayBuffer to Buffer if needed
            if (buffer instanceof ArrayBuffer) {
                buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
            }
            
            const decrypted = crypto.privateDecrypt(key, buffer);
            return BuiltinBridge._bufferToArrayBuffer(decrypted);
        }));
        
        context.global.setSync('_crypto_privateEncrypt', new ivm.Reference((key, buffer) => {
            // Convert ArrayBuffer to Buffer if needed
            if (buffer instanceof ArrayBuffer) {
                buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
            }
            
            const encrypted = crypto.privateEncrypt(key, buffer);
            return BuiltinBridge._bufferToArrayBuffer(encrypted);
        }));
        
        context.global.setSync('_crypto_publicDecrypt', new ivm.Reference((key, buffer) => {
            // Convert ArrayBuffer to Buffer if needed
            if (buffer instanceof ArrayBuffer) {
                buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
            }
            
            const decrypted = crypto.publicDecrypt(key, buffer);
            return BuiltinBridge._bufferToArrayBuffer(decrypted);
        }));
        
        // Utility functions
        context.global.setSync('_crypto_getHashes', new ivm.Reference(() => {
            return new ivm.ExternalCopy(crypto.getHashes()).copyInto();
        }));
        
        context.global.setSync('_crypto_getCiphers', new ivm.Reference(() => {
            return new ivm.ExternalCopy(crypto.getCiphers()).copyInto();
        }));
        
        // Constant-time comparison for timing attack prevention
        context.global.setSync('_crypto_timingSafeEqual', new ivm.Reference((a, b) => {
            // Convert ArrayBuffers to Buffers if needed
            if (a instanceof ArrayBuffer) {
                a = BuiltinBridge._arrayBufferToBuffer(a);
            }
            if (b instanceof ArrayBuffer) {
                b = BuiltinBridge._arrayBufferToBuffer(b);
            }
            if (!Buffer.isBuffer(a)) a = Buffer.from(a);
            if (!Buffer.isBuffer(b)) b = Buffer.from(b);
            return crypto.timingSafeEqual(a, b);
        }));
    }
    
    // =========================================================================
    // HELPER METHODS - For fs module data conversion and serialization
    // =========================================================================
    
    /**
     * Serialize Stats object to plain object with boolean properties
     */
    static _serializeStats(stats) {
        return {
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            isSymbolicLink: stats.isSymbolicLink ? stats.isSymbolicLink() : false,
            size: stats.size,
            mtime: stats.mtime.toISOString(),
            atime: stats.atime ? stats.atime.toISOString() : null,
            ctime: stats.ctime ? stats.ctime.toISOString() : null,
            mode: stats.mode
        };
    }
    
    /**
     * Convert Node.js Buffer to ArrayBuffer for transfer to VM
     */
    static _bufferToArrayBuffer(buffer) {
        const arrayBuffer = new ArrayBuffer(buffer.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < buffer.length; i++) {
            view[i] = buffer[i];
        }
        return new ivm.ExternalCopy(arrayBuffer).copyInto();
    }
    
    /**
     * Setup TLS module (minimal bridge functions only)
     */
    static setupTLS(context) {
        
        // Map to store TLS socket instances
        const tlsHandles = new Map();
        let tlsHandleCounter = 0;
        
        // Helper: Create a unique handle for TLS socket objects
        function createTLSHandle(obj) {
            const handleId = ++tlsHandleCounter;
            tlsHandles.set(handleId, obj);
            return handleId;
        }
        
        // Helper: Get TLS object from handle
        function getTLSHandle(handleId) {
            const obj = tlsHandles.get(handleId);
            if (!obj) {
                throw new Error('Invalid TLS handle');
            }
            return obj;
        }
        
        // Helper: Remove TLS handle when socket closes
        function removeTLSHandle(handleId) {
            tlsHandles.delete(handleId);
        }
        
        // Bridge TLS connect functionality
        context.global.setSync('_tls_connect', new ivm.Reference((port, host, options, callback) => {
            // Merge options with port and host
            const tlsOptions = {
                ...options,
                port: port,
                host: host
            };
            
            const tlsSocket = tls.connect(tlsOptions);
            const handleId = createTLSHandle(tlsSocket);
            
            // Buffer to collect all data before 'end'
            const dataChunks = [];
            let endEmitted = false;
            let closeQueued = false;
            let closeHadError = false;
            
            // Setup event forwarding
            tlsSocket.on('secureConnect', () => {
                if (callback) callback.applyIgnored(undefined, ['secureConnect', handleId]);
            });
            
            tlsSocket.on('connect', () => {
                if (callback) callback.applyIgnored(undefined, ['connect', handleId]);
            });
            
            tlsSocket.on('data', (data) => {
                try {
                    // Buffer the data
                    dataChunks.push(data);
                    
                    // Convert Buffer to ArrayBuffer for VM using helper method
                    if (Buffer.isBuffer(data)) {
                        const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(data);
                        if (callback) callback.applyIgnored(undefined, ['data', arrayBuffer]);
                    } else {
                        if (callback) callback.applyIgnored(undefined, ['data', data]);
                    }
                } catch (err) {
                    console.error('Error forwarding TLS data:', err);
                }
            });
            
            tlsSocket.on('end', () => {
                // Wait a bit to ensure all data events are processed
                setImmediate(() => {
                    endEmitted = true;
                    if (callback) callback.applyIgnored(undefined, ['end']);
                    
                    // If close was queued, emit it now
                    if (closeQueued) {
                        setImmediate(() => {
                            if (callback) callback.applyIgnored(undefined, ['close', closeHadError]);
                            removeTLSHandle(handleId);
                        });
                    }
                });
            });
            
            tlsSocket.on('close', (hadError) => {
                // If 'end' hasn't been emitted yet, queue the close event
                if (!endEmitted) {
                    closeQueued = true;
                    closeHadError = hadError;
                    // Emit 'end' first
                    setImmediate(() => {
                        if (callback) callback.applyIgnored(undefined, ['end']);
                        endEmitted = true;
                        // Then emit close
                        setImmediate(() => {
                            if (callback) callback.applyIgnored(undefined, ['close', hadError]);
                            removeTLSHandle(handleId);
                        });
                    });
                } else {
                    // 'end' was already emitted, just emit close
                    setImmediate(() => {
                        if (callback) callback.applyIgnored(undefined, ['close', hadError]);
                        removeTLSHandle(handleId);
                    });
                }
            });
            
            tlsSocket.on('error', (err) => {
                const errorMsg = err && err.message ? err.message : String(err);
                if (callback) callback.applyIgnored(undefined, ['error', errorMsg]);
            });
            
            return handleId;
        }));
        
        // Bridge TLS socket write
        context.global.setSync('_tls_socketWrite', new ivm.Reference((handleId, data, encoding, callback) => {
            try {
                const tlsSocket = getTLSHandle(handleId);
                
                // Handle different data types using helper methods
                let buffer;
                if (data instanceof ArrayBuffer) {
                    buffer = BuiltinBridge._arrayBufferToBuffer(data);
                } else if (Buffer.isBuffer(data)) {
                    buffer = data;
                } else if (typeof data === 'string') {
                    buffer = Buffer.from(data, encoding || 'utf8');
                } else {
                    buffer = Buffer.from(data);
                }
                
                // Handle callback parameter overloading
                const actualCallback = (typeof encoding === 'function') ? encoding : callback;
                const actualEncoding = (typeof encoding === 'string') ? encoding : undefined;
                
                const result = tlsSocket.write(buffer, actualEncoding, (err) => {
                    if (actualCallback) {
                        const errorMsg = err ? (err.message || String(err)) : null;
                        actualCallback.applyIgnored(undefined, [errorMsg]);
                    }
                });
                return result;
            } catch (err) {
                if (callback || (typeof encoding === 'function')) {
                    const actualCallback = (typeof encoding === 'function') ? encoding : callback;
                    const errorMsg = err.message || String(err);
                    actualCallback.applyIgnored(undefined, [errorMsg]);
                }
                return false;
            }
        }));
        
        // Bridge TLS socket properties
        context.global.setSync('_tls_socketGetAuthorized', new ivm.Reference((handleId) => {
            try {
                const tlsSocket = getTLSHandle(handleId);
                return tlsSocket.authorized;
            } catch (err) {
                return false;
            }
        }));
        
        context.global.setSync('_tls_socketGetCipher', new ivm.Reference((handleId) => {
            try {
                const tlsSocket = getTLSHandle(handleId);
                const cipher = tlsSocket.getCipher();
                // Ensure cipher object is properly transferred using ExternalCopy
                return cipher ? new ivm.ExternalCopy(cipher).copyInto() : null;
            } catch (err) {
                return null;
            }
        }));
        
        context.global.setSync('_tls_socketGetProtocol', new ivm.Reference((handleId) => {
            try {
                const tlsSocket = getTLSHandle(handleId);
                return tlsSocket.getProtocol();
            } catch (err) {
                return null;
            }
        }));
        
        context.global.setSync('_tls_socketGetPeerCertificate', new ivm.Reference((handleId, detailed) => {
            try {
                const tlsSocket = getTLSHandle(handleId);
                const cert = tlsSocket.getPeerCertificate(detailed);
                // Ensure certificate object is properly transferred using ExternalCopy
                return new ivm.ExternalCopy(cert).copyInto();
            } catch (err) {
                return {};
            }
        }));
        
        context.global.setSync('_tls_socketEnd', new ivm.Reference((handleId, data, encoding, callback) => {
            try {
                const tlsSocket = getTLSHandle(handleId);
                
                // Handle parameter overloading like Node.js socket.end()
                if (typeof data === 'function') {
                    callback = data;
                    data = undefined;
                    encoding = undefined;
                } else if (typeof encoding === 'function') {
                    callback = encoding;
                    encoding = undefined;
                }
                
                if (data !== undefined) {
                    let buffer;
                    if (data instanceof ArrayBuffer) {
                        buffer = BuiltinBridge._arrayBufferToBuffer(data);
                    } else {
                        buffer = Buffer.from(data, encoding);
                    }
                    tlsSocket.end(buffer, encoding, callback);
                } else {
                    tlsSocket.end(callback);
                }
            } catch (err) {
                if (callback) {
                    const errorMsg = err.message || String(err);
                    callback.applyIgnored(undefined, [errorMsg]);
                }
            }
        }));
        
        context.global.setSync('_tls_socketDestroy', new ivm.Reference((handleId) => {
            try {
                const tlsSocket = getTLSHandle(handleId);
                tlsSocket.destroy();
                removeTLSHandle(handleId);
            } catch (err) {
                // Ignore errors on destroy
            }
        }));
        
        // Bridge CA certificates from host
        context.global.setSync('_tls_getCACertificates', new ivm.Reference((store) => {
            if (store === 'bundled' || store === 'default' || store === 'system') {
                // Get bundled CA certificates from Node.js
                let bundledCerts = [];
                
                // Try tls.rootCertificates first (Node.js 12+)
                if (tls.rootCertificates && Array.isArray(tls.rootCertificates)) {
                    bundledCerts = tls.rootCertificates;
                } else {
                    // Fallback: try to get from crypto module or use require('tls').rootCertificates
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        // Node.js bundles CA certs, we can access them via require
                        bundledCerts = require('tls').rootCertificates || [];
                    } catch (err) {
                        // If all else fails, return empty array
                        console.warn('Could not load CA certificates:', err.message);
                        bundledCerts = [];
                    }
                }
                
                return new ivm.ExternalCopy(bundledCerts).copyInto();
            }
            return [];
        }));
        

    }

    /**
     * Convert ArrayBuffer from VM to Node.js Buffer
     */
    static _arrayBufferToBuffer(arrayBuffer) {
        return Buffer.from(arrayBuffer);
    }

    static setupZlib(context) {
        // CRC32 lookup table for fallback implementation
        const crc32Table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let crc = i;
            for (let j = 0; j < 8; j++) {
                crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
            }
            crc32Table[i] = crc;
        }
        
        // Map to store stateful zlib stream objects
        const zlibHandles = new Map();
        let zlibHandleCounter = 0;
        
        // Helper: Create a unique handle for stateful stream objects
        function createZlibHandle(stream) {
            const handleId = ++zlibHandleCounter;
            zlibHandles.set(handleId, {
                stream: stream,
                finished: false,
                destroyed: false,
                bytesWritten: 0,
                bytesRead: 0
            });
            return handleId;
        }
        
        // Helper: Get stream from handle
        function getZlibHandle(handleId) {
            const handleObj = zlibHandles.get(handleId);
            if (!handleObj) {
                throw new Error('Invalid zlib handle');
            }
            return handleObj;
        }
        
        // Helper: Convert zlib error to transferable Error object  
        function convertZlibError(err) {
            if (!err) {
                return null;
            }
            
            // Create a clean Error object with only transferable properties
            const cleanError = new Error();
            
            // Copy basic properties safely
            try {
                cleanError.message = err.message || String(err);
            } catch (e) {
                cleanError.message = 'Error conversion failed';
            }
            
            try {
                if (err.code !== undefined) cleanError.code = err.code;
                if (err.errno !== undefined) cleanError.errno = err.errno;
                if (err.syscall !== undefined) cleanError.syscall = err.syscall;
                if (err.name !== undefined) cleanError.name = err.name;
            } catch (e) {
                // Ignore property access errors
            }
            
            return cleanError;
        }
        
        // Helper: Extract transferable error properties for VM boundary
        function getTransferableError(err) {
            if (!err) return null;
            if (typeof err.message !== 'string') return err;
            
            return {
                message: '__ZLIB_ERROR__:' + JSON.stringify({
                    message: err.message,
                    code: err.code,
                    errno: err.errno,
                    syscall: err.syscall,
                    name: err.name
                })
            };
        }
        
        // Synchronous convenience methods
        context.global.setSync('_zlib_deflateSync', new ivm.Reference((buffer, options) => {
            try {
                const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
                const result = zlib.deflateSync(input, options);
                return BuiltinBridge._bufferToArrayBuffer(result);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_inflateSync', new ivm.Reference((buffer, options) => {
            try {
                const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
                const result = zlib.inflateSync(input, options);
                return BuiltinBridge._bufferToArrayBuffer(result);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_gzipSync', new ivm.Reference((buffer, options) => {
            try {
                const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
                const result = zlib.gzipSync(input, options);
                return BuiltinBridge._bufferToArrayBuffer(result);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_gunzipSync', new ivm.Reference((buffer, options) => {
            try {
                const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
                const result = zlib.gunzipSync(input, options);
                return BuiltinBridge._bufferToArrayBuffer(result);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_deflateRawSync', new ivm.Reference((buffer, options) => {
            try {
                const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
                const result = zlib.deflateRawSync(input, options);
                return BuiltinBridge._bufferToArrayBuffer(result);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_inflateRawSync', new ivm.Reference((buffer, options) => {
            try {
                const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
                const result = zlib.inflateRawSync(input, options);
                return BuiltinBridge._bufferToArrayBuffer(result);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_unzipSync', new ivm.Reference((buffer, options) => {
            try {
                const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
                const result = zlib.unzipSync(input, options);
                return BuiltinBridge._bufferToArrayBuffer(result);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_brotliCompressSync', new ivm.Reference((buffer, options) => {
            try {
                const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
                const result = zlib.brotliCompressSync(input, options);
                return BuiltinBridge._bufferToArrayBuffer(result);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_brotliDecompressSync', new ivm.Reference((buffer, options) => {
            try {
                const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
                const result = zlib.brotliDecompressSync(input, options);
                return BuiltinBridge._bufferToArrayBuffer(result);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        // Add experimental Zstd methods if available
        if (zlib.zstdCompressSync && zlib.zstdDecompressSync) {
            context.global.setSync('_zlib_zstdCompressSync', new ivm.Reference((buffer, options) => {
                try {
                    const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
                    const result = zlib.zstdCompressSync(input, options);
                    return BuiltinBridge._bufferToArrayBuffer(result);
                } catch (err) {
                    throw convertZlibError(err);
                }
            }));
            
            context.global.setSync('_zlib_zstdDecompressSync', new ivm.Reference((buffer, options) => {
                try {
                    const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
                    const result = zlib.zstdDecompressSync(input, options);
                    return BuiltinBridge._bufferToArrayBuffer(result);
                } catch (err) {
                    throw convertZlibError(err);
                }
            }));
        }
        
        // Asynchronous convenience methods following fs module pattern
        context.global.setSync('_zlib_deflate', new ivm.Reference((buffer, options, callback) => {
            const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
            zlib.deflate(input, options, (err, result) => {
                if (err) {
                    callback.applySync(undefined, [convertZlibError(err), null], { arguments: { copy: true } });
                } else {
                    const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(result);
                    callback.applySync(undefined, [null, arrayBuffer], { arguments: { copy: true } });
                }
            });
        }));
        
        context.global.setSync('_zlib_inflate', new ivm.Reference((buffer, options, callback) => {
            const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
            zlib.inflate(input, options, (err, result) => {
                if (err) {
                    callback.applySync(undefined, [convertZlibError(err), null], { arguments: { copy: true } });
                } else {
                    const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(result);
                    callback.applySync(undefined, [null, arrayBuffer], { arguments: { copy: true } });
                }
            });
        }));
        
        context.global.setSync('_zlib_gzip', new ivm.Reference((buffer, options, callback) => {
            const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
            zlib.gzip(input, options, (err, result) => {
                if (err) {
                    callback.applySync(undefined, [convertZlibError(err), null], { arguments: { copy: true } });
                } else {
                    const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(result);
                    callback.applySync(undefined, [null, arrayBuffer], { arguments: { copy: true } });
                }
            });
        }));
        
        context.global.setSync('_zlib_gunzip', new ivm.Reference((buffer, options, callback) => {
            const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
            zlib.gunzip(input, options, (err, result) => {
                if (err) {
                    callback.applySync(undefined, [convertZlibError(err), null], { arguments: { copy: true } });
                } else {
                    const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(result);
                    callback.applySync(undefined, [null, arrayBuffer], { arguments: { copy: true } });
                }
            });
        }));
        
        context.global.setSync('_zlib_deflateRaw', new ivm.Reference((buffer, options, callback) => {
            const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
            zlib.deflateRaw(input, options, (err, result) => {
                if (err) {
                    callback.applySync(undefined, [convertZlibError(err), null], { arguments: { copy: true } });
                } else {
                    const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(result);
                    callback.applySync(undefined, [null, arrayBuffer], { arguments: { copy: true } });
                }
            });
        }));
        
        context.global.setSync('_zlib_inflateRaw', new ivm.Reference((buffer, options, callback) => {
            const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
            zlib.inflateRaw(input, options, (err, result) => {
                if (err) {
                    callback.applySync(undefined, [convertZlibError(err), null], { arguments: { copy: true } });
                } else {
                    const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(result);
                    callback.applySync(undefined, [null, arrayBuffer], { arguments: { copy: true } });
                }
            });
        }));
        
        context.global.setSync('_zlib_unzip', new ivm.Reference((buffer, options, callback) => {
            const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
            zlib.unzip(input, options, (err, result) => {
                if (err) {
                    callback.applySync(undefined, [convertZlibError(err), null], { arguments: { copy: true } });
                } else {
                    const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(result);
                    callback.applySync(undefined, [null, arrayBuffer], { arguments: { copy: true } });
                }
            });
        }));
        
        context.global.setSync('_zlib_brotliCompress', new ivm.Reference((buffer, options, callback) => {
            const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
            zlib.brotliCompress(input, options, (err, result) => {
                if (err) {
                    callback.applySync(undefined, [convertZlibError(err), null], { arguments: { copy: true } });
                } else {
                    const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(result);
                    callback.applySync(undefined, [null, arrayBuffer], { arguments: { copy: true } });
                }
            });
        }));
        
        context.global.setSync('_zlib_brotliDecompress', new ivm.Reference((buffer, options, callback) => {
            const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
            zlib.brotliDecompress(input, options, (err, result) => {
                if (err) {
                    callback.applySync(undefined, [convertZlibError(err), null], { arguments: { copy: true } });
                } else {
                    const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(result);
                    callback.applySync(undefined, [null, arrayBuffer], { arguments: { copy: true } });
                }
            });
        }));
        
        // Stream factory methods
        context.global.setSync('_zlib_createDeflate', new ivm.Reference((options) => {
            try {
                const stream = zlib.createDeflate(options);
                return createZlibHandle(stream);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_createInflate', new ivm.Reference((options) => {
            try {
                const stream = zlib.createInflate(options);
                return createZlibHandle(stream);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_createGzip', new ivm.Reference((options) => {
            try {
                const stream = zlib.createGzip(options);
                return createZlibHandle(stream);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_createGunzip', new ivm.Reference((options) => {
            try {
                const stream = zlib.createGunzip(options);
                return createZlibHandle(stream);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_createDeflateRaw', new ivm.Reference((options) => {
            try {
                const stream = zlib.createDeflateRaw(options);
                return createZlibHandle(stream);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_createInflateRaw', new ivm.Reference((options) => {
            try {
                const stream = zlib.createInflateRaw(options);
                return createZlibHandle(stream);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_createUnzip', new ivm.Reference((options) => {
            try {
                const stream = zlib.createUnzip(options);
                return createZlibHandle(stream);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_createBrotliCompress', new ivm.Reference((options) => {
            try {
                const stream = zlib.createBrotliCompress(options);
                return createZlibHandle(stream);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_createBrotliDecompress', new ivm.Reference((options) => {
            try {
                const stream = zlib.createBrotliDecompress(options);
                return createZlibHandle(stream);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        // Add experimental Zstd stream methods if available
        if (zlib.createZstdCompress && zlib.createZstdDecompress) {
            context.global.setSync('_zlib_createZstdCompress', new ivm.Reference((options) => {
                try {
                    const stream = zlib.createZstdCompress(options);
                    return createZlibHandle(stream);
                } catch (err) {
                    throw convertZlibError(err);
                }
            }));
            
            context.global.setSync('_zlib_createZstdDecompress', new ivm.Reference((options) => {
                try {
                    const stream = zlib.createZstdDecompress(options);
                    return createZlibHandle(stream);
                } catch (err) {
                    throw convertZlibError(err);
                }
            }));
        }
        
        // Synchronous chunk processing method
        context.global.setSync('_zlib_processChunk', new ivm.Reference((handle, chunk) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                if (handleObj.destroyed) {
                    throw new Error('Cannot process chunk on destroyed stream');
                }
                
                const input = chunk instanceof ArrayBuffer ? BuiltinBridge._arrayBufferToBuffer(chunk) : chunk;
                handleObj.bytesRead += input.length;
                
                // For transform streams, we need to manually process the data
                // This is a simplified synchronous approach
                const chunks = [];
                let hasData = false;
                
                // Temporarily capture output
                const originalPush = stream.push;
                stream.push = (chunk) => {
                    if (chunk !== null) {
                        chunks.push(chunk);
                        hasData = true;
                    }
                    return true; // Always accept more data
                };
                
                // Process the chunk
                stream._transform(input, 'buffer', (err) => {
                    if (err) {
                        throw err;
                    }
                });
                
                // Restore original push
                stream.push = originalPush;
                
                if (hasData && chunks.length > 0) {
                    const result = Buffer.concat(chunks);
                    handleObj.bytesWritten += result.length;
                    return BuiltinBridge._bufferToArrayBuffer(result);
                }
                
                return null;
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        // Synchronous flush processing method
        context.global.setSync('_zlib_flushChunk', new ivm.Reference((handle) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                if (handleObj.destroyed) {
                    throw new Error('Cannot flush destroyed stream');
                }
                
                const chunks = [];
                let hasData = false;
                
                // Temporarily capture output
                const originalPush = stream.push;
                stream.push = (chunk) => {
                    if (chunk !== null) {
                        chunks.push(chunk);
                        hasData = true;
                    }
                    return true; // Always accept more data
                };
                
                // Process the flush
                if (stream._flush) {
                    stream._flush((err) => {
                        if (err) {
                            throw err;
                        }
                    });
                }
                
                // Restore original push
                stream.push = originalPush;
                
                if (hasData && chunks.length > 0) {
                    const result = Buffer.concat(chunks);
                    handleObj.bytesWritten += result.length;
                    return BuiltinBridge._bufferToArrayBuffer(result);
                }
                
                return null;
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        // Stream control methods
        context.global.setSync('_zlib_write', new ivm.Reference((handle, chunk, encoding, callback) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                if (handleObj.destroyed) {
                    throw new Error('Cannot write to destroyed stream');
                }
                
                const input = chunk instanceof ArrayBuffer ? BuiltinBridge._arrayBufferToBuffer(chunk) : chunk;
                handleObj.bytesRead += input.length;
                
                const result = stream.write(input, encoding, (err) => {
                    if (callback) {
                        callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
                    }
                });
                
                return result;
            } catch (err) {
                if (callback) {
                    callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
                }
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_end', new ivm.Reference((handle, chunk, encoding, callback) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                if (chunk !== undefined && chunk !== null) {
                    const input = chunk instanceof ArrayBuffer ? BuiltinBridge._arrayBufferToBuffer(chunk) : chunk;
                    handleObj.bytesRead += input.length;
                }
                
                stream.end(chunk, encoding, (err) => {
                    handleObj.finished = true;
                    if (callback) {
                        callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
                    }
                });
            } catch (err) {
                if (callback) {
                    callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
                }
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_destroy', new ivm.Reference((handle, error) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                handleObj.destroyed = true;
                stream.destroy(error ? new Error(error) : undefined);
                
                // Clean up handle
                zlibHandles.delete(handle);
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        // ZlibBase methods
        context.global.setSync('_zlib_flush', new ivm.Reference((handle, kind, callback) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                if (typeof stream.flush === 'function') {
                    stream.flush(kind, (err) => {
                        if (callback) {
                            const serializedError = err ? convertZlibError(err) : null;
                            callback.applyIgnored(undefined, [serializedError], { arguments: { copy: true } });
                        }
                    });
                } else {
                    throw new Error('Stream does not support flush operation');
                }
            } catch (err) {
                if (callback) {
                    callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
                }
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_params', new ivm.Reference((handle, level, strategy, callback) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                if (typeof stream.params === 'function') {
                    stream.params(level, strategy, (err) => {
                        if (callback) {
                            callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
                        }
                    });
                } else {
                    throw new Error('Stream does not support params operation');
                }
            } catch (err) {
                if (callback) {
                    callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
                }
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_reset', new ivm.Reference((handle) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                if (typeof stream.reset === 'function') {
                    stream.reset();
                    handleObj.bytesWritten = 0;
                    handleObj.bytesRead = 0;
                } else {
                    throw new Error('Stream does not support reset operation');
                }
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_close', new ivm.Reference((handle, callback) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                if (typeof stream.close === 'function') {
                    stream.close((err) => {
                        zlibHandles.delete(handle);
                        if (callback) {
                            callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
                        }
                    });
                } else {
                    // Clean up handle even if close is not supported
                    zlibHandles.delete(handle);
                    if (callback) {
                        callback.applyIgnored(undefined, [null], { arguments: { copy: true } });
                    }
                }
            } catch (err) {
                if (callback) {
                    callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
                }
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_getBytesWritten', new ivm.Reference((handle) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                return stream.bytesWritten || handleObj.bytesWritten;
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_getBytesRead', new ivm.Reference((handle) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                return stream.bytesRead || handleObj.bytesRead;
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        // Stream event registration for VM callbacks
        context.global.setSync('_zlib_onData', new ivm.Reference((handle, callback) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                stream.on('data', (chunk) => {
                    handleObj.bytesWritten += chunk.length;
                    const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(chunk);
                    callback.applyIgnored(undefined, [arrayBuffer], { arguments: { copy: true } });
                });
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_onEnd', new ivm.Reference((handle, callback) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                stream.on('end', () => {
                    handleObj.finished = true;
                    callback.applyIgnored(undefined, [], { arguments: { copy: true } });
                });
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_onError', new ivm.Reference((handle, callback) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                stream.on('error', (err) => {
                    callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
                });
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        context.global.setSync('_zlib_onClose', new ivm.Reference((handle, callback) => {
            try {
                const handleObj = getZlibHandle(handle);
                const stream = handleObj.stream;
                
                stream.on('close', () => {
                    zlibHandles.delete(handle);
                    callback.applyIgnored(undefined, [], { arguments: { copy: true } });
                });
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        // Utility functions
        context.global.setSync('_zlib_crc32', new ivm.Reference((data, value) => {
            try {
                const input = data instanceof ArrayBuffer ? BuiltinBridge._arrayBufferToBuffer(data) : data;
                if (typeof zlib.crc32 === 'function') {
                    return zlib.crc32(input, value);
                } else {
                    // Fallback CRC32 implementation if not available in zlib
                    try {
                        const crc32 = require('crc-32');
                        return crc32.buf(input, value);
                    } catch (requireError) {
                        // Simple polynomial CRC32 fallback
                        let crc = value || -1;
                        for (let i = 0; i < input.length; i++) {
                            crc = (crc >>> 8) ^ crc32Table[(crc ^ input[i]) & 0xFF];
                        }
                        return (crc ^ -1) >>> 0;
                    }
                }
            } catch (err) {
                throw convertZlibError(err);
            }
        }));
        
        // Constants
        context.global.setSync('_zlib_constants', new ivm.ExternalCopy({
            // Compression levels
            Z_NO_COMPRESSION: zlib.constants.Z_NO_COMPRESSION,
            Z_BEST_SPEED: zlib.constants.Z_BEST_SPEED,
            Z_BEST_COMPRESSION: zlib.constants.Z_BEST_COMPRESSION,
            Z_DEFAULT_COMPRESSION: zlib.constants.Z_DEFAULT_COMPRESSION,
            
            // Compression strategies
            Z_FILTERED: zlib.constants.Z_FILTERED,
            Z_HUFFMAN_ONLY: zlib.constants.Z_HUFFMAN_ONLY,
            Z_RLE: zlib.constants.Z_RLE,
            Z_FIXED: zlib.constants.Z_FIXED,
            Z_DEFAULT_STRATEGY: zlib.constants.Z_DEFAULT_STRATEGY,
            
            // Flush modes
            Z_NO_FLUSH: zlib.constants.Z_NO_FLUSH,
            Z_PARTIAL_FLUSH: zlib.constants.Z_PARTIAL_FLUSH,
            Z_SYNC_FLUSH: zlib.constants.Z_SYNC_FLUSH,
            Z_FULL_FLUSH: zlib.constants.Z_FULL_FLUSH,
            Z_FINISH: zlib.constants.Z_FINISH,
            Z_BLOCK: zlib.constants.Z_BLOCK,
            Z_TREES: zlib.constants.Z_TREES,
            
            // Window bits
            Z_MIN_WINDOWBITS: zlib.constants.Z_MIN_WINDOWBITS,
            Z_MAX_WINDOWBITS: zlib.constants.Z_MAX_WINDOWBITS,
            Z_DEFAULT_WINDOWBITS: zlib.constants.Z_DEFAULT_WINDOWBITS,
            
            // Memory levels
            Z_MIN_MEMLEVEL: zlib.constants.Z_MIN_MEMLEVEL,
            Z_MAX_MEMLEVEL: zlib.constants.Z_MAX_MEMLEVEL,
            Z_DEFAULT_MEMLEVEL: zlib.constants.Z_DEFAULT_MEMLEVEL,
            
            // Chunk sizes
            Z_MIN_CHUNK: zlib.constants.Z_MIN_CHUNK,
            Z_MAX_CHUNK: zlib.constants.Z_MAX_CHUNK,
            Z_DEFAULT_CHUNK: zlib.constants.Z_DEFAULT_CHUNK,
            
            // Brotli constants
            BROTLI_DECODE: zlib.constants.BROTLI_DECODE,
            BROTLI_ENCODE: zlib.constants.BROTLI_ENCODE,
            BROTLI_OPERATION_PROCESS: zlib.constants.BROTLI_OPERATION_PROCESS,
            BROTLI_OPERATION_FLUSH: zlib.constants.BROTLI_OPERATION_FLUSH,
            BROTLI_OPERATION_FINISH: zlib.constants.BROTLI_OPERATION_FINISH,
            BROTLI_OPERATION_EMIT_METADATA: zlib.constants.BROTLI_OPERATION_EMIT_METADATA,
            
            BROTLI_PARAM_MODE: zlib.constants.BROTLI_PARAM_MODE,
            BROTLI_PARAM_QUALITY: zlib.constants.BROTLI_PARAM_QUALITY,
            BROTLI_PARAM_LGWIN: zlib.constants.BROTLI_PARAM_LGWIN,
            BROTLI_PARAM_LGBLOCK: zlib.constants.BROTLI_PARAM_LGBLOCK,
            BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING: zlib.constants.BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING,
            BROTLI_PARAM_SIZE_HINT: zlib.constants.BROTLI_PARAM_SIZE_HINT,
            BROTLI_PARAM_LARGE_WINDOW: zlib.constants.BROTLI_PARAM_LARGE_WINDOW,
            BROTLI_PARAM_NPOSTFIX: zlib.constants.BROTLI_PARAM_NPOSTFIX,
            BROTLI_PARAM_NDIRECT: zlib.constants.BROTLI_PARAM_NDIRECT,
            
            BROTLI_MODE_GENERIC: zlib.constants.BROTLI_MODE_GENERIC,
            BROTLI_MODE_TEXT: zlib.constants.BROTLI_MODE_TEXT,
            BROTLI_MODE_FONT: zlib.constants.BROTLI_MODE_FONT,
            
            BROTLI_MIN_QUALITY: zlib.constants.BROTLI_MIN_QUALITY,
            BROTLI_MAX_QUALITY: zlib.constants.BROTLI_MAX_QUALITY,
            BROTLI_DEFAULT_QUALITY: zlib.constants.BROTLI_DEFAULT_QUALITY,
            BROTLI_MIN_WINDOW_BITS: zlib.constants.BROTLI_MIN_WINDOW_BITS,
            BROTLI_MAX_WINDOW_BITS: zlib.constants.BROTLI_MAX_WINDOW_BITS,
            BROTLI_DEFAULT_WINDOW: zlib.constants.BROTLI_DEFAULT_WINDOW
        }).copyInto());
    }

    /**
     * Setup DNS module
     */
    static setupDNS(context) {
        // Helper to convert error to serializable object
        function convertErrorObject(err) {
            if (!err) return null;
            return {
                message: err.message,
                code: err.code,
                errno: err.errno,
                syscall: err.syscall,
                hostname: err.hostname
            };
        }

        // dns.lookup
        context.global.setSync('_dns_lookup', new ivm.Reference((hostname, options, callback) => {
            dns.lookup(hostname, options, (err, address, family) => {
                callback.applySync(undefined, [convertErrorObject(err), address, family], { arguments: { copy: true } });
            });
        }));

        // dns.lookupService
        context.global.setSync('_dns_lookupService', new ivm.Reference((address, port, callback) => {
            dns.lookupService(address, port, (err, hostname, service) => {
                callback.applySync(undefined, [convertErrorObject(err), hostname, service], { arguments: { copy: true } });
            });
        }));

        // dns.resolve
        context.global.setSync('_dns_resolve', new ivm.Reference((hostname, rrtype, callback) => {
            dns.resolve(hostname, rrtype, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // dns.resolve4
        context.global.setSync('_dns_resolve4', new ivm.Reference((hostname, options, callback) => {
            dns.resolve4(hostname, options, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // dns.resolve6
        context.global.setSync('_dns_resolve6', new ivm.Reference((hostname, options, callback) => {
            dns.resolve6(hostname, options, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // dns.resolveAny
        context.global.setSync('_dns_resolveAny', new ivm.Reference((hostname, callback) => {
            dns.resolveAny(hostname, (err, records) => {
                callback.applySync(undefined, [convertErrorObject(err), records], { arguments: { copy: true } });
            });
        }));

        // dns.resolveCname
        context.global.setSync('_dns_resolveCname', new ivm.Reference((hostname, callback) => {
            dns.resolveCname(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // dns.resolveMx
        context.global.setSync('_dns_resolveMx', new ivm.Reference((hostname, callback) => {
            dns.resolveMx(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // dns.resolveNaptr
        context.global.setSync('_dns_resolveNaptr', new ivm.Reference((hostname, callback) => {
            dns.resolveNaptr(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // dns.resolveNs
        context.global.setSync('_dns_resolveNs', new ivm.Reference((hostname, callback) => {
            dns.resolveNs(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // dns.resolvePtr
        context.global.setSync('_dns_resolvePtr', new ivm.Reference((hostname, callback) => {
            dns.resolvePtr(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // dns.resolveSoa
        context.global.setSync('_dns_resolveSoa', new ivm.Reference((hostname, callback) => {
            dns.resolveSoa(hostname, (err, address) => {
                callback.applySync(undefined, [convertErrorObject(err), address], { arguments: { copy: true } });
            });
        }));

        // dns.resolveSrv
        context.global.setSync('_dns_resolveSrv', new ivm.Reference((hostname, callback) => {
            dns.resolveSrv(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // dns.resolveTxt
        context.global.setSync('_dns_resolveTxt', new ivm.Reference((hostname, callback) => {
            dns.resolveTxt(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // dns.reverse
        context.global.setSync('_dns_reverse', new ivm.Reference((ip, callback) => {
            dns.reverse(ip, (err, hostnames) => {
                callback.applySync(undefined, [convertErrorObject(err), hostnames], { arguments: { copy: true } });
            });
        }));

        // dns.setDefaultResultOrder
        context.global.setSync('_dns_setDefaultResultOrder', new ivm.Reference((order) => {
            dns.setDefaultResultOrder(order);
        }));

        // dns.getDefaultResultOrder
        context.global.setSync('_dns_getDefaultResultOrder', new ivm.Reference(() => {
            return dns.getDefaultResultOrder();
        }));

        // dns.setServers
        context.global.setSync('_dns_setServers', new ivm.Reference((servers) => {
            dns.setServers(servers);
        }));

        // dns.getServers
        context.global.setSync('_dns_getServers', new ivm.Reference(() => {
            const servers = dns.getServers();
            return new ivm.ExternalCopy(servers).copyInto();
        }));

        // Resolver instance management
        const resolverHandles = new Map();
        let resolverHandleCounter = 0;

        function createResolverHandle(resolver) {
            const handleId = ++resolverHandleCounter;
            resolverHandles.set(handleId, resolver);
            return handleId;
        }

        function getResolverHandle(handleId) {
            const resolver = resolverHandles.get(handleId);
            if (!resolver) {
                throw new Error('Invalid resolver handle');
            }
            return resolver;
        }

        function removeResolverHandle(handleId) {
            resolverHandles.delete(handleId);
        }

        // dns.Resolver constructor
        context.global.setSync('_dns_createResolver', new ivm.Reference((options) => {
            const resolver = new dns.Resolver(options);
            return createResolverHandle(resolver);
        }));

        // Resolver.cancel
        context.global.setSync('_dns_resolverCancel', new ivm.Reference((handle) => {
            const resolver = getResolverHandle(handle);
            resolver.cancel();
            removeResolverHandle(handle);
        }));

        // Resolver.setServers
        context.global.setSync('_dns_resolverSetServers', new ivm.Reference((handle, servers) => {
            const resolver = getResolverHandle(handle);
            resolver.setServers(servers);
        }));

        // Resolver.getServers
        context.global.setSync('_dns_resolverGetServers', new ivm.Reference((handle) => {
            const resolver = getResolverHandle(handle);
            const servers = resolver.getServers();
            return new ivm.ExternalCopy(servers).copyInto();
        }));

        // Resolver.resolve
        context.global.setSync('_dns_resolverResolve', new ivm.Reference((handle, hostname, rrtype, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolve(hostname, rrtype, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // Resolver.resolve4
        context.global.setSync('_dns_resolverResolve4', new ivm.Reference((handle, hostname, options, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolve4(hostname, options, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // Resolver.resolve6
        context.global.setSync('_dns_resolverResolve6', new ivm.Reference((handle, hostname, options, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolve6(hostname, options, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // Resolver.resolveAny
        context.global.setSync('_dns_resolverResolveAny', new ivm.Reference((handle, hostname, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolveAny(hostname, (err, records) => {
                callback.applySync(undefined, [convertErrorObject(err), records], { arguments: { copy: true } });
            });
        }));

        // Resolver.resolveCname
        context.global.setSync('_dns_resolverResolveCname', new ivm.Reference((handle, hostname, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolveCname(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // Resolver.resolveMx
        context.global.setSync('_dns_resolverResolveMx', new ivm.Reference((handle, hostname, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolveMx(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // Resolver.resolveNaptr
        context.global.setSync('_dns_resolverResolveNaptr', new ivm.Reference((handle, hostname, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolveNaptr(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // Resolver.resolveNs
        context.global.setSync('_dns_resolverResolveNs', new ivm.Reference((handle, hostname, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolveNs(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // Resolver.resolvePtr
        context.global.setSync('_dns_resolverResolvePtr', new ivm.Reference((handle, hostname, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolvePtr(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // Resolver.resolveSoa
        context.global.setSync('_dns_resolverResolveSoa', new ivm.Reference((handle, hostname, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolveSoa(hostname, (err, address) => {
                callback.applySync(undefined, [convertErrorObject(err), address], { arguments: { copy: true } });
            });
        }));

        // Resolver.resolveSrv
        context.global.setSync('_dns_resolverResolveSrv', new ivm.Reference((handle, hostname, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolveSrv(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // Resolver.resolveTxt
        context.global.setSync('_dns_resolverResolveTxt', new ivm.Reference((handle, hostname, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.resolveTxt(hostname, (err, addresses) => {
                callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
            });
        }));

        // Resolver.reverse
        context.global.setSync('_dns_resolverReverse', new ivm.Reference((handle, ip, callback) => {
            const resolver = getResolverHandle(handle);
            resolver.reverse(ip, (err, hostnames) => {
                callback.applySync(undefined, [convertErrorObject(err), hostnames], { arguments: { copy: true } });
            });
        }));
    }
}

module.exports = BuiltinBridge;
