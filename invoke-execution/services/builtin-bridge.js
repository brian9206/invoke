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
        const mime = require('mime-types');
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
    static setupCrypto(context) {
        const crypto = require('crypto');
        
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
     * Convert ArrayBuffer from VM to Node.js Buffer
     */
    static _arrayBufferToBuffer(arrayBuffer) {
        return Buffer.from(arrayBuffer);
    }
}

module.exports = BuiltinBridge;
