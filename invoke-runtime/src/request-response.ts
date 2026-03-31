// ============================================================================
// Request / Response — Express-compatible req & res mock objects
// Ported from invoke-execution/bundles/vm-bootstrap/99_request-response.js
// ============================================================================

import http from 'http';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import type { RequestData, ResponseData } from './protocol';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  for (const pair of cookieHeader.split(';')) {
    const trimmed = pair.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const name = trimmed.substring(0, eqIdx).trim();
    let value = trimmed.substring(eqIdx + 1).trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
}

function normalizeMimeType(type: string | undefined): string {
  if (!type) return '';
  return type.toLowerCase().split(';')[0].trim();
}

function matchMimeType(contentType: string | undefined, type: string): string | false {
  const normalizedContent = normalizeMimeType(contentType);
  let targetType = (mime.lookup(type) || type) as string;
  targetType = normalizeMimeType(targetType);

  if (!normalizedContent || !targetType) return false;
  if (normalizedContent === targetType) return targetType;

  const [contentMain, contentSub] = normalizedContent.split('/');
  const [targetMain, targetSub] = targetType.split('/');

  if (targetMain === '*' && targetSub === '*') return targetType;
  if (targetMain === contentMain && targetSub === '*') return targetType;
  if (targetMain === '*' && targetSub === contentSub) return targetType;

  return false;
}

interface AcceptEntry {
  type: string;
  quality: number;
  specificity: number;
}

function parseAcceptHeader(acceptHeader: string | undefined): AcceptEntry[] {
  if (!acceptHeader) return [];

  const types: AcceptEntry[] = [];

  for (const part of acceptHeader.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^\s*([^;]+)(?:;q=([0-9.]+))?\s*$/);
    if (!match) continue;

    const type = match[1].trim();
    const q = match[2] ? parseFloat(match[2]) : 1.0;
    if (isNaN(q) || q < 0 || q > 1) continue;

    let specificity = 1;
    if (type !== '*/*') {
      const [main, sub] = type.split('/');
      if (main !== '*' && sub !== '*') specificity = 3;
      else if (main !== '*' || sub !== '*') specificity = 2;
    }

    types.push({ type, quality: q, specificity });
  }

  types.sort((a, b) => {
    if (b.quality !== a.quality) return b.quality - a.quality;
    return b.specificity - a.specificity;
  });

  return types;
}

// ---------------------------------------------------------------------------
// Request object
// ---------------------------------------------------------------------------

export interface InvokeRequest {
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
  cookies: Record<string, string>;
  baseUrl: string;
  xhr: boolean;
  subdomains: string[];
  get(headerName: string): string | undefined;
  header(headerName: string): string | undefined;
  is(type: string | string[]): string | false;
  accepts(types?: string | string[]): string | string[] | false;
  param(name: string, defaultValue?: unknown): unknown;
}

export function createReqObject(reqData: RequestData): InvokeRequest {
  const reqObj: InvokeRequest = {
    ...reqData,
    cookies: parseCookies(reqData.headers['cookie']),
    baseUrl: '',

    get xhr(): boolean {
      const val = reqObj.headers['x-requested-with'];
      return val ? val.toLowerCase() === 'xmlhttprequest' : false;
    },

    get subdomains(): string[] {
      return [];
    },

    get(headerName: string): string | undefined {
      return reqObj.headers[headerName.toLowerCase()];
    },

    header(headerName: string): string | undefined {
      return reqObj.get(headerName);
    },

    is(type: string | string[]): string | false {
      const contentType = reqObj.headers['content-type'];
      if (!contentType) return false;

      if (Array.isArray(type)) {
        for (const t of type) {
          const match = matchMimeType(contentType, t);
          if (match) return match;
        }
        return false;
      }

      return matchMimeType(contentType, type);
    },

    accepts(types?: string | string[]): string | string[] | false {
      const acceptHeader = reqObj.headers['accept'] || '*/*';
      const parsed = parseAcceptHeader(acceptHeader);

      if (!types) {
        return parsed.map((p) => p.type);
      }

      const typeList = typeof types === 'string' ? [types] : types;

      for (const acceptType of parsed) {
        for (const providedType of typeList) {
          if (matchMimeType(acceptType.type, providedType)) {
            return providedType;
          }
        }
      }

      return false;
    },

    param(name: string, defaultValue?: unknown): unknown {
      return reqObj.params[name] ?? reqObj.query[name] ?? (reqObj.body as any)?.[name] ?? defaultValue;
    },
  };

  return reqObj;
}

