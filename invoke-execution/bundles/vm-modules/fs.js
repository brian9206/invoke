const fs = {};
module.exports = fs;

// Stats class to wrap serialized stats with Node.js-compatible methods
class Stats {
    constructor(serialized) {
        this._isFile = serialized.isFile;
        this._isDirectory = serialized.isDirectory;
        this._isSymbolicLink = serialized.isSymbolicLink;
        this.size = serialized.size;
        this.mode = serialized.mode;
        // Convert ISO strings back to Date objects
        this.mtime = serialized.mtime ? new Date(serialized.mtime) : null;
        this.atime = serialized.atime ? new Date(serialized.atime) : null;
        this.ctime = serialized.ctime ? new Date(serialized.ctime) : null;
    }
    
    isFile() {
        return this._isFile;
    }
    
    isDirectory() {
        return this._isDirectory;
    }
    
    isSymbolicLink() {
        return this._isSymbolicLink;
    }
    
    isBlockDevice() {
        return false;
    }
    
    isCharacterDevice() {
        return false;
    }
    
    isFIFO() {
        return false;
    }
    
    isSocket() {
        return false;
    }
}

// Internal helper functions
function convertArrayBufferToBufferSafe(value) {
    if (value && value instanceof ArrayBuffer) {
        return Buffer.from(value);
    } 
    else {
        return value;
    }
}

function convertErrorObject(value) {
    if (!value || typeof value.message !== 'string') {
        return value;
    }

    const error = new Error(value.message);

    try {
        const errorMessagePrefix = '__FS_ERROR__:';
        if (value.message?.startsWith(errorMessagePrefix)) {
            const errorInfo = JSON.parse(value.message.substring(errorMessagePrefix.length));
            Object.assign(error, errorInfo);
        }
    }
    catch {}

    return error;
}

function convertStatsToNodeFormat(stats) {
    if (!stats) return null;
    return new Stats(stats);
}

// Sync methods
fs.readFileSync = function(...args) {
    try {
        return convertArrayBufferToBufferSafe(_fs_readFileSync.applySync(undefined, args));
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.writeFileSync = function(...args) {
    try {
        return _fs_writeFileSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.appendFileSync = function(...args) {
    try {
        return _fs_appendFileSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.statSync = function(...args) {
    try {
        const stats = _fs_statSync.applySync(undefined, args);
        return convertStatsToNodeFormat(stats);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.readdirSync = function(...args) {
    try {
        return _fs_readdirSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.existsSync = function(...args) {
    try {
        return _fs_existsSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.accessSync = function(...args) {
    try {
        return _fs_accessSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.mkdirSync = function(...args) {
    try {
        return _fs_mkdirSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.unlinkSync = function(...args) {
    try {
        return _fs_unlinkSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.rmdirSync = function(...args) {
    try {
        return _fs_rmdirSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.renameSync = function(...args) {
    try {
        return _fs_renameSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.copyFileSync = function(...args) {
    try {
        return _fs_copyFileSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.chmodSync = function(...args) {
    try {
        return _fs_chmodSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.chownSync = function(...args) {
    try {
        return _fs_chownSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.openSync = function(...args) {
    try {
        return _fs_openSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.closeSync = function(...args) {
    try {
        return _fs_closeSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.readSync = function(fd, buffer, offset, length, position) {
    try {
        // Convert buffer to ArrayBuffer for transfer to host
        const bufferArrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        const result = _fs_readSync.applySync(undefined, [fd, bufferArrayBuffer, offset, length, position]);
        // Copy filled data back to original buffer
        const filledBuffer = convertArrayBufferToBufferSafe(result.buffer);
        if (filledBuffer && buffer) {
            filledBuffer.copy(buffer);
        }
        return result.bytesRead;
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.writeSync = function(fd, buffer, offset, length, position) {
    try {
        // Convert buffer to ArrayBuffer for transfer to host
        const bufferArrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return _fs_writeSync.applySync(undefined, [fd, bufferArrayBuffer, offset, length, position]);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.truncateSync = function(...args) {
    try {
        return _fs_truncateSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.ftruncateSync = function(...args) {
    try {
        return _fs_ftruncateSync.applySync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

// Async methods
fs.readFile = function(...args) {
    return _fs_readFile.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error, data) => {
                arg(convertErrorObject(error), convertArrayBufferToBufferSafe(data));
            });
        }
        return arg;
    }));
};

fs.writeFile = function(...args) {
    return _fs_writeFile.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error) => {
                arg(convertErrorObject(error));
            });
        }
        return arg;
    }));
};

fs.appendFile = function(...args) {
    return _fs_appendFile.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error) => {
                arg(convertErrorObject(error));
            });
        }
        return arg;
    }));
};

fs.stat = function(...args) {
    return _fs_stat.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error, stats) => {
                arg(convertErrorObject(error), convertStatsToNodeFormat(stats));
            });
        }
        return arg;
    }));
};

fs.readdir = function(...args) {
    return _fs_readdir.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error, files) => {
                arg(convertErrorObject(error), files);
            });
        }
        return arg;
    }));
};

fs.access = function(...args) {
    return _fs_access.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error) => {
                arg(convertErrorObject(error));
            });
        }
        return arg;
    }));
};

fs.mkdir = function(...args) {
    return _fs_mkdir.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error) => {
                arg(convertErrorObject(error));
            });
        }
        return arg;
    }));
};

