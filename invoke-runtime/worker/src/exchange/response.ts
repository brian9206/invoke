// ============================================================================
// Response — Express-compatible response mock object
// ============================================================================

import http from 'http';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import type { ResponseData } from '../protocol';
import { InvokeRequest } from './request';

interface SendFileOptions {
  root?: string;
  maxAge?: number;
  cacheControl?: boolean;
  lastModified?: boolean;
  headers?: Record<string, string>;
}

interface CookieOptions {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date | string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string | boolean;
  encode?: (val: string) => string;
}

/** Internal response state — read by the shim after handler completes */
export interface ResponseState {
  statusCode: number;
  headers: Record<string, string | string[]>;
  data: Buffer | undefined;
  finished: boolean;
}

export class InvokeResponse {
  readonly state: ResponseState;
  headersSent = false;

  constructor(private readonly req: InvokeRequest, private _endCallback?: (res: InvokeResponse) => void) {
    this.state = {
      statusCode: 200,
      headers: {},
      data: undefined,
      finished: false,
    };
  }

  get statusCode(): number {
    return this.state.statusCode;
  }

  status(code: number): InvokeResponse {
    this.state.statusCode = code;
    return this;
  }

  sendStatus(code: number): InvokeResponse {
    const message = http.STATUS_CODES[code] || 'Unknown';
    return this.status(code).type('txt').send(message);
  }

  json(data: unknown): InvokeResponse {
    this.setHeader('content-type', 'application/json; charset=utf-8');
    return this.end(JSON.stringify(data));
  }

  send(data?: unknown): InvokeResponse {
    if (data === undefined) {
      this.removeHeader('Content-Type');
      return this.status(204).end();
    }

    let buf: Buffer;

    if (data === null) {
      this.setHeader('content-type', 'text/plain; charset=utf-8');
      buf = Buffer.from('', 'utf8');
    } else if (typeof data === 'number' || typeof data === 'boolean') {
      this.setHeader('content-type', 'text/plain; charset=utf-8');
      buf = Buffer.from(String(data), 'utf8');
    } else if (Buffer.isBuffer(data)) {
      if (!this.get('content-type')) {
        this.setHeader('content-type', 'application/octet-stream');
      }
      buf = data;
    } else if (typeof data === 'string') {
      if (!this.get('content-type')) {
        this.setHeader('content-type', 'text/html; charset=utf-8');
      }
      buf = Buffer.from(data, 'utf8');
    } else {
      // Array or object
      this.setHeader('content-type', 'application/json; charset=utf-8');
      buf = Buffer.from(JSON.stringify(data), 'utf8');
    }

    return this.end(buf);
  }