// ---------------------------------------------------------------------------
// Response object
// ---------------------------------------------------------------------------

export interface InvokeResponse {
  statusCode: number;
  headersSent: boolean;
  status(code: number): InvokeResponse;
  sendStatus(code: number): InvokeResponse;
  json(data: unknown): InvokeResponse;
  send(data?: unknown): InvokeResponse;
  sendFile(filePath: string, options?: SendFileOptions): InvokeResponse;
  download(filePath: string, filename?: string, options?: SendFileOptions): InvokeResponse;
  attachment(filename?: string): InvokeResponse;
  redirect(statusOrUrl: number | string, url?: string): InvokeResponse;
  location(url: string): InvokeResponse;
  type(type: string): InvokeResponse;
  contentType(type: string): InvokeResponse;
  cookie(name: string, value: unknown, options?: CookieOptions): InvokeResponse;
  clearCookie(name: string, options?: CookieOptions): InvokeResponse;
  setHeader(name: string, value: string): InvokeResponse;
  set(name: string, value: string): InvokeResponse;
  get(name: string): string | string[] | undefined;
  append(field: string, value: string): InvokeResponse;
  removeHeader(name: string): InvokeResponse;
  writeHead(statusCode: number, statusMessage?: string | Record<string, string | string[]>, headers?: Record<string, string | string[]>): InvokeResponse;
  end(data?: unknown): InvokeResponse;
  pipeFrom(fetchResponse: Response): Promise<void>;
}

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

