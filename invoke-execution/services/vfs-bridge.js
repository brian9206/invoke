const ivm = require('isolated-vm');

/**
 * VFSBridge - Exposes sandbox-fs VFS API to isolated-vm
 * Wraps all fs methods as ivm.Reference functions
 */
class VFSBridge {
    constructor(vfs) {
        this.vfs = vfs;
        this.fs = vfs.createNodeFSModule();
    }
    
    /**
     * Get the complete fs module with all methods as References
     * This is the main method to expose fs to the VM
     */
    getFSModule() {
        return this.createFSModule();
    }
    
    /**
     * Create fs module object with all methods as References
     */
    createFSModule() {
        const self = this;
        
        return {
            // Sync methods
            readFileSync: new ivm.Reference((path, encoding) => {
                return self.fs.readFileSync(path, encoding || 'utf8');
            }),
            
            writeFileSync: new ivm.Reference((path, data, encoding) => {
                return self.fs.writeFileSync(path, data, encoding);
            }),
            
            appendFileSync: new ivm.Reference((path, data, encoding) => {
                return self.fs.appendFileSync(path, data, encoding);
            }),
            
            statSync: new ivm.Reference((path) => {
                const stats = self.fs.statSync(path);
                return self._serializeStats(stats);
            }),
            
            readdirSync: new ivm.Reference((path, options) => {
                return self.fs.readdirSync(path, options);
            }),
            
            existsSync: new ivm.Reference((path) => {
                return self.fs.existsSync(path);
            }),
            
            accessSync: new ivm.Reference((path, mode) => {
                return self.fs.accessSync(path, mode);
            }),
            
            mkdirSync: new ivm.Reference((path, options) => {
                return self.fs.mkdirSync(path, options);
            }),
            
            unlinkSync: new ivm.Reference((path) => {
                return self.fs.unlinkSync(path);
            }),
            
            rmdirSync: new ivm.Reference((path, options) => {
                return self.fs.rmdirSync(path, options);
            }),
            
            renameSync: new ivm.Reference((oldPath, newPath) => {
                return self.fs.renameSync(oldPath, newPath);
            }),
            
            copyFileSync: new ivm.Reference((src, dest, flags) => {
                return self.fs.copyFileSync(src, dest, flags);
            }),
            
            chmodSync: new ivm.Reference((path, mode) => {
                return self.fs.chmodSync(path, mode);
            }),
            
            chownSync: new ivm.Reference((path, uid, gid) => {
                return self.fs.chownSync(path, uid, gid);
            }),
            
            openSync: new ivm.Reference((path, flags, mode) => {
                return self.fs.openSync(path, flags, mode);
            }),
            
            closeSync: new ivm.Reference((fd) => {
                return self.fs.closeSync(fd);
            }),
            
            readSync: new ivm.Reference((fd, buffer, offset, length, position) => {
                return self.fs.readSync(fd, buffer, offset, length, position);
            }),
            
            writeSync: new ivm.Reference((fd, buffer, offset, length, position) => {
                return self.fs.writeSync(fd, buffer, offset, length, position);
            }),
            
            truncateSync: new ivm.Reference((path, len) => {
                return self.fs.truncateSync(path, len);
            }),
            
            ftruncateSync: new ivm.Reference((fd, len) => {
                return self.fs.ftruncateSync(fd, len);
            }),
            
            // Async callback methods
            readFile: new ivm.Reference((path, encodingOrCallback, callback) => {
                const actualCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
                const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
                
                self.fs.readFile(path, encoding, (err, data) => {
                    actualCallback.applySync(undefined, [err, data]);
                });
            }),
            
            writeFile: new ivm.Reference((path, data, encodingOrCallback, callback) => {
                const actualCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
                const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
                
                self.fs.writeFile(path, data, encoding, (err) => {
                    actualCallback.applySync(undefined, [err]);
                });
            }),
            
            appendFile: new ivm.Reference((path, data, encodingOrCallback, callback) => {
                const actualCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
                const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
                
                self.fs.appendFile(path, data, encoding, (err) => {
                    actualCallback.applySync(undefined, [err]);
                });
            }),
            
            stat: new ivm.Reference((path, callback) => {
                self.fs.stat(path, (err, stats) => {
                    const serializedStats = stats ? self._serializeStats(stats) : null;
                    callback.applySync(undefined, [err, serializedStats]);
                });
            }),
            
            readdir: new ivm.Reference((path, optionsOrCallback, callback) => {
                const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
                const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;
                
                self.fs.readdir(path, options, (err, files) => {
                    actualCallback.applySync(undefined, [err, files]);
                });
            }),
            
            access: new ivm.Reference((path, modeOrCallback, callback) => {
                const actualCallback = typeof modeOrCallback === 'function' ? modeOrCallback : callback;
                const mode = typeof modeOrCallback === 'number' ? modeOrCallback : undefined;
                
                self.fs.access(path, mode, (err) => {
                    actualCallback.applySync(undefined, [err]);
                });
            }),
            
            mkdir: new ivm.Reference((path, optionsOrCallback, callback) => {
                const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
                const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;
                
                self.fs.mkdir(path, options, (err) => {
                    actualCallback.applySync(undefined, [err]);
                });
            }),
            
            unlink: new ivm.Reference((path, callback) => {
                self.fs.unlink(path, (err) => {
                    callback.applySync(undefined, [err]);
                });
            }),
            
            rmdir: new ivm.Reference((path, optionsOrCallback, callback) => {
                const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
                const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;
                
                self.fs.rmdir(path, options, (err) => {
                    actualCallback.applySync(undefined, [err]);
                });
            }),
            
            rename: new ivm.Reference((oldPath, newPath, callback) => {
                self.fs.rename(oldPath, newPath, (err) => {
                    callback.applySync(undefined, [err]);
                });
            }),
            
            copyFile: new ivm.Reference((src, dest, flagsOrCallback, callback) => {
                const actualCallback = typeof flagsOrCallback === 'function' ? flagsOrCallback : callback;
                const flags = typeof flagsOrCallback === 'number' ? flagsOrCallback : undefined;
                
                self.fs.copyFile(src, dest, flags, (err) => {
                    actualCallback.applySync(undefined, [err]);
                });
            }),
            
            chmod: new ivm.Reference((path, mode, callback) => {
                self.fs.chmod(path, mode, (err) => {
                    callback.applySync(undefined, [err]);
                });
            }),
            
            chown: new ivm.Reference((path, uid, gid, callback) => {
                self.fs.chown(path, uid, gid, (err) => {
                    callback.applySync(undefined, [err]);
                });
            }),
            
            open: new ivm.Reference((path, flags, modeOrCallback, callback) => {
                const actualCallback = typeof modeOrCallback === 'function' ? modeOrCallback : callback;
                const mode = typeof modeOrCallback === 'number' ? modeOrCallback : undefined;
                
                self.fs.open(path, flags, mode, (err, fd) => {
                    actualCallback.applySync(undefined, [err, fd]);
                });
            }),
            
            close: new ivm.Reference((fd, callback) => {
                self.fs.close(fd, (err) => {
                    callback.applySync(undefined, [err]);
                });
            }),
            
            read: new ivm.Reference((fd, buffer, offset, length, position, callback) => {
                self.fs.read(fd, buffer, offset, length, position, (err, bytesRead, buffer) => {
                    callback.applySync(undefined, [err, bytesRead, buffer]);
                });
            }),
            
            write: new ivm.Reference((fd, buffer, offsetOrCallback, lengthOrCallback, positionOrCallback, callback) => {
                // Handle different overloads
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
                
                self.fs.write(fd, buffer, offset, length, position, (err, bytesWritten, buffer) => {
                    actualCallback.applySync(undefined, [err, bytesWritten, buffer]);
                });
            }),
            
            // Promise-based methods (fs.promises)
            promises: self._createPromisesAPI(),
            
            // Stream methods
            createReadStream: new ivm.Reference((path, options) => {
                return self.fs.createReadStream(path, options);
            }),
            
            createWriteStream: new ivm.Reference((path, options) => {
                return self.fs.createWriteStream(path, options);
            }),
            
            // Constants
            constants: self.fs.constants
        };
    }
    
