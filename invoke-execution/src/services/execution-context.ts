import ivm from 'isolated-vm';
import BuiltinBridge from './builtin-bridge';
import NetworkPolicy from './network-policy';

// sandbox-fs has no TS types; use require to avoid declaration errors
const { VirtualFileSystem } = require('sandbox-fs');

interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
}

interface ResponseState {
  statusCode: number;
  headers: Record<string, string | string[]>;
  data: Buffer | undefined;
}

interface ReqData {
  method: string;
  url: string;
  originalUrl: string;
  path: string;
  protocol: string;
  hostname: string;
  secure: boolean;
  ip: string;
  ips: string[];
  body: unknown;
  query: Record<string, string>;
  params: Record<string, string>;
  headers: Record<string, string>;
}

/**
 * ExecutionContext — manages a single function execution.
 * Sets up VFS, module loader, fs bridge, and execution environment.
 */
class ExecutionContext {
  private isolate: ivm.Isolate;
  public context: ivm.Context;
  private packageDir: string;
  private functionId: string;
  private packageHash: string;
  private envVars: Record<string, string>;
  private compiledScript: ivm.Script;
  private projectId: string;
  private kvStore: any;
  private networkPolicy: NetworkPolicy;
  public vfs: any;
  private logs: LogEntry[];
  private response: ResponseState;

  constructor(
    isolate: ivm.Isolate,
    context: ivm.Context,
    packageDir: string,
    functionId: string,
    packageHash: string,
    envVars: Record<string, string>,
    compiledScript: ivm.Script,
    projectId: string,
    kvStore: any,
    networkPolicies: { globalRules?: any[]; projectRules?: any[] },
  ) {
    this.isolate = isolate;
    this.context = context;
    this.packageDir = packageDir;
    this.functionId = functionId;
    this.packageHash = packageHash;
    this.envVars = this._sanitizeEnvVars(envVars);
    this.compiledScript = compiledScript;
    this.projectId = projectId;
    this.kvStore = kvStore;

    const globalRules = networkPolicies?.globalRules || [];
    const projectRules = networkPolicies?.projectRules || [];
    this.networkPolicy = new NetworkPolicy(globalRules, projectRules);

    this.vfs = new VirtualFileSystem({});
    this.vfs.mountSync(this.packageDir, '/app');

    this.logs = [];
    this.response = {
      statusCode: 200,
      headers: {},
      data: undefined,
    };
  }

