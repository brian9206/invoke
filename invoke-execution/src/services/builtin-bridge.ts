import ivm from 'isolated-vm';
import mime from 'mime-types';
import net from 'net';
import crypto from 'crypto';
import zlib from 'zlib';
import tls from 'tls';
import dns from 'dns';
import NetworkPolicy from './network-policy';

/**
 * Builtin module bridge for isolated-vm context
 * Provides access to Node.js core modules within the VM
 *
 * Architecture: Uses flattened globals with naming convention _moduleName_methodName
 * This allows the VM to reconstruct module objects generically without hardcoded structure
 */
export default class BuiltinBridge {
  static async setupAll(
    context: ivm.Context,
    fsModule: any,
    pathModule: any,
    networkPolicy: NetworkPolicy,
    consoleLog: (msg: string) => void,
  ): Promise<void> {
    this.setupFS(context, fsModule);
    this.setupPath(context, pathModule);
    this.setupMimeTypes(context);
    this.setupCrypto(context);
    this.setupZlib(context);
    this.setupNet(context, networkPolicy, consoleLog);
    this.setupTLS(context, networkPolicy, consoleLog);
    this.setupDNS(context);
  }

  static setupFS(context: ivm.Context, fsModule: any): void {
    function convertErrorObject(value: any): any {
      if (!value || typeof value.message !== 'string') {
        return value;
      }
      return new Error('__FS_ERROR__:' + JSON.stringify(value));
    }

    context.global.setSync(
      '_fs_readFileSync',
      new ivm.Reference((path: any, encoding: any) => {
        try {
          if (encoding === null || encoding === undefined) {
            const buffer = fsModule.readFileSync(path);
            return BuiltinBridge._bufferToArrayBuffer(buffer);
          }
          return fsModule.readFileSync(path, encoding);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_writeFileSync',
      new ivm.Reference((path: any, data: any, encoding: any) => {
        try {
          if (data instanceof ArrayBuffer) {
            data = BuiltinBridge._arrayBufferToBuffer(data);
          }
          return fsModule.writeFileSync(path, data, encoding);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_appendFileSync',
      new ivm.Reference((path: any, data: any, encoding: any) => {
        try {
          if (data instanceof ArrayBuffer) {
            data = BuiltinBridge._arrayBufferToBuffer(data);
          }
          return fsModule.appendFileSync(path, data, encoding);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_statSync',
      new ivm.Reference((path: any) => {
        try {
          const stats = fsModule.statSync(path);
          return BuiltinBridge._serializeStats(stats);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_readdirSync',
      new ivm.Reference((path: any, options: any) => {
        try {
          return fsModule.readdirSync(path, options);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_existsSync',
      new ivm.Reference((path: any) => {
        try {
          return fsModule.existsSync(path);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_accessSync',
      new ivm.Reference((path: any, mode: any) => {
        try {
          return fsModule.accessSync(path, mode);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_mkdirSync',
      new ivm.Reference((path: any, options: any) => {
        try {
          return fsModule.mkdirSync(path, options);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_unlinkSync',
      new ivm.Reference((path: any) => {
        try {
          return fsModule.unlinkSync(path);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_rmdirSync',
      new ivm.Reference((path: any, options: any) => {
        try {
          return fsModule.rmdirSync(path, options);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_renameSync',
      new ivm.Reference((oldPath: any, newPath: any) => {
        try {
          return fsModule.renameSync(oldPath, newPath);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_copyFileSync',
      new ivm.Reference((src: any, dest: any, flags: any) => {
        try {
          return fsModule.copyFileSync(src, dest, flags);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_chmodSync',
      new ivm.Reference((path: any, mode: any) => {
        try {
          return fsModule.chmodSync(path, mode);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_chownSync',
      new ivm.Reference((path: any, uid: any, gid: any) => {
        try {
          return fsModule.chownSync(path, uid, gid);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_openSync',
      new ivm.Reference((path: any, flags: any, mode: any) => {
        try {
          return fsModule.openSync(path, flags, mode);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_closeSync',
      new ivm.Reference((fd: any) => {
        try {
          return fsModule.closeSync(fd);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_readSync',
      new ivm.Reference((fd: any, buffer: any, offset: any, length: any, position: any) => {
        try {
          if (buffer instanceof ArrayBuffer) {
            buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
          }
          const bytesRead = fsModule.readSync(fd, buffer, offset, length, position);
          return new ivm.ExternalCopy({
            bytesRead,
            buffer: BuiltinBridge._bufferToArrayBuffer(buffer),
          }).copyInto();
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_writeSync',
      new ivm.Reference((fd: any, buffer: any, offset: any, length: any, position: any) => {
        try {
          if (buffer instanceof ArrayBuffer) {
            buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
          }
          return fsModule.writeSync(fd, buffer, offset, length, position);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_truncateSync',
      new ivm.Reference((path: any, len: any) => {
        try {
          return fsModule.truncateSync(path, len);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_ftruncateSync',
      new ivm.Reference((fd: any, len: any) => {
        try {
          return fsModule.ftruncateSync(fd, len);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    // Async callback methods
    context.global.setSync(
      '_fs_readFile',
      new ivm.Reference((path: any, encodingOrCallback: any, callback: any) => {
        const actualCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
        const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
        fsModule.readFile(path, encoding, (err: any, data: any) => {
          if (!err && !encoding && Buffer.isBuffer(data)) {
            data = BuiltinBridge._bufferToArrayBuffer(data);
          }
          actualCallback.applySync(undefined, [convertErrorObject(err), data], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_writeFile',
      new ivm.Reference((path: any, data: any, encodingOrCallback: any, callback: any) => {
        const actualCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
        const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
        if (data instanceof ArrayBuffer) {
          data = BuiltinBridge._arrayBufferToBuffer(data);
        }
        fsModule.writeFile(path, data, encoding, (err: any) => {
          actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_appendFile',
      new ivm.Reference((path: any, data: any, encodingOrCallback: any, callback: any) => {
        const actualCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
        const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
        if (data instanceof ArrayBuffer) {
          data = BuiltinBridge._arrayBufferToBuffer(data);
        }
        fsModule.appendFile(path, data, encoding, (err: any) => {
          actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_stat',
      new ivm.Reference((path: any, callback: any) => {
        fsModule.stat(path, (err: any, stats: any) => {
          const serializedStats = stats ? BuiltinBridge._serializeStats(stats) : null;
          callback.applySync(undefined, [convertErrorObject(err), serializedStats], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_readdir',
      new ivm.Reference((path: any, optionsOrCallback: any, callback: any) => {
        const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
        const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;
        fsModule.readdir(path, options, (err: any, files: any) => {
          actualCallback.applySync(undefined, [convertErrorObject(err), files], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_access',
      new ivm.Reference((path: any, modeOrCallback: any, callback: any) => {
        const actualCallback = typeof modeOrCallback === 'function' ? modeOrCallback : callback;
        const mode = typeof modeOrCallback === 'number' ? modeOrCallback : undefined;
        fsModule.access(path, mode, (err: any) => {
          actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_mkdir',
      new ivm.Reference((path: any, optionsOrCallback: any, callback: any) => {
        const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
        const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;
        fsModule.mkdir(path, options, (err: any) => {
          actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_unlink',
      new ivm.Reference((path: any, callback: any) => {
        fsModule.unlink(path, (err: any) => {
          callback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_rmdir',
      new ivm.Reference((path: any, optionsOrCallback: any, callback: any) => {
        const actualCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
        const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : undefined;
        fsModule.rmdir(path, options, (err: any) => {
          actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_rename',
      new ivm.Reference((oldPath: any, newPath: any, callback: any) => {
        fsModule.rename(oldPath, newPath, (err: any) => {
          callback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_copyFile',
      new ivm.Reference((src: any, dest: any, flagsOrCallback: any, callback: any) => {
        const actualCallback = typeof flagsOrCallback === 'function' ? flagsOrCallback : callback;
        const flags = typeof flagsOrCallback === 'number' ? flagsOrCallback : undefined;
        fsModule.copyFile(src, dest, flags, (err: any) => {
          actualCallback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_chmod',
      new ivm.Reference((path: any, mode: any, callback: any) => {
        fsModule.chmod(path, mode, (err: any) => {
          callback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_chown',
      new ivm.Reference((path: any, uid: any, gid: any, callback: any) => {
        fsModule.chown(path, uid, gid, (err: any) => {
          callback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_open',
      new ivm.Reference((path: any, flags: any, modeOrCallback: any, callback: any) => {
        const actualCallback = typeof modeOrCallback === 'function' ? modeOrCallback : callback;
        const mode = typeof modeOrCallback === 'number' ? modeOrCallback : undefined;
        fsModule.open(path, flags, mode, (err: any, fd: any) => {
          actualCallback.applySync(undefined, [convertErrorObject(err), fd], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_close',
      new ivm.Reference((fd: any, callback: any) => {
        fsModule.close(fd, (err: any) => {
          callback.applySync(undefined, [convertErrorObject(err)], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_fs_read',
      new ivm.Reference((fd: any, buffer: any, offset: any, length: any, position: any, callback: any) => {
        if (buffer instanceof ArrayBuffer) {
          buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
        }
        fsModule.read(fd, buffer, offset, length, position, (err: any, bytesRead: any) => {
          const bufferArrayBuffer = BuiltinBridge._bufferToArrayBuffer(buffer);
          callback.applySync(undefined, [convertErrorObject(err), bytesRead, bufferArrayBuffer], {
            arguments: { copy: true },
          });
        });
      }),
    );

    context.global.setSync(
      '_fs_write',
      new ivm.Reference(
        (
          fd: any,
          buffer: any,
          offsetOrCallback: any,
          lengthOrCallback: any,
          positionOrCallback: any,
          callback: any,
        ) => {
          let actualCallback: any, offset: any, length: any, position: any;
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
          fsModule.write(fd, buffer, offset, length, position, (err: any, bytesWritten: any) => {
            actualCallback.applySync(undefined, [convertErrorObject(err), bytesWritten], {
              arguments: { copy: true },
            });
          });
        },
      ),
    );

    context.global.setSync(
      '_fs_createReadStream',
      new ivm.Reference((_path: any, _options: any) => {
        throw new Error('fs.createReadStream() is not supported in isolated environment');
      }),
    );

    context.global.setSync(
      '_fs_createWriteStream',
      new ivm.Reference((_path: any, _options: any) => {
        throw new Error('fs.createWriteStream() is not supported in isolated environment');
      }),
    );

    // fs.promises API
    context.global.setSync(
      '_fs_promises_readFile',
      new ivm.Reference(async (path: any, encoding: any) => {
        try {
          if (encoding === null || encoding === undefined) {
            const buffer = await fsModule.promises.readFile(path);
            return BuiltinBridge._bufferToArrayBuffer(buffer);
          }
          return await fsModule.promises.readFile(path, encoding);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_writeFile',
      new ivm.Reference(async (path: any, data: any, encoding: any) => {
        try {
          if (data instanceof ArrayBuffer) {
            data = BuiltinBridge._arrayBufferToBuffer(data);
          }
          return await fsModule.promises.writeFile(path, data, encoding);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_appendFile',
      new ivm.Reference(async (path: any, data: any, encoding: any) => {
        try {
          if (data instanceof ArrayBuffer) {
            data = BuiltinBridge._arrayBufferToBuffer(data);
          }
          return await fsModule.promises.appendFile(path, data, encoding);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_stat',
      new ivm.Reference(async (path: any) => {
        try {
          const stats = await fsModule.promises.stat(path);
          return BuiltinBridge._serializeStats(stats);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_readdir',
      new ivm.Reference(async (path: any, options: any) => {
        try {
          return await fsModule.promises.readdir(path, options);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_access',
      new ivm.Reference(async (path: any, mode: any) => {
        try {
          return await fsModule.promises.access(path, mode);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_mkdir',
      new ivm.Reference(async (path: any, options: any) => {
        try {
          return await fsModule.promises.mkdir(path, options);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_unlink',
      new ivm.Reference(async (path: any) => {
        try {
          return await fsModule.promises.unlink(path);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_rmdir',
      new ivm.Reference(async (path: any, options: any) => {
        try {
          return await fsModule.promises.rmdir(path, options);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_rename',
      new ivm.Reference(async (oldPath: any, newPath: any) => {
        try {
          return await fsModule.promises.rename(oldPath, newPath);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_copyFile',
      new ivm.Reference(async (src: any, dest: any, flags: any) => {
        try {
          return await fsModule.promises.copyFile(src, dest, flags);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_chmod',
      new ivm.Reference(async (path: any, mode: any) => {
        try {
          return await fsModule.promises.chmod(path, mode);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.setSync(
      '_fs_promises_chown',
      new ivm.Reference(async (path: any, uid: any, gid: any) => {
        try {
          return await fsModule.promises.chown(path, uid, gid);
        } catch (err: any) {
          throw convertErrorObject(err);
        }
      }),
    );

    context.global.set('_fs_constants', fsModule.constants, { copy: true });
  }

  static setupPath(context: ivm.Context, pathModule: any): void {
    context.global.set('_path_sep', pathModule.sep);
    context.global.set('_path_delimiter', pathModule.delimiter);
    context.global.setSync('_path_normalize', new ivm.Reference((p: any) => pathModule.normalize(p)));
    context.global.setSync('_path_join', new ivm.Reference((...args: any[]) => pathModule.join(...args)));
    context.global.setSync('_path_resolve', new ivm.Reference((...args: any[]) => pathModule.resolve(...args)));
    context.global.setSync('_path_dirname', new ivm.Reference((p: any) => pathModule.dirname(p)));
    context.global.setSync(
      '_path_basename',
      new ivm.Reference((p: any, ext: any) => pathModule.basename(p, ext)),
    );
    context.global.setSync('_path_extname', new ivm.Reference((p: any) => pathModule.extname(p)));
    context.global.setSync('_path_isAbsolute', new ivm.Reference((p: any) => pathModule.isAbsolute(p)));
    context.global.setSync(
      '_path_relative',
      new ivm.Reference((from: any, to: any) => pathModule.relative(from, to)),
    );
    context.global.setSync(
      '_path_parse',
      new ivm.Reference((p: any) => {
        const result = pathModule.parse(p);
        return new ivm.ExternalCopy(result).copyInto();
      }),
    );
    context.global.setSync('_path_format', new ivm.Reference((obj: any) => pathModule.format(obj)));
  }

  static setupMimeTypes(context: ivm.Context): void {
    context.global.setSync(
      '_mime_types_lookup',
      new ivm.Reference((...args: any[]) => mime.lookup(...(args as [string]))),
    );
    context.global.setSync(
      '_mime_types_contentType',
      new ivm.Reference((...args: any[]) => mime.contentType(...(args as [string]))),
    );
    context.global.setSync(
      '_mime_types_extension',
      new ivm.Reference((...args: any[]) => mime.extension(...(args as [string]))),
    );
    context.global.setSync(
      '_mime_types_charset',
      new ivm.Reference((...args: any[]) => mime.charset(...(args as [string]))),
    );
    context.global.setSync('_mime_types_types', new ivm.Reference((arg: any) => (mime.types as any)[arg]));
    context.global.setSync(
      '_mime_types_extensions',
      new ivm.Reference((arg: any) => (mime.extensions as any)[arg]),
    );
  }

  static setupNet(
    context: ivm.Context,
    networkPolicy: NetworkPolicy,
    consoleLog: (msg: string) => void,
  ): void {
    const netHandles = new Map<number, net.Socket>();
    let handleCounter = 0;

    function createHandle(obj: net.Socket): number {
      const handleId = ++handleCounter;
      netHandles.set(handleId, obj);
      return handleId;
    }

    function getHandle(handleId: number): net.Socket {
      const obj = netHandles.get(handleId);
      if (!obj) {
        throw new Error('Invalid net handle');
      }
      return obj;
    }

    function removeHandle(handleId: number): void {
      netHandles.delete(handleId);
    }

    context.global.setSync(
      '_net_createSocket',
      new ivm.Reference(() => {
        const socket = new net.Socket();
        const handleId = createHandle(socket);
        socket.once('close', () => {
          removeHandle(handleId);
        });
        return handleId;
      }),
    );

    context.global.setSync(
      '_net_createConnection',
      new ivm.Reference((port: any, host: any, connectCallback: any) => {
        const handleId = ++handleCounter;

        if (port === undefined || port === null) {
          const socket = new net.Socket();
          netHandles.set(handleId, socket);
          socket.once('close', () => {
            netHandles.delete(handleId);
          });
          return handleId;
        }

        if (!networkPolicy) {
          const socket = new net.Socket();
          netHandles.set(handleId, socket);
          socket.once('close', () => {
            netHandles.delete(handleId);
          });
          socket.once('connect', () => {
            if (connectCallback) {
              connectCallback.applyIgnored(undefined, [null]);
            }
          });
          socket.once('error', (err: any) => {
            const errorObj = {
              message: err instanceof Error ? err.message : String(err),
              code: err.code || 'ECONNREFUSED',
              errno: err.errno,
              syscall: err.syscall,
            };
            if (connectCallback) {
              connectCallback.applyIgnored(undefined, [errorObj]);
            }
          });
          socket.connect(port, host);
          return handleId;
        }

        const socket = new net.Socket();
        netHandles.set(handleId, socket);
        socket.once('close', () => {
          netHandles.delete(handleId);
        });
        socket.once('connect', () => {
          if (connectCallback) {
            connectCallback.applyIgnored(undefined, [null]);
          }
        });
        socket.once('error', (err: any) => {
          const errorObj = {
            message: err instanceof Error ? err.message : String(err),
            code: err.code || 'ECONNREFUSED',
            errno: err.errno,
            syscall: err.syscall,
          };
          if (connectCallback) {
            connectCallback.applyIgnored(undefined, [errorObj]);
          }
        });

        socket.connect(port, host);

        (async () => {
          try {
            const result = await networkPolicy.evaluatePolicy(host, consoleLog);
            if (!result.allowed) {
              if (consoleLog) {
                consoleLog(`[Network] Connection to ${host} denied: ${result.reason}`);
              }
              const error = new Error(result.reason) as NodeJS.ErrnoException;
              error.code = 'POLICY_DENIED';
              error.errno = 'POLICY_DENIED' as any;
              error.syscall = 'connect';
              socket.destroy(error);
            }
          } catch (err: any) {
            const error = new Error(err.message || 'Policy evaluation failed') as NodeJS.ErrnoException;
            error.code = 'POLICY_ERROR';
            error.errno = 'POLICY_ERROR' as any;
            error.syscall = 'connect';
            socket.destroy(error);
          }
        })();

        return handleId;
      }),
    );

    context.global.setSync(
      '_net_socketWrite',
      new ivm.Reference((handleId: any, data: any, callback: any) => {
        const socket = getHandle(handleId);
        if (data instanceof ArrayBuffer) {
          data = BuiltinBridge._arrayBufferToBuffer(data);
        }
        try {
          return socket.write(data, (err: any) => {
            if (callback) {
              callback.applyIgnored(undefined, [err]);
            }
          });
        } catch (err: any) {
          throw err;
        }
      }),
    );

    context.global.setSync(
      '_net_socketRead',
      new ivm.Reference((handleId: any, size: any) => {
        const socket = getHandle(handleId);
        const data = socket.read(size);
        if (data && Buffer.isBuffer(data)) {
          return BuiltinBridge._bufferToArrayBuffer(data);
        }
        return data;
      }),
    );

    context.global.setSync(
      '_net_socketDestroy',
      new ivm.Reference((handleId: any) => {
        const socket = getHandle(handleId);
        socket.destroy();
        removeHandle(handleId);
      }),
    );

    context.global.setSync(
      '_net_socketConnect',
      new ivm.Reference((handleId: any, port: any, host: any, connectCallback: any) => {
        const socket = getHandle(handleId);

        if (networkPolicy) {
          networkPolicy
            .evaluatePolicy(host, consoleLog)
            .then((result) => {
              if (!result.allowed) {
                const errorObj = { message: result.reason, code: 'POLICY_DENIED' };
                if (connectCallback) {
                  connectCallback.applyIgnored(undefined, [errorObj]);
                }
                socket.destroy();
                return;
              }
              setupAndConnect();
            })
            .catch((err: any) => {
              if (connectCallback) {
                connectCallback.applyIgnored(undefined, [
                  { message: err.message || 'Policy evaluation failed', code: 'POLICY_ERROR' },
                ]);
              }
            });
          return;
        }

        setupAndConnect();

        function setupAndConnect() {
          if (connectCallback) {
            socket.once('connect', () => {
              connectCallback.applyIgnored(undefined, [null]);
            });
            socket.once('error', (err: any) => {
              const errorObj = {
                message: err instanceof Error ? err.message : String(err),
                code: err.code || 'ECONNREFUSED',
                errno: err.errno,
                syscall: err.syscall,
              };
              connectCallback.applyIgnored(undefined, [errorObj]);
            });
          }
          socket.connect(port, host);
        }
      }),
    );

    context.global.setSync(
      '_net_socketEnd',
      new ivm.Reference((handleId: any, callback: any) => {
        const socket = getHandle(handleId);
        if (callback) {
          socket.end(() => {
            callback.applyIgnored(undefined, [null]);
          });
        } else {
          socket.end();
        }
      }),
    );

    context.global.setSync(
      '_net_socketPause',
      new ivm.Reference((handleId: any) => {
        const socket = getHandle(handleId);
        socket.pause();
      }),
    );

    context.global.setSync(
      '_net_socketResume',
      new ivm.Reference((handleId: any) => {
        const socket = getHandle(handleId);
        socket.resume();
      }),
    );

    context.global.setSync(
      '_net_socketSetTimeout',
      new ivm.Reference((handleId: any, timeout: any, callback: any) => {
        const socket = getHandle(handleId);
        if (callback) {
          socket.setTimeout(timeout, () => {
            callback.applyIgnored(undefined, []);
          });
        } else {
          socket.setTimeout(timeout);
        }
      }),
    );

    context.global.setSync(
      '_net_socketSetNoDelay',
      new ivm.Reference((handleId: any, noDelay: any) => {
        const socket = getHandle(handleId);
        socket.setNoDelay(noDelay);
      }),
    );

    context.global.setSync(
      '_net_socketSetKeepAlive',
      new ivm.Reference((handleId: any, enable: any, initialDelay: any) => {
        const socket = getHandle(handleId);
        socket.setKeepAlive(enable, initialDelay);
      }),
    );

    context.global.setSync(
      '_net_socketGetLocalAddress',
      new ivm.Reference((handleId: any) => getHandle(handleId).localAddress),
    );
    context.global.setSync(
      '_net_socketGetLocalPort',
      new ivm.Reference((handleId: any) => getHandle(handleId).localPort),
    );
    context.global.setSync(
      '_net_socketGetRemoteAddress',
      new ivm.Reference((handleId: any) => getHandle(handleId).remoteAddress),
    );
    context.global.setSync(
      '_net_socketGetRemotePort',
      new ivm.Reference((handleId: any) => getHandle(handleId).remotePort),
    );
    context.global.setSync(
      '_net_socketGetRemoteFamily',
      new ivm.Reference((handleId: any) => getHandle(handleId).remoteFamily),
    );
    context.global.setSync(
      '_net_socketGetBytesRead',
      new ivm.Reference((handleId: any) => getHandle(handleId).bytesRead),
    );
    context.global.setSync(
      '_net_socketGetBytesWritten',
      new ivm.Reference((handleId: any) => getHandle(handleId).bytesWritten),
    );
    context.global.setSync(
      '_net_socketGetReadyState',
      new ivm.Reference((handleId: any) => getHandle(handleId).readyState),
    );

    context.global.setSync(
      '_net_socketOn',
      new ivm.Reference((handleId: any, event: any, listener: any) => {
        const socket = getHandle(handleId);
        socket.on(event, function (...args: any[]) {
          try {
            if (event === 'data' && args.length > 0 && Buffer.isBuffer(args[0])) {
              const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(args[0]);
              listener.applySync(undefined, [arrayBuffer], { arguments: { copy: true } });
            } else if (event === 'error' && args.length > 0) {
              const error = args[0];
              const errorObj: any = {
                message: error instanceof Error ? error.message : String(error),
                code:
                  typeof error.code === 'string' || typeof error.code === 'number'
                    ? error.code
                    : 'UNKNOWN_ERROR',
                errno:
                  typeof error.errno === 'string' || typeof error.errno === 'number'
                    ? error.errno
                    : undefined,
                syscall: typeof error.syscall === 'string' ? error.syscall : undefined,
              };
              Object.keys(errorObj).forEach((key) => {
                if (errorObj[key] === undefined) {
                  delete errorObj[key];
                }
              });
              const transferableError = new Error('__NET_ERROR__:' + JSON.stringify(errorObj));
              listener.applySync(undefined, [transferableError], { arguments: { copy: true } });
            } else {
              const safeArgs = args.map((arg) => {
                if (arg === null || arg === undefined) return arg;
                if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean')
                  return arg;
                if (Buffer.isBuffer(arg)) return BuiltinBridge._bufferToArrayBuffer(arg);
                if (typeof arg === 'object') {
                  try {
                    return JSON.parse(JSON.stringify(arg));
                  } catch {
                    return String(arg);
                  }
                }
                return String(arg);
              });
              listener.applySync(undefined, safeArgs, { arguments: { copy: true } });
            }
          } catch (err: any) {
            if (err && err.message && err.message.includes('Isolated is disposed')) return;
            console.error('Error in socket event listener for', event, ':', err);
          }
        });
      }),
    );

    context.global.setSync(
      '_net_socketOnce',
      new ivm.Reference((handleId: any, event: any, listener: any) => {
        const socket = getHandle(handleId);
        socket.once(event, function (...args: any[]) {
          try {
            if (event === 'data' && args.length > 0 && Buffer.isBuffer(args[0])) {
              const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(args[0]);
              listener.applySync(undefined, [arrayBuffer], { arguments: { copy: true } });
            } else if (event === 'error' && args.length > 0) {
              const error = args[0];
              const errorObj: any = {
                message: error instanceof Error ? error.message : String(error),
                code:
                  typeof error.code === 'string' || typeof error.code === 'number'
                    ? error.code
                    : 'UNKNOWN_ERROR',
                errno:
                  typeof error.errno === 'string' || typeof error.errno === 'number'
                    ? error.errno
                    : undefined,
                syscall: typeof error.syscall === 'string' ? error.syscall : undefined,
              };
              Object.keys(errorObj).forEach((key) => {
                if (errorObj[key] === undefined) {
                  delete errorObj[key];
                }
              });
              const transferableError = new Error('__NET_ERROR__:' + JSON.stringify(errorObj));
              listener.applySync(undefined, [transferableError], { arguments: { copy: true } });
            } else {
              const safeArgs = args.map((arg) => {
                if (arg === null || arg === undefined) return arg;
                if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean')
                  return arg;
                if (Buffer.isBuffer(arg)) return BuiltinBridge._bufferToArrayBuffer(arg);
                if (typeof arg === 'object') {
                  try {
                    return JSON.parse(JSON.stringify(arg));
                  } catch {
                    return String(arg);
                  }
                }
                return String(arg);
              });
              listener.applySync(undefined, safeArgs, { arguments: { copy: true } });
            }
          } catch (err: any) {
            if (err && err.message && err.message.includes('Isolated is disposed')) return;
            console.error('Error in socket once event listener for', event, ':', err);
          }
        });
      }),
    );

    context.global.setSync(
      '_net_socketRemoveListener',
      new ivm.Reference((handleId: any, event: any, listener: any) => {
        const socket = getHandle(handleId);
        socket.removeListener(event, listener);
      }),
    );
  }

  static setupCrypto(context: ivm.Context): void {
    const cryptoHandles = new Map<number, any>();
    let handleCounter = 0;

    function createHandle(obj: any): number {
      const handleId = ++handleCounter;
      cryptoHandles.set(handleId, obj);
      return handleId;
    }

    function getHandle(handleId: number): any {
      const obj = cryptoHandles.get(handleId);
      if (!obj) {
        throw new Error('Invalid crypto handle');
      }
      return obj;
    }

    context.global.setSync(
      '_crypto_randomBytes',
      new ivm.Reference((size: any) => {
        const buffer = crypto.randomBytes(size);
        return BuiltinBridge._bufferToArrayBuffer(buffer);
      }),
    );

    context.global.setSync(
      '_crypto_randomUUID',
      new ivm.Reference(() => crypto.randomUUID()),
    );

    context.global.setSync(
      '_crypto_randomInt',
      new ivm.Reference((min: any, max: any) => {
        if (min === undefined && max !== undefined) {
          return crypto.randomInt(max);
        } else if (max === undefined) {
          return crypto.randomInt(min);
        }
        return crypto.randomInt(min, max);
      }),
    );

    context.global.setSync(
      '_crypto_pbkdf2Sync',
      new ivm.Reference((password: any, salt: any, iterations: any, keylen: any, digest: any) => {
        if (password instanceof ArrayBuffer) {
          password = BuiltinBridge._arrayBufferToBuffer(password);
        }
        if (salt instanceof ArrayBuffer) {
          salt = BuiltinBridge._arrayBufferToBuffer(salt);
        }
        const result = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest);
        return BuiltinBridge._bufferToArrayBuffer(result);
      }),
    );

    context.global.setSync(
      '_crypto_pbkdf2',
      new ivm.Reference(
        (password: any, salt: any, iterations: any, keylen: any, digest: any, callback: any) => {
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
              callback.applyIgnored(undefined, [null, BuiltinBridge._bufferToArrayBuffer(derivedKey)]);
            }
          });
        },
      ),
    );

    context.global.setSync(
      '_crypto_createHash',
      new ivm.Reference((algorithm: any) => createHandle(crypto.createHash(algorithm))),
    );

    context.global.setSync(
      '_crypto_hashUpdate',
      new ivm.Reference((handle: any, data: any, inputEncoding: any) => {
        const hash = getHandle(handle);
        if (data instanceof ArrayBuffer) {
          data = BuiltinBridge._arrayBufferToBuffer(data);
        }
        hash.update(data, inputEncoding);
        return handle;
      }),
    );

    context.global.setSync(
      '_crypto_hashDigest',
      new ivm.Reference((handle: any, encoding: any) => {
        const hash = getHandle(handle);
        const result = hash.digest(encoding);
        if (!encoding) {
          return BuiltinBridge._bufferToArrayBuffer(result);
        }
        return result;
      }),
    );

    context.global.setSync(
      '_crypto_createHmac',
      new ivm.Reference((algorithm: any, key: any) => {
        if (key instanceof ArrayBuffer) {
          key = BuiltinBridge._arrayBufferToBuffer(key);
        }
        return createHandle(crypto.createHmac(algorithm, key));
      }),
    );

    context.global.setSync(
      '_crypto_hmacUpdate',
      new ivm.Reference((handle: any, data: any, inputEncoding: any) => {
        const hmac = getHandle(handle);
        if (data instanceof ArrayBuffer) {
          data = BuiltinBridge._arrayBufferToBuffer(data);
        }
        hmac.update(data, inputEncoding);
        return handle;
      }),
    );

    context.global.setSync(
      '_crypto_hmacDigest',
      new ivm.Reference((handle: any, encoding: any) => {
        const hmac = getHandle(handle);
        const result = hmac.digest(encoding);
        if (!encoding) {
          return BuiltinBridge._bufferToArrayBuffer(result);
        }
        return result;
      }),
    );

    context.global.setSync(
      '_crypto_createCipheriv',
      new ivm.Reference((algorithm: any, key: any, iv: any, options: any) => {
        if (key instanceof ArrayBuffer) key = BuiltinBridge._arrayBufferToBuffer(key);
        if (iv instanceof ArrayBuffer) iv = BuiltinBridge._arrayBufferToBuffer(iv);
        return createHandle(crypto.createCipheriv(algorithm, key, iv, options));
      }),
    );

    context.global.setSync(
      '_crypto_cipherUpdate',
      new ivm.Reference((handle: any, data: any, inputEncoding: any, outputEncoding: any) => {
        const cipher = getHandle(handle);
        if (data instanceof ArrayBuffer) data = BuiltinBridge._arrayBufferToBuffer(data);
        const result = cipher.update(data, inputEncoding, outputEncoding);
        if (!outputEncoding && Buffer.isBuffer(result)) {
          return BuiltinBridge._bufferToArrayBuffer(result);
        }
        return result;
      }),
    );

    context.global.setSync(
      '_crypto_cipherFinal',
      new ivm.Reference((handle: any, outputEncoding: any) => {
        const cipher = getHandle(handle);
        const result = cipher.final(outputEncoding);
        if (!outputEncoding && Buffer.isBuffer(result)) {
          return BuiltinBridge._bufferToArrayBuffer(result);
        }
        return result;
      }),
    );

    context.global.setSync(
      '_crypto_cipherSetAutoPadding',
      new ivm.Reference((handle: any, autoPadding: any) => {
        getHandle(handle).setAutoPadding(autoPadding);
        return handle;
      }),
    );

    context.global.setSync(
      '_crypto_cipherGetAuthTag',
      new ivm.Reference((handle: any) => {
        const tag = getHandle(handle).getAuthTag();
        return BuiltinBridge._bufferToArrayBuffer(tag);
      }),
    );

    context.global.setSync(
      '_crypto_createDecipheriv',
      new ivm.Reference((algorithm: any, key: any, iv: any, options: any) => {
        if (key instanceof ArrayBuffer) key = BuiltinBridge._arrayBufferToBuffer(key);
        if (iv instanceof ArrayBuffer) iv = BuiltinBridge._arrayBufferToBuffer(iv);
        return createHandle(crypto.createDecipheriv(algorithm, key, iv, options));
      }),
    );

    context.global.setSync(
      '_crypto_decipherUpdate',
      new ivm.Reference((handle: any, data: any, inputEncoding: any, outputEncoding: any) => {
        const decipher = getHandle(handle);
        if (data instanceof ArrayBuffer) data = BuiltinBridge._arrayBufferToBuffer(data);
        const result = decipher.update(data, inputEncoding, outputEncoding);
        if (!outputEncoding && Buffer.isBuffer(result)) {
          return BuiltinBridge._bufferToArrayBuffer(result);
        }
        return result;
      }),
    );

    context.global.setSync(
      '_crypto_decipherFinal',
      new ivm.Reference((handle: any, outputEncoding: any) => {
        const decipher = getHandle(handle);
        const result = decipher.final(outputEncoding);
        if (!outputEncoding && Buffer.isBuffer(result)) {
          return BuiltinBridge._bufferToArrayBuffer(result);
        }
        return result;
      }),
    );

    context.global.setSync(
      '_crypto_decipherSetAutoPadding',
      new ivm.Reference((handle: any, autoPadding: any) => {
        getHandle(handle).setAutoPadding(autoPadding);
        return handle;
      }),
    );

    context.global.setSync(
      '_crypto_decipherSetAuthTag',
      new ivm.Reference((handle: any, buffer: any) => {
        if (buffer instanceof ArrayBuffer) buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
        getHandle(handle).setAuthTag(buffer);
        return handle;
      }),
    );

    context.global.setSync(
      '_crypto_generateKeyPairSync',
      new ivm.Reference((type: any, options: any) => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync(type, options) as unknown as { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
        const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
        const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
        return new ivm.ExternalCopy({ publicKey: publicKeyPem, privateKey: privateKeyPem }).copyInto();
      }),
    );

    context.global.setSync(
      '_crypto_generateKeyPair',
      new ivm.Reference((type: any, options: any, callback: any) => {
        crypto.generateKeyPair(type, options, (err, publicKey, privateKey) => {
          if (err) {
            callback.applyIgnored(undefined, [err, null]);
          } else {
            const publicKeyPem = (publicKey as unknown as crypto.KeyObject).export({ type: 'spki', format: 'pem' });
            const privateKeyPem = (privateKey as unknown as crypto.KeyObject).export({ type: 'pkcs8', format: 'pem' });
            const result = new ivm.ExternalCopy({
              publicKey: publicKeyPem,
              privateKey: privateKeyPem,
            }).copyInto();
            callback.applyIgnored(undefined, [null, result]);
          }
        });
      }),
    );

    context.global.setSync(
      '_crypto_sign',
      new ivm.Reference((algorithm: any, data: any, privateKey: any) => {
        if (data instanceof ArrayBuffer) data = BuiltinBridge._arrayBufferToBuffer(data);
        const signature = crypto.sign(algorithm, data, privateKey);
        return BuiltinBridge._bufferToArrayBuffer(signature);
      }),
    );

    context.global.setSync(
      '_crypto_verify',
      new ivm.Reference((algorithm: any, data: any, publicKey: any, signature: any) => {
        if (data instanceof ArrayBuffer) data = BuiltinBridge._arrayBufferToBuffer(data);
        if (signature instanceof ArrayBuffer) signature = BuiltinBridge._arrayBufferToBuffer(signature);
        return crypto.verify(algorithm, data, publicKey, signature);
      }),
    );

    context.global.setSync(
      '_crypto_createSign',
      new ivm.Reference((algorithm: any) => createHandle(crypto.createSign(algorithm))),
    );

    context.global.setSync(
      '_crypto_signUpdate',
      new ivm.Reference((handle: any, data: any, inputEncoding: any) => {
        const sign = getHandle(handle);
        if (data instanceof ArrayBuffer) data = BuiltinBridge._arrayBufferToBuffer(data);
        sign.update(data, inputEncoding);
        return handle;
      }),
    );

    context.global.setSync(
      '_crypto_signSign',
      new ivm.Reference((handle: any, privateKey: any, outputEncoding: any) => {
        const sign = getHandle(handle);
        const signature = sign.sign(privateKey, outputEncoding);
        if (!outputEncoding && Buffer.isBuffer(signature)) {
          return BuiltinBridge._bufferToArrayBuffer(signature);
        }
        return signature;
      }),
    );

    context.global.setSync(
      '_crypto_createVerify',
      new ivm.Reference((algorithm: any) => createHandle(crypto.createVerify(algorithm))),
    );

    context.global.setSync(
      '_crypto_verifyUpdate',
      new ivm.Reference((handle: any, data: any, inputEncoding: any) => {
        const verify = getHandle(handle);
        if (data instanceof ArrayBuffer) data = BuiltinBridge._arrayBufferToBuffer(data);
        verify.update(data, inputEncoding);
        return handle;
      }),
    );

    context.global.setSync(
      '_crypto_verifyVerify',
      new ivm.Reference((handle: any, publicKey: any, signature: any, signatureEncoding: any) => {
        const verify = getHandle(handle);
        if (signature instanceof ArrayBuffer) signature = BuiltinBridge._arrayBufferToBuffer(signature);
        return verify.verify(publicKey, signature, signatureEncoding);
      }),
    );

    context.global.setSync(
      '_crypto_publicEncrypt',
      new ivm.Reference((key: any, buffer: any) => {
        if (buffer instanceof ArrayBuffer) buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
        return BuiltinBridge._bufferToArrayBuffer(crypto.publicEncrypt(key, buffer));
      }),
    );

    context.global.setSync(
      '_crypto_privateDecrypt',
      new ivm.Reference((key: any, buffer: any) => {
        if (buffer instanceof ArrayBuffer) buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
        return BuiltinBridge._bufferToArrayBuffer(crypto.privateDecrypt(key, buffer));
      }),
    );

    context.global.setSync(
      '_crypto_privateEncrypt',
      new ivm.Reference((key: any, buffer: any) => {
        if (buffer instanceof ArrayBuffer) buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
        return BuiltinBridge._bufferToArrayBuffer(crypto.privateEncrypt(key, buffer));
      }),
    );

    context.global.setSync(
      '_crypto_publicDecrypt',
      new ivm.Reference((key: any, buffer: any) => {
        if (buffer instanceof ArrayBuffer) buffer = BuiltinBridge._arrayBufferToBuffer(buffer);
        return BuiltinBridge._bufferToArrayBuffer(crypto.publicDecrypt(key, buffer));
      }),
    );

    context.global.setSync(
      '_crypto_getHashes',
      new ivm.Reference(() => new ivm.ExternalCopy(crypto.getHashes()).copyInto()),
    );

    context.global.setSync(
      '_crypto_getCiphers',
      new ivm.Reference(() => new ivm.ExternalCopy(crypto.getCiphers()).copyInto()),
    );

    context.global.setSync(
      '_crypto_timingSafeEqual',
      new ivm.Reference((a: any, b: any) => {
        if (a instanceof ArrayBuffer) a = BuiltinBridge._arrayBufferToBuffer(a);
        if (b instanceof ArrayBuffer) b = BuiltinBridge._arrayBufferToBuffer(b);
        if (!Buffer.isBuffer(a)) a = Buffer.from(a);
        if (!Buffer.isBuffer(b)) b = Buffer.from(b);
        return crypto.timingSafeEqual(a, b);
      }),
    );
  }

  static _serializeStats(stats: any): object {
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: stats.isSymbolicLink ? stats.isSymbolicLink() : false,
      size: stats.size,
      mtime: stats.mtime.toISOString(),
      atime: stats.atime ? stats.atime.toISOString() : null,
      ctime: stats.ctime ? stats.ctime.toISOString() : null,
      mode: stats.mode,
    };
  }

  static _bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; i++) {
      view[i] = buffer[i];
    }
    return new ivm.ExternalCopy(arrayBuffer).copyInto() as unknown as ArrayBuffer;
  }

  static _arrayBufferToBuffer(arrayBuffer: ArrayBuffer): Buffer {
    return Buffer.from(arrayBuffer);
  }

  static setupTLS(
    context: ivm.Context,
    networkPolicy: NetworkPolicy,
    consoleLog: (msg: string) => void,
  ): void {
    const tlsHandles = new Map<number, tls.TLSSocket>();
    let tlsHandleCounter = 0;

    function createTLSHandle(obj: tls.TLSSocket): number {
      const handleId = ++tlsHandleCounter;
      tlsHandles.set(handleId, obj);
      return handleId;
    }

    function getTLSHandle(handleId: number): tls.TLSSocket {
      const obj = tlsHandles.get(handleId);
      if (!obj) {
        throw new Error('Invalid TLS handle');
      }
      return obj;
    }

    function removeTLSHandle(handleId: number): void {
      tlsHandles.delete(handleId);
    }

    function setupTLSSocket(
      handleId: number,
      tlsSocket: tls.TLSSocket,
      callback: any,
    ): number {
      tlsHandles.set(handleId, tlsSocket);

      const dataChunks: Buffer[] = [];
      let endEmitted = false;
      let closeQueued = false;
      let closeHadError = false;

      tlsSocket.on('secureConnect', () => {
        if (callback) callback.applyIgnored(undefined, ['secureConnect', handleId]);
      });

      tlsSocket.on('connect', () => {
        if (callback) callback.applyIgnored(undefined, ['connect', handleId]);
      });

      tlsSocket.on('data', (data: Buffer) => {
        try {
          dataChunks.push(data);
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
        setImmediate(() => {
          endEmitted = true;
          if (callback) callback.applyIgnored(undefined, ['end']);
          if (closeQueued) {
            setImmediate(() => {
              if (callback) callback.applyIgnored(undefined, ['close', closeHadError]);
              removeTLSHandle(handleId);
            });
          }
        });
      });

      tlsSocket.on('close', (hadError: boolean) => {
        if (!endEmitted) {
          closeQueued = true;
          closeHadError = hadError;
          setImmediate(() => {
            if (callback) callback.applyIgnored(undefined, ['end']);
            endEmitted = true;
            setImmediate(() => {
              if (callback) callback.applyIgnored(undefined, ['close', hadError]);
              removeTLSHandle(handleId);
            });
          });
        } else {
          setImmediate(() => {
            if (callback) callback.applyIgnored(undefined, ['close', hadError]);
            removeTLSHandle(handleId);
          });
        }
      });

      tlsSocket.on('error', (err: Error) => {
        const errorMsg = err && err.message ? err.message : String(err);
        if (callback) callback.applyIgnored(undefined, ['error', errorMsg]);
      });

      return handleId;
    }

    context.global.setSync(
      '_tls_connect',
      new ivm.Reference((port: any, host: any, options: any, callback: any) => {
        const handleId = ++tlsHandleCounter;

        const tlsOptions = { ...options, port, host };
        const tlsSocket = tls.connect(tlsOptions);

        if (!networkPolicy) {
          return setupTLSSocket(handleId, tlsSocket, callback);
        }

        setupTLSSocket(handleId, tlsSocket, callback);

        (async () => {
          try {
            const result = await networkPolicy.evaluatePolicy(host, consoleLog);
            if (!result.allowed) {
              if (consoleLog) {
                consoleLog(`[TLS] Connection to ${host} denied: ${result.reason}`);
              }
              const error = new Error(result.reason) as NodeJS.ErrnoException;
              error.code = 'POLICY_DENIED';
              tlsSocket.destroy(error);
            }
          } catch (err: any) {
            const error = new Error(err.message || 'Policy evaluation failed') as NodeJS.ErrnoException;
            error.code = 'POLICY_ERROR';
            tlsSocket.destroy(error);
          }
        })();

        return handleId;
      }),
    );

    context.global.setSync(
      '_tls_socketWrite',
      new ivm.Reference((handleId: any, data: any, encoding: any, callback: any) => {
        try {
          const tlsSocket = getTLSHandle(handleId);
          let buffer: Buffer;
          if (data instanceof ArrayBuffer) {
            buffer = BuiltinBridge._arrayBufferToBuffer(data);
          } else if (Buffer.isBuffer(data)) {
            buffer = data;
          } else if (typeof data === 'string') {
            buffer = Buffer.from(data, encoding || 'utf8');
          } else {
            buffer = Buffer.from(data);
          }
          const actualCallback = typeof encoding === 'function' ? encoding : callback;
          const actualEncoding = typeof encoding === 'string' ? encoding as BufferEncoding : undefined;
          const result = tlsSocket.write(buffer, actualEncoding, (err: any) => {
            if (actualCallback) {
              const errorMsg = err ? err.message || String(err) : null;
              actualCallback.applyIgnored(undefined, [errorMsg]);
            }
          });
          return result;
        } catch (err: any) {
          if (callback || typeof encoding === 'function') {
            const actualCallback = typeof encoding === 'function' ? encoding : callback;
            actualCallback.applyIgnored(undefined, [err.message || String(err)]);
          }
          return false;
        }
      }),
    );

    context.global.setSync(
      '_tls_socketGetAuthorized',
      new ivm.Reference((handleId: any) => {
        try {
          return getTLSHandle(handleId).authorized;
        } catch {
          return false;
        }
      }),
    );

    context.global.setSync(
      '_tls_socketGetCipher',
      new ivm.Reference((handleId: any) => {
        try {
          const cipher = getTLSHandle(handleId).getCipher();
          return cipher ? new ivm.ExternalCopy(cipher).copyInto() : null;
        } catch {
          return null;
        }
      }),
    );

    context.global.setSync(
      '_tls_socketGetProtocol',
      new ivm.Reference((handleId: any) => {
        try {
          return getTLSHandle(handleId).getProtocol();
        } catch {
          return null;
        }
      }),
    );

    context.global.setSync(
      '_tls_socketGetPeerCertificate',
      new ivm.Reference((handleId: any, detailed: any) => {
        try {
          const cert = getTLSHandle(handleId).getPeerCertificate(detailed);
          return new ivm.ExternalCopy(cert).copyInto();
        } catch {
          return {};
        }
      }),
    );

    context.global.setSync(
      '_tls_socketEnd',
      new ivm.Reference((handleId: any, data: any, encoding: any, callback: any) => {
        try {
          const tlsSocket = getTLSHandle(handleId);
          if (typeof data === 'function') {
            callback = data;
            data = undefined;
            encoding = undefined;
          } else if (typeof encoding === 'function') {
            callback = encoding;
            encoding = undefined;
          }
          if (data !== undefined) {
            let buffer: Buffer;
            if (data instanceof ArrayBuffer) {
              buffer = BuiltinBridge._arrayBufferToBuffer(data);
            } else {
              buffer = Buffer.from(data, encoding);
            }
            tlsSocket.end(buffer, encoding, callback);
          } else {
            tlsSocket.end(callback);
          }
        } catch (err: any) {
          if (callback) {
            callback.applyIgnored(undefined, [err.message || String(err)]);
          }
        }
      }),
    );

    context.global.setSync(
      '_tls_socketDestroy',
      new ivm.Reference((handleId: any) => {
        try {
          getTLSHandle(handleId).destroy();
          removeTLSHandle(handleId);
        } catch {
          // Ignore
        }
      }),
    );

    context.global.setSync(
      '_tls_getCACertificates',
      new ivm.Reference((store: any) => {
        if (store === 'bundled' || store === 'default' || store === 'system') {
          let bundledCerts: string[] = [];
          if (tls.rootCertificates && Array.isArray(tls.rootCertificates)) {
            bundledCerts = [...tls.rootCertificates];
          } else {
            try {
              bundledCerts = [...((require('tls') as typeof tls).rootCertificates || [])];
            } catch (err: any) {
              console.warn('Could not load CA certificates:', err.message);
              bundledCerts = [];
            }
          }
          return new ivm.ExternalCopy(bundledCerts).copyInto();
        }
        return [];
      }),
    );
  }

  static setupZlib(context: ivm.Context): void {
    const crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1;
      }
      crc32Table[i] = crc;
    }

    const zlibHandles = new Map<number, any>();
    let zlibHandleCounter = 0;

    function createZlibHandle(stream: any): number {
      const handleId = ++zlibHandleCounter;
      zlibHandles.set(handleId, {
        stream,
        finished: false,
        destroyed: false,
        bytesWritten: 0,
        bytesRead: 0,
      });
      return handleId;
    }

    function getZlibHandle(handleId: number): any {
      const handleObj = zlibHandles.get(handleId);
      if (!handleObj) {
        throw new Error('Invalid zlib handle');
      }
      return handleObj;
    }

    function convertZlibError(err: any): Error | null {
      if (!err) return null;
      const cleanError = new Error();
      try {
        cleanError.message = err.message || String(err);
      } catch {
        cleanError.message = 'Error conversion failed';
      }
      try {
        if (err.code !== undefined) (cleanError as any).code = err.code;
        if (err.errno !== undefined) (cleanError as any).errno = err.errno;
        if (err.syscall !== undefined) (cleanError as any).syscall = err.syscall;
        if (err.name !== undefined) cleanError.name = err.name;
      } catch {
        // ignore
      }
      return cleanError;
    }

    // Synchronous convenience methods
    context.global.setSync(
      '_zlib_deflateSync',
      new ivm.Reference((buffer: any, options: any) => {
        try {
          const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
          return BuiltinBridge._bufferToArrayBuffer(zlib.deflateSync(input, options));
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_inflateSync',
      new ivm.Reference((buffer: any, options: any) => {
        try {
          const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
          return BuiltinBridge._bufferToArrayBuffer(zlib.inflateSync(input, options));
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_gzipSync',
      new ivm.Reference((buffer: any, options: any) => {
        try {
          const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
          return BuiltinBridge._bufferToArrayBuffer(zlib.gzipSync(input, options));
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_gunzipSync',
      new ivm.Reference((buffer: any, options: any) => {
        try {
          const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
          return BuiltinBridge._bufferToArrayBuffer(zlib.gunzipSync(input, options));
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_deflateRawSync',
      new ivm.Reference((buffer: any, options: any) => {
        try {
          const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
          return BuiltinBridge._bufferToArrayBuffer(zlib.deflateRawSync(input, options));
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_inflateRawSync',
      new ivm.Reference((buffer: any, options: any) => {
        try {
          const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
          return BuiltinBridge._bufferToArrayBuffer(zlib.inflateRawSync(input, options));
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_unzipSync',
      new ivm.Reference((buffer: any, options: any) => {
        try {
          const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
          return BuiltinBridge._bufferToArrayBuffer(zlib.unzipSync(input, options));
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_brotliCompressSync',
      new ivm.Reference((buffer: any, options: any) => {
        try {
          const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
          return BuiltinBridge._bufferToArrayBuffer(zlib.brotliCompressSync(input, options));
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_brotliDecompressSync',
      new ivm.Reference((buffer: any, options: any) => {
        try {
          const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
          return BuiltinBridge._bufferToArrayBuffer(zlib.brotliDecompressSync(input, options));
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    const zlibAny = zlib as any;
    if (zlibAny.zstdCompressSync && zlibAny.zstdDecompressSync) {
      context.global.setSync(
        '_zlib_zstdCompressSync',
        new ivm.Reference((buffer: any, options: any) => {
          try {
            const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
            return BuiltinBridge._bufferToArrayBuffer(zlibAny.zstdCompressSync(input, options));
          } catch (err: any) {
            throw convertZlibError(err);
          }
        }),
      );
      context.global.setSync(
        '_zlib_zstdDecompressSync',
        new ivm.Reference((buffer: any, options: any) => {
          try {
            const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
            return BuiltinBridge._bufferToArrayBuffer(zlibAny.zstdDecompressSync(input, options));
          } catch (err: any) {
            throw convertZlibError(err);
          }
        }),
      );
    }

    // Async convenience methods
    const zlibAsyncHelper = (
      fn: (input: Buffer, options: any, cb: (err: NodeJS.ErrnoException | null, result: Buffer) => void) => void,
    ) =>
      new ivm.Reference((buffer: any, options: any, callback: any) => {
        const input = Buffer.isBuffer(buffer) ? buffer : BuiltinBridge._arrayBufferToBuffer(buffer);
        fn(input, options, (err: any, result: Buffer) => {
          if (err) {
            callback.applySync(undefined, [convertZlibError(err), null], { arguments: { copy: true } });
          } else {
            callback.applySync(undefined, [null, BuiltinBridge._bufferToArrayBuffer(result)], {
              arguments: { copy: true },
            });
          }
        });
      });

    context.global.setSync('_zlib_deflate', zlibAsyncHelper(zlib.deflate.bind(zlib)));
    context.global.setSync('_zlib_inflate', zlibAsyncHelper(zlib.inflate.bind(zlib)));
    context.global.setSync('_zlib_gzip', zlibAsyncHelper(zlib.gzip.bind(zlib)));
    context.global.setSync('_zlib_gunzip', zlibAsyncHelper(zlib.gunzip.bind(zlib)));
    context.global.setSync('_zlib_deflateRaw', zlibAsyncHelper(zlib.deflateRaw.bind(zlib)));
    context.global.setSync('_zlib_inflateRaw', zlibAsyncHelper(zlib.inflateRaw.bind(zlib)));
    context.global.setSync('_zlib_unzip', zlibAsyncHelper(zlib.unzip.bind(zlib)));
    context.global.setSync('_zlib_brotliCompress', zlibAsyncHelper(zlib.brotliCompress.bind(zlib)));
    context.global.setSync('_zlib_brotliDecompress', zlibAsyncHelper(zlib.brotliDecompress.bind(zlib)));

    // Stream factory methods
    const makeStreamFactory = (factory: (opts: any) => any) =>
      new ivm.Reference((options: any) => {
        try {
          return createZlibHandle(factory(options));
        } catch (err: any) {
          throw convertZlibError(err);
        }
      });

    context.global.setSync('_zlib_createDeflate', makeStreamFactory((o) => zlib.createDeflate(o)));
    context.global.setSync('_zlib_createInflate', makeStreamFactory((o) => zlib.createInflate(o)));
    context.global.setSync('_zlib_createGzip', makeStreamFactory((o) => zlib.createGzip(o)));
    context.global.setSync('_zlib_createGunzip', makeStreamFactory((o) => zlib.createGunzip(o)));
    context.global.setSync('_zlib_createDeflateRaw', makeStreamFactory((o) => zlib.createDeflateRaw(o)));
    context.global.setSync('_zlib_createInflateRaw', makeStreamFactory((o) => zlib.createInflateRaw(o)));
    context.global.setSync('_zlib_createUnzip', makeStreamFactory((o) => zlib.createUnzip(o)));
    context.global.setSync(
      '_zlib_createBrotliCompress',
      makeStreamFactory((o) => zlib.createBrotliCompress(o)),
    );
    context.global.setSync(
      '_zlib_createBrotliDecompress',
      makeStreamFactory((o) => zlib.createBrotliDecompress(o)),
    );

    if (zlibAny.createZstdCompress && zlibAny.createZstdDecompress) {
      context.global.setSync(
        '_zlib_createZstdCompress',
        makeStreamFactory((o) => zlibAny.createZstdCompress(o)),
      );
      context.global.setSync(
        '_zlib_createZstdDecompress',
        makeStreamFactory((o) => zlibAny.createZstdDecompress(o)),
      );
    }

    // Synchronous chunk processing
    context.global.setSync(
      '_zlib_processChunk',
      new ivm.Reference((handle: any, chunk: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          const stream = handleObj.stream;
          if (handleObj.destroyed) throw new Error('Cannot process chunk on destroyed stream');
          const input =
            chunk instanceof ArrayBuffer ? BuiltinBridge._arrayBufferToBuffer(chunk) : chunk;
          handleObj.bytesRead += input.length;
          const chunks: Buffer[] = [];
          let hasData = false;
          const originalPush = stream.push;
          stream.push = (c: Buffer | null) => {
            if (c !== null) {
              chunks.push(c);
              hasData = true;
            }
            return true;
          };
          stream._transform(input, 'buffer', (err: any) => {
            if (err) throw err;
          });
          stream.push = originalPush;
          if (hasData && chunks.length > 0) {
            const result = Buffer.concat(chunks);
            handleObj.bytesWritten += result.length;
            return BuiltinBridge._bufferToArrayBuffer(result);
          }
          return null;
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_flushChunk',
      new ivm.Reference((handle: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          const stream = handleObj.stream;
          if (handleObj.destroyed) throw new Error('Cannot flush destroyed stream');
          const chunks: Buffer[] = [];
          let hasData = false;
          const originalPush = stream.push;
          stream.push = (c: Buffer | null) => {
            if (c !== null) {
              chunks.push(c);
              hasData = true;
            }
            return true;
          };
          if (stream._flush) {
            stream._flush((err: any) => {
              if (err) throw err;
            });
          }
          stream.push = originalPush;
          if (hasData && chunks.length > 0) {
            const result = Buffer.concat(chunks);
            handleObj.bytesWritten += result.length;
            return BuiltinBridge._bufferToArrayBuffer(result);
          }
          return null;
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_write',
      new ivm.Reference((handle: any, chunk: any, encoding: any, callback: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          const stream = handleObj.stream;
          if (handleObj.destroyed) throw new Error('Cannot write to destroyed stream');
          const input =
            chunk instanceof ArrayBuffer ? BuiltinBridge._arrayBufferToBuffer(chunk) : chunk;
          handleObj.bytesRead += input.length;
          const result = stream.write(input, encoding, (err: any) => {
            if (callback) {
              callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
            }
          });
          return result;
        } catch (err: any) {
          if (callback) {
            callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
          }
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_end',
      new ivm.Reference((handle: any, chunk: any, encoding: any, callback: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          const stream = handleObj.stream;
          if (chunk !== undefined && chunk !== null) {
            const input =
              chunk instanceof ArrayBuffer ? BuiltinBridge._arrayBufferToBuffer(chunk) : chunk;
            handleObj.bytesRead += input.length;
          }
          stream.end(chunk, encoding, (err: any) => {
            handleObj.finished = true;
            if (callback) {
              callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
            }
          });
        } catch (err: any) {
          if (callback) {
            callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
          }
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_destroy',
      new ivm.Reference((handle: any, error: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          handleObj.destroyed = true;
          handleObj.stream.destroy(error ? new Error(error) : undefined);
          zlibHandles.delete(handle);
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_flush',
      new ivm.Reference((handle: any, kind: any, callback: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          const stream = handleObj.stream;
          if (typeof stream.flush === 'function') {
            stream.flush(kind, (err: any) => {
              if (callback) {
                callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
              }
            });
          } else {
            throw new Error('Stream does not support flush operation');
          }
        } catch (err: any) {
          if (callback) {
            callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
          }
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_params',
      new ivm.Reference((handle: any, level: any, strategy: any, callback: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          const stream = handleObj.stream;
          if (typeof stream.params === 'function') {
            stream.params(level, strategy, (err: any) => {
              if (callback) {
                callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
              }
            });
          } else {
            throw new Error('Stream does not support params operation');
          }
        } catch (err: any) {
          if (callback) {
            callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
          }
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_reset',
      new ivm.Reference((handle: any) => {
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
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_close',
      new ivm.Reference((handle: any, callback: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          const stream = handleObj.stream;
          if (typeof stream.close === 'function') {
            stream.close((err: any) => {
              zlibHandles.delete(handle);
              if (callback) {
                callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
              }
            });
          } else {
            zlibHandles.delete(handle);
            if (callback) {
              callback.applyIgnored(undefined, [null], { arguments: { copy: true } });
            }
          }
        } catch (err: any) {
          if (callback) {
            callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
          }
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_getBytesWritten',
      new ivm.Reference((handle: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          return handleObj.stream.bytesWritten || handleObj.bytesWritten;
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_getBytesRead',
      new ivm.Reference((handle: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          return handleObj.stream.bytesRead || handleObj.bytesRead;
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_onData',
      new ivm.Reference((handle: any, callback: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          handleObj.stream.on('data', (chunk: Buffer) => {
            handleObj.bytesWritten += chunk.length;
            const arrayBuffer = BuiltinBridge._bufferToArrayBuffer(chunk);
            callback.applyIgnored(undefined, [arrayBuffer], { arguments: { copy: true } });
          });
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_onEnd',
      new ivm.Reference((handle: any, callback: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          handleObj.stream.on('end', () => {
            handleObj.finished = true;
            callback.applyIgnored(undefined, [], { arguments: { copy: true } });
          });
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_onError',
      new ivm.Reference((handle: any, callback: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          handleObj.stream.on('error', (err: any) => {
            callback.applyIgnored(undefined, [convertZlibError(err)], { arguments: { copy: true } });
          });
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_onClose',
      new ivm.Reference((handle: any, callback: any) => {
        try {
          const handleObj = getZlibHandle(handle);
          handleObj.stream.on('close', () => {
            zlibHandles.delete(handle);
            callback.applyIgnored(undefined, [], { arguments: { copy: true } });
          });
        } catch (err: any) {
          throw convertZlibError(err);
        }
      }),
    );

    context.global.setSync(
      '_zlib_crc32',
      new ivm.Reference((data: any, value: any) => {
        try {
          const input = data instanceof ArrayBuffer ? BuiltinBridge._arrayBufferToBuffer(data) : data;
          if (typeof zlibAny.crc32 === 'function') {
            return zlibAny.crc32(input, value);
          } else {
            try {
              const crc32 = require('crc-32');
              return crc32.buf(input, value);
            } catch {
              let crc = value || -1;
              for (let i = 0; i < input.length; i++) {
                crc = (crc >>> 8) ^ crc32Table[(crc ^ input[i]) & 0xff];
              }
              return (crc ^ -1) >>> 0;
            }
          }
        } catch (err: any) {
          throw err;
        }
      }),
    );

    const c = zlib.constants as any;
    context.global.setSync(
      '_zlib_constants',
      new ivm.ExternalCopy({
        Z_NO_COMPRESSION: c.Z_NO_COMPRESSION,
        Z_BEST_SPEED: c.Z_BEST_SPEED,
        Z_BEST_COMPRESSION: c.Z_BEST_COMPRESSION,
        Z_DEFAULT_COMPRESSION: c.Z_DEFAULT_COMPRESSION,
        Z_FILTERED: c.Z_FILTERED,
        Z_HUFFMAN_ONLY: c.Z_HUFFMAN_ONLY,
        Z_RLE: c.Z_RLE,
        Z_FIXED: c.Z_FIXED,
        Z_DEFAULT_STRATEGY: c.Z_DEFAULT_STRATEGY,
        Z_NO_FLUSH: c.Z_NO_FLUSH,
        Z_PARTIAL_FLUSH: c.Z_PARTIAL_FLUSH,
        Z_SYNC_FLUSH: c.Z_SYNC_FLUSH,
        Z_FULL_FLUSH: c.Z_FULL_FLUSH,
        Z_FINISH: c.Z_FINISH,
        Z_BLOCK: c.Z_BLOCK,
        Z_TREES: c.Z_TREES,
        Z_MIN_WINDOWBITS: c.Z_MIN_WINDOWBITS,
        Z_MAX_WINDOWBITS: c.Z_MAX_WINDOWBITS,
        Z_DEFAULT_WINDOWBITS: c.Z_DEFAULT_WINDOWBITS,
        Z_MIN_MEMLEVEL: c.Z_MIN_MEMLEVEL,
        Z_MAX_MEMLEVEL: c.Z_MAX_MEMLEVEL,
        Z_DEFAULT_MEMLEVEL: c.Z_DEFAULT_MEMLEVEL,
        Z_MIN_CHUNK: c.Z_MIN_CHUNK,
        Z_MAX_CHUNK: c.Z_MAX_CHUNK,
        Z_DEFAULT_CHUNK: c.Z_DEFAULT_CHUNK,
        BROTLI_DECODE: c.BROTLI_DECODE,
        BROTLI_ENCODE: c.BROTLI_ENCODE,
        BROTLI_OPERATION_PROCESS: c.BROTLI_OPERATION_PROCESS,
        BROTLI_OPERATION_FLUSH: c.BROTLI_OPERATION_FLUSH,
        BROTLI_OPERATION_FINISH: c.BROTLI_OPERATION_FINISH,
        BROTLI_OPERATION_EMIT_METADATA: c.BROTLI_OPERATION_EMIT_METADATA,
        BROTLI_PARAM_MODE: c.BROTLI_PARAM_MODE,
        BROTLI_PARAM_QUALITY: c.BROTLI_PARAM_QUALITY,
        BROTLI_PARAM_LGWIN: c.BROTLI_PARAM_LGWIN,
        BROTLI_PARAM_LGBLOCK: c.BROTLI_PARAM_LGBLOCK,
        BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING: c.BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING,
        BROTLI_PARAM_SIZE_HINT: c.BROTLI_PARAM_SIZE_HINT,
        BROTLI_PARAM_LARGE_WINDOW: c.BROTLI_PARAM_LARGE_WINDOW,
        BROTLI_PARAM_NPOSTFIX: c.BROTLI_PARAM_NPOSTFIX,
        BROTLI_PARAM_NDIRECT: c.BROTLI_PARAM_NDIRECT,
        BROTLI_MODE_GENERIC: c.BROTLI_MODE_GENERIC,
        BROTLI_MODE_TEXT: c.BROTLI_MODE_TEXT,
        BROTLI_MODE_FONT: c.BROTLI_MODE_FONT,
        BROTLI_MIN_QUALITY: c.BROTLI_MIN_QUALITY,
        BROTLI_MAX_QUALITY: c.BROTLI_MAX_QUALITY,
        BROTLI_DEFAULT_QUALITY: c.BROTLI_DEFAULT_QUALITY,
        BROTLI_MIN_WINDOW_BITS: c.BROTLI_MIN_WINDOW_BITS,
        BROTLI_MAX_WINDOW_BITS: c.BROTLI_MAX_WINDOW_BITS,
        BROTLI_DEFAULT_WINDOW: c.BROTLI_DEFAULT_WINDOW,
      }).copyInto(),
    );
  }

  static setupDNS(context: ivm.Context): void {
    function convertErrorObject(err: any): any {
      if (!err) return null;
      return {
        message: err.message,
        code: err.code,
        errno: err.errno,
        syscall: err.syscall,
        hostname: err.hostname,
      };
    }

    context.global.setSync(
      '_dns_lookup',
      new ivm.Reference((hostname: any, options: any, callback: any) => {
        dns.lookup(hostname, options, (err, address, family) => {
          callback.applySync(undefined, [convertErrorObject(err), address, family], {
            arguments: { copy: true },
          });
        });
      }),
    );

    context.global.setSync(
      '_dns_lookupService',
      new ivm.Reference((address: any, port: any, callback: any) => {
        dns.lookupService(address, port, (err, hostname, service) => {
          callback.applySync(undefined, [convertErrorObject(err), hostname, service], {
            arguments: { copy: true },
          });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolve',
      new ivm.Reference((hostname: any, rrtype: any, callback: any) => {
        dns.resolve(hostname, rrtype, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolve4',
      new ivm.Reference((hostname: any, options: any, callback: any) => {
        dns.resolve4(hostname, options, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolve6',
      new ivm.Reference((hostname: any, options: any, callback: any) => {
        dns.resolve6(hostname, options, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolveAny',
      new ivm.Reference((hostname: any, callback: any) => {
        dns.resolveAny(hostname, (err, records) => {
          callback.applySync(undefined, [convertErrorObject(err), records], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolveCname',
      new ivm.Reference((hostname: any, callback: any) => {
        dns.resolveCname(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolveMx',
      new ivm.Reference((hostname: any, callback: any) => {
        dns.resolveMx(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolveNaptr',
      new ivm.Reference((hostname: any, callback: any) => {
        dns.resolveNaptr(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolveNs',
      new ivm.Reference((hostname: any, callback: any) => {
        dns.resolveNs(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolvePtr',
      new ivm.Reference((hostname: any, callback: any) => {
        dns.resolvePtr(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolveSoa',
      new ivm.Reference((hostname: any, callback: any) => {
        dns.resolveSoa(hostname, (err, address) => {
          callback.applySync(undefined, [convertErrorObject(err), address], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolveSrv',
      new ivm.Reference((hostname: any, callback: any) => {
        dns.resolveSrv(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolveTxt',
      new ivm.Reference((hostname: any, callback: any) => {
        dns.resolveTxt(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_reverse',
      new ivm.Reference((ip: any, callback: any) => {
        dns.reverse(ip, (err, hostnames) => {
          callback.applySync(undefined, [convertErrorObject(err), hostnames], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_setDefaultResultOrder',
      new ivm.Reference((order: any) => {
        (dns as any).setDefaultResultOrder(order);
      }),
    );

    context.global.setSync(
      '_dns_getDefaultResultOrder',
      new ivm.Reference(() => (dns as any).getDefaultResultOrder()),
    );

    context.global.setSync(
      '_dns_setServers',
      new ivm.Reference((servers: any) => {
        dns.setServers(servers);
      }),
    );

    context.global.setSync(
      '_dns_getServers',
      new ivm.Reference(() => new ivm.ExternalCopy(dns.getServers()).copyInto()),
    );

    const resolverHandles = new Map<number, dns.Resolver>();
    let resolverHandleCounter = 0;

    function createResolverHandle(resolver: dns.Resolver): number {
      const handleId = ++resolverHandleCounter;
      resolverHandles.set(handleId, resolver);
      return handleId;
    }

    function getResolverHandle(handleId: number): dns.Resolver {
      const resolver = resolverHandles.get(handleId);
      if (!resolver) {
        throw new Error('Invalid resolver handle');
      }
      return resolver;
    }

    function removeResolverHandle(handleId: number): void {
      resolverHandles.delete(handleId);
    }

    context.global.setSync(
      '_dns_createResolver',
      new ivm.Reference((options: any) => createResolverHandle(new dns.Resolver(options))),
    );

    context.global.setSync(
      '_dns_resolverCancel',
      new ivm.Reference((handle: any) => {
        getResolverHandle(handle).cancel();
        removeResolverHandle(handle);
      }),
    );

    context.global.setSync(
      '_dns_resolverSetServers',
      new ivm.Reference((handle: any, servers: any) => {
        getResolverHandle(handle).setServers(servers);
      }),
    );

    context.global.setSync(
      '_dns_resolverGetServers',
      new ivm.Reference((handle: any) => {
        return new ivm.ExternalCopy(getResolverHandle(handle).getServers()).copyInto();
      }),
    );

    context.global.setSync(
      '_dns_resolverResolve',
      new ivm.Reference((handle: any, hostname: any, rrtype: any, callback: any) => {
        getResolverHandle(handle).resolve(hostname, rrtype, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverResolve4',
      new ivm.Reference((handle: any, hostname: any, options: any, callback: any) => {
        getResolverHandle(handle).resolve4(hostname, options, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverResolve6',
      new ivm.Reference((handle: any, hostname: any, options: any, callback: any) => {
        getResolverHandle(handle).resolve6(hostname, options, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverResolveAny',
      new ivm.Reference((handle: any, hostname: any, callback: any) => {
        (getResolverHandle(handle) as any).resolveAny(hostname, (err: any, records: any) => {
          callback.applySync(undefined, [convertErrorObject(err), records], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverResolveCname',
      new ivm.Reference((handle: any, hostname: any, callback: any) => {
        getResolverHandle(handle).resolveCname(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverResolveMx',
      new ivm.Reference((handle: any, hostname: any, callback: any) => {
        getResolverHandle(handle).resolveMx(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverResolveNaptr',
      new ivm.Reference((handle: any, hostname: any, callback: any) => {
        getResolverHandle(handle).resolveNaptr(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverResolveNs',
      new ivm.Reference((handle: any, hostname: any, callback: any) => {
        getResolverHandle(handle).resolveNs(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverResolvePtr',
      new ivm.Reference((handle: any, hostname: any, callback: any) => {
        getResolverHandle(handle).resolvePtr(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverResolveSoa',
      new ivm.Reference((handle: any, hostname: any, callback: any) => {
        getResolverHandle(handle).resolveSoa(hostname, (err, address) => {
          callback.applySync(undefined, [convertErrorObject(err), address], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverResolveSrv',
      new ivm.Reference((handle: any, hostname: any, callback: any) => {
        getResolverHandle(handle).resolveSrv(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverResolveTxt',
      new ivm.Reference((handle: any, hostname: any, callback: any) => {
        getResolverHandle(handle).resolveTxt(hostname, (err, addresses) => {
          callback.applySync(undefined, [convertErrorObject(err), addresses], { arguments: { copy: true } });
        });
      }),
    );

    context.global.setSync(
      '_dns_resolverReverse',
      new ivm.Reference((handle: any, ip: any, callback: any) => {
        getResolverHandle(handle).reverse(ip, (err, hostnames) => {
          callback.applySync(undefined, [convertErrorObject(err), hostnames], { arguments: { copy: true } });
        });
      }),
    );
  }
}