  sendFile(filePath: string, options: SendFileOptions = {}): InvokeResponse {
    const root = options.root || '/';
    const resolved = path.resolve(root, filePath);

    let data: Buffer;
    try {
      data = fs.readFileSync(resolved);
    } catch (readErr: any) {
      const code = readErr.code === 'ENOENT' ? 404 : readErr.code === 'EACCES' ? 403 : 500;
      return this.sendStatus(code);
    }

    const mimeType = mime.contentType(mime.lookup(resolved) || '');
    if (mimeType) {
      this.setHeader('Content-Type', mimeType);
    }

    this.setHeader('Content-Length', String(data.length));

    if (options.maxAge !== undefined && options.cacheControl !== false) {
      const maxAgeSeconds = Math.floor(options.maxAge / 1000);
      this.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
    }

    if (options.lastModified !== false) {
      try {
        const stats = fs.statSync(resolved);
        if (stats.mtime) {
          this.setHeader('Last-Modified', stats.mtime.toUTCString());
        }
      } catch {
        // Skip metadata
      }
    }

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        this.setHeader(key, value);
      }
    }

    return this.send(data);
  }

  download(filePath: string, filename?: string, options?: SendFileOptions): InvokeResponse {
    this.attachment(filename || path.basename(filePath));
    return this.sendFile(filePath, options);
  }

  attachment(filename?: string): InvokeResponse {
    if (filename) {
      const needsEncoding = /[^\x20-\x7E]/.test(filename);
      if (needsEncoding) {
        const encoded = encodeURIComponent(filename);
        this.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`);
      } else {
        const escaped = filename.replace(/"/g, '\\"');
        this.setHeader('Content-Disposition', `attachment; filename="${escaped}"`);
      }
    } else {
      this.setHeader('Content-Disposition', 'attachment');
    }
    return this;
  }

  redirect(statusOrUrl: number | string, url?: string): InvokeResponse {
    let statusCode = 302;
    let location: string;

    if (typeof statusOrUrl === 'number') {
      statusCode = statusOrUrl;
      location = url!;
    } else {
      location = statusOrUrl;
    }

    if (location === 'back') {
      location = this.req.get('Referrer') || this.req.get('Referer') || '/';
    }

    this.setHeader('Location', location);
    this.status(statusCode);
    this.type('html');

    const escapedUrl = location
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return this.end(`<p>Found. Redirecting to <a href="${escapedUrl}">${escapedUrl}</a></p>`);
  }

  location(url: string): InvokeResponse {
    this.setHeader('Location', url);
    return this;
  }

  type(type: string): InvokeResponse {
    const mimeType = mime.contentType(type);
    if (mimeType) {
      this.setHeader('Content-Type', mimeType as string);
    }
    return this;
  }

  contentType(type: string): InvokeResponse {
    return this.type(type);
  }

  cookie(name: string, value: unknown, options: CookieOptions = {}): InvokeResponse {
    const encoder = options.encode || encodeURIComponent;
    let cookieValue: string;

    if (typeof value === 'object' && value !== null) {
      cookieValue = 'j:' + encoder(JSON.stringify(value));
    } else {
      cookieValue = encoder(String(value));
    }

    let cookie = `${name}=${cookieValue}`;
    cookie += `; Path=${options.path || '/'}`;

    if (options.domain) cookie += `; Domain=${options.domain}`;

    if (options.maxAge !== undefined) {
      const maxAgeSeconds = Math.floor(options.maxAge / 1000);
      cookie += `; Max-Age=${maxAgeSeconds}`;
      const expires = new Date(Date.now() + options.maxAge);
      cookie += `; Expires=${expires.toUTCString()}`;
    } else if (options.expires) {
      const expDate = options.expires instanceof Date ? options.expires : new Date(options.expires);
      cookie += `; Expires=${expDate.toUTCString()}`;
    }

    if (options.httpOnly) cookie += '; HttpOnly';
    if (options.secure) cookie += '; Secure';

    if (options.sameSite) {
      const sameSite = typeof options.sameSite === 'string'
        ? options.sameSite
        : (options.sameSite === true ? 'Strict' : '');
      if (sameSite) cookie += `; SameSite=${sameSite}`;
    }

    this.append('Set-Cookie', cookie);
    return this;
  }

  clearCookie(name: string, options: CookieOptions = {}): InvokeResponse {
    return this.cookie(name, '', { ...options, expires: new Date(1), maxAge: 0 });
  }

  setHeader(name: string, value: string): InvokeResponse {
    this.state.headers[name.toLowerCase()] = value;
    return this;
  }

  set(name: string, value: string): InvokeResponse {
    return this.setHeader(name, value);
  }

  get(name: string): string | string[] | undefined {
    return this.state.headers[name.toLowerCase()];
  }

  append(field: string, value: string): InvokeResponse {
    const lowerName = field.toLowerCase();
    const existing = this.state.headers[lowerName];

    if (existing) {
      if (lowerName === 'set-cookie') {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          this.state.headers[lowerName] = [existing, value];
        }
      } else {
        this.state.headers[lowerName] = `${existing}, ${value}`;
      }
    } else {
      this.state.headers[lowerName] = value;
    }
    return this;
  }

  removeHeader(name: string): InvokeResponse {
    delete this.state.headers[name.toLowerCase()];
    return this;
  }

  writeHead(statusCode: number, statusMessage?: string | Record<string, string | string[]>, headers?: Record<string, string | string[]>): InvokeResponse {
    if (typeof statusMessage === 'object' && statusMessage !== null) {
      headers = statusMessage;
    }

    if (typeof statusCode !== 'number' || statusCode < 100 || statusCode > 999) {
      throw new Error('Invalid status code: ' + statusCode);
    }

    this.status(statusCode);

    if (headers && typeof headers === 'object') {
      for (const [name, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
          for (const val of value) {
            this.append(name, val);
          }
        } else {
          this.setHeader(name, value);
        }
      }
    }

    return this;
  }

  end(data?: unknown): InvokeResponse {
    this.headersSent = true;
    this.state.finished = true;

    if (data !== undefined) {
      if (Buffer.isBuffer(data)) {
        this.state.data = data;
      } else {
        this.state.data = Buffer.from(String(data), 'utf8');
      }
    }

    if (this._endCallback) {
        this._endCallback(this);
        this._endCallback = undefined; // Ensure callback is only called once
    }

    return this;
  }

  async pipeFrom(fetchResponse: Response): Promise<void> {
    const blacklistedHeaders = ['transfer-encoding', 'content-length', 'connection', 'content-encoding'];

    fetchResponse.headers.forEach((value: string, key: string) => {
      if (blacklistedHeaders.includes(key.toLowerCase())) return;
      this.setHeader(key, value);
    });

    this.status(fetchResponse.status);

    const body = await fetchResponse.arrayBuffer();
    this.end(Buffer.from(body));
  }
}

/**
 * Convert internal ResponseState to the wire ResponseData format.
 */
export function stateToResponseData(state: ResponseState): ResponseData {
  return {
    statusCode: state.statusCode,
    headers: state.headers,
    body: state.data ? state.data.toString('base64') : null,
  };
}
