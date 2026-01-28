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
