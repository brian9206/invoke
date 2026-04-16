// ============================================================================
// Request — Express-compatible request mock object
// ============================================================================

import type { RequestData } from '../protocol';
import { parseCookies, matchMimeType, parseAcceptHeader } from './helpers';

export class InvokeRequest {
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

  constructor(reqData: RequestData) {
    this.method = reqData.method;
    this.url = reqData.url;
    this.originalUrl = reqData.originalUrl;
    this.path = reqData.path;
    this.protocol = reqData.protocol;
    this.hostname = reqData.hostname;
    this.secure = reqData.secure;
    this.ip = reqData.ip;
    this.ips = reqData.ips;
    this.body = reqData.body;
    this.query = reqData.query;
    this.params = reqData.params;
    this.headers = reqData.headers;
    this.cookies = parseCookies(reqData.headers['cookie']);
    this.baseUrl = '';
  }

  get xhr(): boolean {
    const val = this.headers['x-requested-with'];
    return val ? val.toLowerCase() === 'xmlhttprequest' : false;
  }

  get subdomains(): string[] {
    return [];
  }

  get(headerName: string): string | undefined {
    return this.headers[headerName.toLowerCase()];
  }

  header(headerName: string): string | undefined {
    return this.get(headerName);
  }

  is(type: string | string[]): string | false {
    const contentType = this.headers['content-type'];
    if (!contentType) return false;

    if (Array.isArray(type)) {
      for (const t of type) {
        const match = matchMimeType(contentType, t);
        if (match) return match;
      }
      return false;
    }

    return matchMimeType(contentType, type);
  }

  accepts(types?: string | string[]): string | string[] | false {
    const acceptHeader = this.headers['accept'] || '*/*';
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
  }

  param(name: string, defaultValue?: unknown): unknown {
    return this.params[name] ?? this.query[name] ?? (this.body as any)?.[name] ?? defaultValue;
  }
}