  private _sanitizeEnvVars(input: Record<string, unknown>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[String(key)] = String(value);
    }
    return sanitized;
  }

  async bootstrap(): Promise<void> {
    await this.context.global.set('ivm', ivm);

    await this._setupProcess();
    await this._setupTimers();
    await this._setupConsoleRefs();
    await this._setupBuiltinModuleRef();
    await this._setupResponseRefs();
    await this._setupTextEncoderDecoder();
    await this._setupKVStore();

    await this.compiledScript.run(this.context);
  }

  private async _setupConsoleRefs(): Promise<void> {
    await this.context.global.set(
      '_consoleWrite',
      new ivm.Reference((data: any) => {
        this.logs.push({
          level: data.level || 'log',
          message: data.message.map((arg: any) => String(arg)).join(' '),
          timestamp: Date.now(),
        });

        if (process.env.REDIRECT_OUTPUT === 'true') {
          (console as any)[data.level || 'log'](
            `[Function ${this.functionId}] ${data.message.map((arg: any) => String(arg)).join(' ')}`,
          );
        } else if (process.env.REDIRECT_OUTPUT === 'no-func-id') {
          const level = data.level || 'log';
          const readableLevel = level === 'log' ? 'info' : level;
          (console as any)[level](
            `[${readableLevel.toUpperCase().substring(0, 3)}] ${data.message.map((arg: any) => String(arg)).join(' ')}`,
          );
        }
      }),
    );

    await this.context.global.set(
      '_consoleClear',
      new ivm.Reference(() => {
        this.logs = [];
      }),
    );
  }

  consoleLog(message: string): void {
    this.logs.push({
      level: 'log',
      message: String(message),
      timestamp: Date.now(),
    });
  }

  private async _setupBuiltinModuleRef(): Promise<void> {
    const fsModule = this.vfs.createNodeFSModule();
    const pathModule = this.vfs.createNodePathModule();

    await BuiltinBridge.setupAll(
      this.context,
      fsModule,
      pathModule,
      this.networkPolicy,
      this.consoleLog.bind(this),
    );
  }

  private async _setupProcess(): Promise<void> {
    await this.context.global.set('_envVars', this.envVars, { copy: true });
    await this.context.global.set('_arch', process.arch, { copy: true });
    await this.context.global.set('_node_version', process.version, { copy: true });
    await this.context.global.set('_node_versions', process.versions, { copy: true });

    const http = require('http');
    await this.context.global.set(
      '_httpStatusCodes',
      new ivm.ExternalCopy(http.STATUS_CODES).copyInto(),
    );
  }

  private async _setupTimers(): Promise<void> {
    await this.context.global.set(
      '_sleep',
      new ivm.Reference((timeoutMs: number, callback: any) => {
        setTimeout(() => {
          if (callback) {
            callback.applyIgnored(undefined, []);
          }
        }, timeoutMs);
      }),
    );
  }

  private async _setupTextEncoderDecoder(): Promise<void> {
    const { TextEncoder: HostTextEncoder, TextDecoder: HostTextDecoder } = require('util');

    const textEncoderEncode = new ivm.Reference((str: string) => {
      const encoder = new HostTextEncoder();
      const encoded = encoder.encode(str);
      return new ivm.ExternalCopy(encoded.buffer).copyInto();
    });

    const textDecoderDecode = new ivm.Reference(
      (arr: any, encoding = 'utf-8') => {
        const decoder = new HostTextDecoder(encoding);
        return decoder.decode(new Uint8Array(arr));
      },
    );

    await this.context.global.set('_textEncoderEncode', textEncoderEncode);
    await this.context.global.set('_textDecoderDecode', textDecoderDecode);
  }

  private async _setupKVStore(): Promise<void> {
    const self = this;

    const kvGet = new ivm.Reference(async (key: string) => {
      try {
        const value = await self.kvStore.get(key);
        if (value === undefined || value === null) return undefined;
        return JSON.stringify(value);
      } catch (error: any) {
        throw new Error(`KV get error: ${error.message}`);
      }
    });

    const kvSet = new ivm.Reference(async (key: string, jsonStr: string, ttl?: number) => {
      try {
        const value = JSON.parse(jsonStr);
        const result = await self.kvStore.set(key, value, ttl);
        return result;
      } catch (error: any) {
        throw new Error(`KV set error: ${error.message}`);
      }
    });

    const kvDelete = new ivm.Reference(async (key: string) => {
      try {
        return await self.kvStore.delete(key);
      } catch (error: any) {
        throw new Error(`KV delete error: ${error.message}`);
      }
    });

    const kvClear = new ivm.Reference(async () => {
      try {
        await self.kvStore.clear();
        return true;
      } catch (error: any) {
        throw new Error(`KV clear error: ${error.message}`);
      }
    });

    const kvHas = new ivm.Reference(async (key: string) => {
      try {
        return await self.kvStore.has(key);
      } catch (error: any) {
        throw new Error(`KV has error: ${error.message}`);
      }
    });

    await this.context.global.set('_kvGet', kvGet);
    await this.context.global.set('_kvSet', kvSet);
    await this.context.global.set('_kvDelete', kvDelete);
    await this.context.global.set('_kvClear', kvClear);
    await this.context.global.set('_kvHas', kvHas);
  }

  private async _setupResponseRefs(): Promise<void> {
    const self = this;

    const resStatus = new ivm.Reference((code: number) => {
      self.response.statusCode = code;
    });

    const resSend = new ivm.Reference(
      (externalCopy: any) => {
        const hostBuffer = externalCopy.copy();
        self.response.data = Buffer.from(hostBuffer);

        if (!self.response.headers['content-type']) {
          try {
            const asString = self.response.data!.toString('utf8');
            JSON.parse(asString);
            self.response.headers['content-type'] = 'application/json';
          } catch {
            self.response.headers['content-type'] = 'text/plain';
          }
        }
      },
    );

    const resSendFile = new ivm.Reference((filePath: string, options: any = {}) => {
      try {
        const path = require('path');
        const vfsFs = self.vfs.createNodeFSModule();

        const ext = path.extname(filePath).toLowerCase();
        const contentTypes: Record<string, string> = {
          '.html': 'text/html',
          '.htm': 'text/html',
          '.css': 'text/css',
          '.js': 'application/javascript',
          '.json': 'application/json',
          '.xml': 'application/xml',
          '.txt': 'text/plain',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.webp': 'image/webp',
          '.pdf': 'application/pdf',
          '.zip': 'application/zip',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
          '.otf': 'font/otf',
        };

        const contentType = contentTypes[ext] || 'application/octet-stream';
        const buffer = vfsFs.readFileSync(filePath);

        self.response.headers['content-type'] = contentType;
        self.response.data = buffer;

        if (options.maxAge !== undefined) {
          self.response.headers['cache-control'] = `public, max-age=${options.maxAge}`;
        }
      } catch (error: any) {
        throw new Error(`Failed to send file: ${error.message}`);
      }
    });

    const resSetHeader = new ivm.Reference((name: string, value: string) => {
      self.response.headers[name.toLowerCase()] = value;
    });

    const resGet = new ivm.Reference((name: string) => {
      return self.response.headers[name.toLowerCase()];
    });

    const resAppendHeader = new ivm.Reference((name: string, value: string) => {
      const lowerName = name.toLowerCase();
      const existing = self.response.headers[lowerName];

      if (existing) {
        if (lowerName === 'set-cookie') {
          if (Array.isArray(existing)) {
            (existing as string[]).push(value);
          } else {
            self.response.headers[lowerName] = [existing as string, value];
          }
        } else {
          self.response.headers[lowerName] = `${existing}, ${value}`;
        }
      } else {
        self.response.headers[lowerName] = value;
      }
    });

    const resRemoveHeader = new ivm.Reference((name: string) => {
      delete self.response.headers[name.toLowerCase()];
    });

    const resEnd = new ivm.Reference((externalCopy: any) => {
      if (externalCopy !== null && externalCopy !== undefined) {
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

  async setupRequest(reqData: ReqData): Promise<void> {
    await this.context.global.set('_reqData', new ivm.ExternalCopy(reqData).copyInto());

    const reqCode = `globalThis.req = _createReqObject(_reqData);`;
    const script = await this.isolate.compileScript(reqCode);
    await script.run(this.context);
  }

  async setupResponse(): Promise<void> {
    // Response references are already set up in bootstrap via _setupResponseRefs
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  getResponse(): ResponseState {
    return this.response;
  }

  cleanup(): void {
    try {
      if (this.vfs && !this.vfs.closed) {
        this.vfs.close();
      }
      if (this.context) {
        this.context.release();
      }
    } catch (error) {
      console.error('[ExecutionContext] Error during cleanup:', error);
    }
  }
}

export default ExecutionContext;