fs.unlink = function(...args) {
    return _fs_unlink.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error) => {
                arg(convertErrorObject(error));
            });
        }
        return arg;
    }));
};

fs.rmdir = function(...args) {
    return _fs_rmdir.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error) => {
                arg(convertErrorObject(error));
            });
        }
        return arg;
    }));
};

fs.rename = function(...args) {
    return _fs_rename.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error) => {
                arg(convertErrorObject(error));
            });
        }
        return arg;
    }));
};

fs.copyFile = function(...args) {
    return _fs_copyFile.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error) => {
                arg(convertErrorObject(error));
            });
        }
        return arg;
    }));
};

fs.chmod = function(...args) {
    return _fs_chmod.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error) => {
                arg(convertErrorObject(error));
            });
        }
        return arg;
    }));
};

fs.chown = function(...args) {
    return _fs_chown.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error) => {
                arg(convertErrorObject(error));
            });
        }
        return arg;
    }));
};

fs.open = function(...args) {
    return _fs_open.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error, fd) => {
                arg(convertErrorObject(error), fd);
            });
        }
        return arg;
    }));
};

fs.close = function(...args) {
    return _fs_close.apply(undefined, args.map(arg => {
        if (typeof arg === 'function') {
            return new ivm.Reference((error) => {
                arg(convertErrorObject(error));
            });
        }
        return arg;
    }));
};

fs.read = function(fd, buffer, offset, length, position, callback) {
    const originalBuffer = buffer;
    // Convert buffer to ArrayBuffer for transfer to host
    const bufferArrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    
    return _fs_read.applySync(undefined, [
        fd,
        bufferArrayBuffer,
        offset,
        length,
        position,
        new ivm.Reference((error, bytesRead, filledArrayBuffer) => {
            // Convert filled ArrayBuffer back to Buffer and copy to original buffer
            const filledBuffer = convertArrayBufferToBufferSafe(filledArrayBuffer);
            if (filledBuffer && originalBuffer) {
                filledBuffer.copy(originalBuffer);
            }
            callback(convertErrorObject(error), bytesRead, originalBuffer);
        })
    ]);
};

fs.write = function(fd, buffer, offsetOrCallback, lengthOrCallback, positionOrCallback, callback) {
    const originalBuffer = buffer;
    // Convert buffer to ArrayBuffer for transfer to host
    const bufferArrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    
    // Handle various overload signatures
    const args = [fd, bufferArrayBuffer];
    let actualCallback;
    
    if (typeof offsetOrCallback === 'function') {
        actualCallback = offsetOrCallback;
    } else {
        args.push(offsetOrCallback);
        if (typeof lengthOrCallback === 'function') {
            actualCallback = lengthOrCallback;
        } else {
            args.push(lengthOrCallback);
            if (typeof positionOrCallback === 'function') {
                actualCallback = positionOrCallback;
            } else {
                args.push(positionOrCallback);
                actualCallback = callback;
            }
        }
    }
    
    args.push(new ivm.Reference((error, bytesWritten) => {
        actualCallback(convertErrorObject(error), bytesWritten, originalBuffer);
    }));
    
    return _fs_write.applySync(undefined, args);
};

// Promise methods
fs.promises = {};

fs.promises.readFile = async function(...args) {
    try {
        const data = await _fs_promises_readFile.applyPromiseSync(undefined, args);
        return convertArrayBufferToBufferSafe(data);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.writeFile = async function(...args) {
    try {
        return await _fs_promises_writeFile.applyPromiseSync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.appendFile = async function(...args) {
    try {
        return await _fs_promises_appendFile.applyPromiseSync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.stat = async function(...args) {
    try {
        const stats = await _fs_promises_stat.applyPromiseSync(undefined, args);
        return convertStatsToNodeFormat(stats);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.readdir = async function(...args) {
    try {
        return await _fs_promises_readdir.applyPromiseSync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.access = async function(...args) {
    try {
        return await _fs_promises_access.applyPromiseSync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.mkdir = async function(...args) {
    try {
        return await _fs_promises_mkdir.applyPromiseSync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.unlink = async function(...args) {
    try {
        return await _fs_promises_unlink.applyPromiseSync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.rmdir = async function(...args) {
    try {
        return await _fs_promises_rmdir.applyPromiseSync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.rename = async function(...args) {
    try {
        return await _fs_promises_rename.applyPromiseSync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.copyFile = async function(...args) {
    try {
        return await _fs_promises_copyFile.applyPromiseSync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.chmod = async function(...args) {
    try {
        return await _fs_promises_chmod.applyPromiseSync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

fs.promises.chown = async function(...args) {
    try {
        return await _fs_promises_chown.applyPromiseSync(undefined, args);
    }
    catch (err) {
        throw convertErrorObject(err);
    }
};

// Stream methods (not supported)
fs.createReadStream = function() {
    throw new Error('fs.createReadStream() is not supported in isolated environment');
};

fs.createWriteStream = function() {
    throw new Error('fs.createWriteStream() is not supported in isolated environment');
};

// Constants - use host's fs.constants values
fs.constants = _fs_constants;
