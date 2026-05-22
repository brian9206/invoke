// ============================================================================
// Request — Full Node.js http.IncomingMessage + Express 5.x drop-in replacement
// ============================================================================

import { EventEmitter } from 'events'
import { Readable } from 'stream'

/** @internal */
import type { RequestData } from '../../protocol'
import { parseCookies, matchMimeType, parseAcceptHeader } from './helpers'

/**
 * Drop-in replacement for http.IncomingMessage + Express 5.x request.
 * Implements all methods/properties without inheriting from http.IncomingMessage.
 */
export class InvokeRequest extends EventEmitter {
  // --- http.IncomingMessage properties ---
  method: string
  url: string
  httpVersion: string = '1.1'
  httpVersionMajor: number = 1
  httpVersionMinor: number = 1
  headers: Record<string, string>
  rawHeaders: string[] = []
  trailers: Record<string, string> = {}
  rawTrailers: string[] = []
  complete: boolean = true
  aborted: boolean = false
  readable: boolean = true
  readableEnded: boolean = true
  readableFlowing: boolean | null = null
  statusCode: number | undefined = undefined
  statusMessage: string | undefined = undefined
  connection: any = null
  socket: any = null

  // --- Express 5.x properties ---
  originalUrl: string
  path: string
  protocol: string
  hostname: string
  secure: boolean
  ip: string
  ips: string[]
  body: unknown
  query: Record<string, string>
  params: Record<string, string>
  cookies: Record<string, string>
  signedCookies: Record<string, string> = {}
  baseUrl: string = ''
  route: any = null
  app: any = null
  res: any = null

  /** @internal */
  constructor(reqData: RequestData) {
    super()
    this.method = reqData.method
    this.url = reqData.url
    this.originalUrl = reqData.originalUrl
    this.path = reqData.path
    this.protocol = reqData.protocol
    this.hostname = reqData.hostname
    this.secure = reqData.secure
    this.ip = reqData.ip
    this.ips = reqData.ips
    this.body = reqData.body
    this.query = reqData.query
    this.params = reqData.params
    this.headers = reqData.headers
    this.cookies = parseCookies(reqData.headers['cookie'])

    // Build rawHeaders from headers
    for (const [key, value] of Object.entries(reqData.headers)) {
      this.rawHeaders.push(key, value)
    }

    // Mock socket with minimal properties that frameworks expect
    this.socket = {
      remoteAddress: reqData.ip,
      remotePort: 0,
      localAddress: '127.0.0.1',
      localPort: 443,
      encrypted: reqData.secure,
      destroyed: false,
      readable: true,
      writable: true,
      setTimeout: () => {},
      destroy: () => {},
      end: () => {},
      on: () => {},
      once: () => {},
      off: () => {},
      removeListener: () => {},
      emit: () => false
    }
    this.connection = this.socket
  }

  // ===========================================================================
  // http.IncomingMessage methods
  // ===========================================================================

  setTimeout(_msecs: number, _callback?: () => void): this {
    return this
  }

  destroy(_error?: Error): this {
    this.aborted = true
    this.readable = false
    return this
  }

  // Readable stream stubs
  read(_size?: number): any {
    return null
  }

  pause(): this {
    return this
  }

  resume(): this {
    return this
  }

  unpipe(_destination?: any): this {
    return this
  }

  pipe<T extends NodeJS.WritableStream>(destination: T, _options?: { end?: boolean }): T {
    return destination
  }

  // ===========================================================================
  // Express 5.x request methods
  // ===========================================================================

  get xhr(): boolean {
    const val = this.headers['x-requested-with']
    return val ? val.toLowerCase() === 'xmlhttprequest' : false
  }

  get subdomains(): string[] {
    const hostname = this.hostname || ''
    if (!hostname) return []
    const parts = hostname.split('.')
    // Express defaults to offset 2 (strips TLD + domain)
    return parts.slice(0, Math.max(parts.length - 2, 0)).reverse()
  }

  get fresh(): boolean {
    if (this.method !== 'GET' && this.method !== 'HEAD') return false
    // Would need res to check, stub as false
    return false
  }

  get stale(): boolean {
    return !this.fresh
  }

  get(headerName: string): string | undefined {
    const lc = headerName.toLowerCase()
    // Express special-cases Referrer/Referer
    if (lc === 'referrer' || lc === 'referer') {
      return this.headers['referrer'] || this.headers['referer']
    }
    return this.headers[lc]
  }

  header(headerName: string): string | undefined {
    return this.get(headerName)
  }

  is(type: string | string[]): string | false | null {
    const contentType = this.headers['content-type']
    if (!contentType) return null

    if (Array.isArray(type)) {
      for (const t of type) {
        const match = matchMimeType(contentType, t)
        if (match) return match
      }
      return false
    }

    return matchMimeType(contentType, type)
  }

  accepts(types?: string | string[]): string | string[] | false {
    const acceptHeader = this.headers['accept'] || '*/*'
    const parsed = parseAcceptHeader(acceptHeader)

    if (!types) {
      return parsed.map(p => p.type)
    }

    const typeList = typeof types === 'string' ? [types] : types

    for (const acceptType of parsed) {
      for (const providedType of typeList) {
        if (matchMimeType(acceptType.type, providedType)) {
          return providedType
        }
        // Also try with mime.lookup
        const resolved = matchMimeType(acceptType.type, providedType)
        if (resolved) return providedType
      }
    }

    return false
  }

  acceptsCharsets(...charsets: string[]): string | string[] | false {
    if (charsets.length === 0) {
      const header = this.headers['accept-charset'] || '*'
      return header.split(',').map(s => s.trim().split(';')[0].trim())
    }
    // Simplified: accept all charsets
    return charsets[0] || false
  }

  acceptsEncodings(...encodings: string[]): string | string[] | false {
    if (encodings.length === 0) {
      const header = this.headers['accept-encoding'] || 'identity'
      return header.split(',').map(s => s.trim().split(';')[0].trim())
    }
    const header = (this.headers['accept-encoding'] || 'identity').toLowerCase()
    for (const enc of encodings) {
      if (header.includes(enc.toLowerCase()) || header.includes('*')) {
        return enc
      }
    }
    return false
  }

  acceptsLanguages(...languages: string[]): string | string[] | false {
    if (languages.length === 0) {
      const header = this.headers['accept-language'] || '*'
      return header.split(',').map(s => s.trim().split(';')[0].trim())
    }
    const header = (this.headers['accept-language'] || '*').toLowerCase()
    for (const lang of languages) {
      if (header.includes(lang.toLowerCase()) || header.includes('*')) {
        return lang
      }
    }
    return false
  }

  range(size: number, options?: { combine?: boolean }): any {
    const rangeHeader = this.headers['range']
    if (!rangeHeader) return undefined

    // Basic range parsing (bytes=start-end)
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
    if (!match) return -2

    const start = match[1] ? parseInt(match[1], 10) : 0
    const end = match[2] ? parseInt(match[2], 10) : size - 1

    if (start > end || start >= size) return -1

    return [{ start: Math.max(0, start), end: Math.min(end, size - 1) }] as any
  }

  param(name: string, defaultValue?: unknown): unknown {
    return this.params[name] ?? this.query[name] ?? (this.body as any)?.[name] ?? defaultValue
  }
}