    /**
     * Create fs.promises API
     */
    _createPromisesAPI() {
        const self = this;
        
        return {
            readFile: new ivm.Reference(async (path, encoding) => {
                return await self.fs.promises.readFile(path, encoding || 'utf8');
            }),
            
            writeFile: new ivm.Reference(async (path, data, encoding) => {
                return await self.fs.promises.writeFile(path, data, encoding);
            }),
            
            appendFile: new ivm.Reference(async (path, data, encoding) => {
                return await self.fs.promises.appendFile(path, data, encoding);
            }),
            
            stat: new ivm.Reference(async (path) => {
                const stats = await self.fs.promises.stat(path);
                return self._serializeStats(stats);
            }),
            
            readdir: new ivm.Reference(async (path, options) => {
                return await self.fs.promises.readdir(path, options);
            }),
            
            access: new ivm.Reference(async (path, mode) => {
                return await self.fs.promises.access(path, mode);
            }),
            
            mkdir: new ivm.Reference(async (path, options) => {
                return await self.fs.promises.mkdir(path, options);
            }),
            
            unlink: new ivm.Reference(async (path) => {
                return await self.fs.promises.unlink(path);
            }),
            
            rmdir: new ivm.Reference(async (path, options) => {
                return await self.fs.promises.rmdir(path, options);
            }),
            
            rename: new ivm.Reference(async (oldPath, newPath) => {
                return await self.fs.promises.rename(oldPath, newPath);
            }),
            
            copyFile: new ivm.Reference(async (src, dest, flags) => {
                return await self.fs.promises.copyFile(src, dest, flags);
            }),
            
            chmod: new ivm.Reference(async (path, mode) => {
                return await self.fs.promises.chmod(path, mode);
            }),
            
            chown: new ivm.Reference(async (path, uid, gid) => {
                return await self.fs.promises.chown(path, uid, gid);
            })
        };
    }
    
    /**
     * Serialize Stats object to plain object
     */
    _serializeStats(stats) {
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
     * Create path module object with all methods as References
     */
    getPathModule() {
        const vfsPath = this.vfs.createNodePathModule();
        
        return {
            sep: new ivm.Reference(() => vfsPath.sep),
            delimiter: new ivm.Reference(() => vfsPath.delimiter),
            
            normalize: new ivm.Reference((p) => vfsPath.normalize(p)),
            join: new ivm.Reference((...args) => vfsPath.join(...args)),
            resolve: new ivm.Reference((...args) => vfsPath.resolve(...args)),
            dirname: new ivm.Reference((p) => vfsPath.dirname(p)),
            basename: new ivm.Reference((p, ext) => vfsPath.basename(p, ext)),
            extname: new ivm.Reference((p) => vfsPath.extname(p)),
            isAbsolute: new ivm.Reference((p) => vfsPath.isAbsolute(p)),
            relative: new ivm.Reference((from, to) => vfsPath.relative(from, to)),
            parse: new ivm.Reference((p) => vfsPath.parse(p)),
            format: new ivm.Reference((obj) => vfsPath.format(obj))
        };
    }
}

module.exports = VFSBridge;