export function createResObject(req: InvokeRequest): { res: InvokeResponse; state: ResponseState } {
  const state: ResponseState = {
    statusCode: 200,
    headers: {},
    data: undefined,
    finished: false,
  };

  const res: InvokeResponse = {
    get statusCode() {
      return state.statusCode;
    },
    headersSent: false,

    status(code: number) {
      state.statusCode = code;
      return res;
    },

    sendStatus(code: number) {
      const message = http.STATUS_CODES[code] || 'Unknown';
      return res.status(code).type('txt').send(message);
    },

    json(data: unknown) {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(data));
    },

    send(data?: unknown) {
      if (data === undefined) {
        res.removeHeader('Content-Type');
        return res.status(204).end();
      }

      let buf: Buffer;

      if (data === null) {
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        buf = Buffer.from('', 'utf8');
      } else if (typeof data === 'number' || typeof data === 'boolean') {
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        buf = Buffer.from(String(data), 'utf8');
      } else if (Buffer.isBuffer(data)) {
        if (!res.get('content-type')) {
          res.setHeader('content-type', 'application/octet-stream');
        }
        buf = data;
      } else if (typeof data === 'string') {
        if (!res.get('content-type')) {
          res.setHeader('content-type', 'text/html; charset=utf-8');
        }
        buf = Buffer.from(data, 'utf8');
      } else {
        // Array or object
        res.setHeader('content-type', 'application/json; charset=utf-8');
        buf = Buffer.from(JSON.stringify(data), 'utf8');
      }

      return res.end(buf);
    },

    sendFile(filePath: string, options: SendFileOptions = {}) {
      const root = options.root || '/';
      const resolved = path.resolve(root, filePath);

      let data: Buffer;
      try {
        data = fs.readFileSync(resolved);
      } catch (readErr: any) {
        const code = readErr.code === 'ENOENT' ? 404 : readErr.code === 'EACCES' ? 403 : 500;
        return res.sendStatus(code);
      }

      const mimeType = mime.contentType(mime.lookup(resolved) || '');
      if (mimeType) {
        res.setHeader('Content-Type', mimeType);
      }

      res.setHeader('Content-Length', String(data.length));

      if (options.maxAge !== undefined && options.cacheControl !== false) {
        const maxAgeSeconds = Math.floor(options.maxAge / 1000);
        res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
      }

      if (options.lastModified !== false) {
        try {
          const stats = fs.statSync(resolved);
          if (stats.mtime) {
            res.setHeader('Last-Modified', stats.mtime.toUTCString());
          }
        } catch {
          // Skip metadata
        }
      }

      if (options.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
          res.setHeader(key, value);
        }
      }

      return res.send(data);
    },

    download(filePath: string, filename?: string, options?: SendFileOptions) {
      res.attachment(filename || path.basename(filePath));
      return res.sendFile(filePath, options);
    },

    attachment(filename?: string) {
      if (filename) {
        const needsEncoding = /[^\x20-\x7E]/.test(filename);
        if (needsEncoding) {
          const encoded = encodeURIComponent(filename);
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`);
        } else {
          const escaped = filename.replace(/"/g, '\\"');
          res.setHeader('Content-Disposition', `attachment; filename="${escaped}"`);
        }
      } else {
        res.setHeader('Content-Disposition', 'attachment');
      }
      return res;
    },

    redirect(statusOrUrl: number | string, url?: string) {
      let statusCode = 302;
      let location: string;

      if (typeof statusOrUrl === 'number') {
        statusCode = statusOrUrl;
        location = url!;
      } else {
        location = statusOrUrl;
      }

      if (location === 'back') {
        location = req.get('Referrer') || req.get('Referer') || '/';
      }

      res.setHeader('Location', location);
      res.status(statusCode);
      res.type('html');

      const escapedUrl = location
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return res.end(`<p>Found. Redirecting to <a href="${escapedUrl}">${escapedUrl}</a></p>`);
    },

    location(url: string) {
      res.setHeader('Location', url);
      return res;
    },

    type(type: string) {
      const mimeType = mime.contentType(type);
      if (mimeType) {
        res.setHeader('Content-Type', mimeType as string);
      }
      return res;
    },

    contentType(type: string) {
      return res.type(type);
    },

    cookie(name: string, value: unknown, options: CookieOptions = {}) {
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

      res.append('Set-Cookie', cookie);
      return res;
    },

    clearCookie(name: string, options: CookieOptions = {}) {
      return res.cookie(name, '', { ...options, expires: new Date(1), maxAge: 0 });
    },

    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
      return res;
    },

    set(name: string, value: string) {
      return res.setHeader(name, value);
    },

    get(name: string): string | string[] | undefined {
      return state.headers[name.toLowerCase()];
    },

    append(field: string, value: string) {
      const lowerName = field.toLowerCase();
      const existing = state.headers[lowerName];

      if (existing) {
        if (lowerName === 'set-cookie') {
          if (Array.isArray(existing)) {
            existing.push(value);
          } else {
            state.headers[lowerName] = [existing, value];
          }
        } else {
          state.headers[lowerName] = `${existing}, ${value}`;
        }
      } else {
        state.headers[lowerName] = value;
      }
      return res;
    },

    removeHeader(name: string) {
      delete state.headers[name.toLowerCase()];
      return res;
    },

    writeHead(statusCode: number, statusMessage?: string | Record<string, string | string[]>, headers?: Record<string, string | string[]>) {
      if (typeof statusMessage === 'object' && statusMessage !== null) {
        headers = statusMessage;
      }

      if (typeof statusCode !== 'number' || statusCode < 100 || statusCode > 999) {
        throw new Error('Invalid status code: ' + statusCode);
      }

      res.status(statusCode);

      if (headers && typeof headers === 'object') {
        for (const [name, value] of Object.entries(headers)) {
          if (Array.isArray(value)) {
            for (const val of value) {
              res.append(name, val);
            }
          } else {
            res.setHeader(name, value);
          }
        }
      }

      return res;
    },

    end(data?: unknown) {
      res.headersSent = true;
      state.finished = true;

      if (data !== undefined) {
        if (Buffer.isBuffer(data)) {
          state.data = data;
        } else {
          state.data = Buffer.from(String(data), 'utf8');
        }
      }

      return res;
    },

    async pipeFrom(fetchResponse: Response) {
      const blacklistedHeaders = ['transfer-encoding', 'content-length', 'connection', 'content-encoding'];

      fetchResponse.headers.forEach((value: string, key: string) => {
        if (blacklistedHeaders.includes(key.toLowerCase())) return;
        res.setHeader(key, value);
      });

      res.status(fetchResponse.status);

      const body = await fetchResponse.arrayBuffer();
      res.end(Buffer.from(body));
    },
  };

  return { res, state };
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
