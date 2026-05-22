// ============================================================================
// Response — Full Node.js http.ServerResponse + Express 5.x drop-in replacement
// ============================================================================

import http from 'http'
import path from 'path'
import fs from 'fs'
import mime from 'mime-types'
import { EventEmitter } from 'events'

/** @internal */
import type { ResponseData } from '../../protocol'

import { InvokeRequest } from './request'

/**
 * Options for `res.sendFile()` and `res.download()`.
 */
export interface SendFileOptions {
  root?: string
  maxAge?: number
  cacheControl?: boolean
  lastModified?: boolean
  headers?: Record<string, string>
}

/**
 * Cookie options for `res.cookie()` and `res.clearCookie()`.
 */
export interface CookieOptions {
  path?: string
  domain?: string
  maxAge?: number
  expires?: Date | string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string | boolean
  encode?: (val: string) => string
}

/** @internal */
export interface ResponseState {
  statusCode: number
  headers: Record<string, string | string[]>
  data: Buffer | undefined
  finished: boolean
}

/**
 * Drop-in replacement for http.ServerResponse + Express 5.x response.
 * Implements all methods/properties without inheriting from http.ServerResponse.
 */
export class InvokeResponse extends EventEmitter {
  /** @internal */
  readonly state: ResponseState

  // --- http.ServerResponse properties ---
  statusCode: number = 200
  statusMessage: string = 'OK'
  headersSent: boolean = false
  writableEnded: boolean = false
  writableFinished: boolean = false
  writable: boolean = true
  finished: boolean = false
  connection: any = null
  socket: any = null
  chunkedEncoding: boolean = false
  shouldKeepAlive: boolean = false
  useChunkedEncodingByDefault: boolean = true
  sendDate: boolean = true

  // Express locals
  locals: Record<string, any> = {}

  /** @internal */
  private _chunks: Buffer[] = []

  /** @internal */
  constructor(
    public req: InvokeRequest,
    private _endCallback?: (res: InvokeResponse) => void
  ) {
    super()
    this.state = {
      statusCode: 200,
      headers: {},
      data: undefined,
      finished: false
    }
  }

  // ===========================================================================
  // http.ServerResponse — header methods
  // ===========================================================================

  setHeader(name: string, value: string | number | string[]): this {
    if (Array.isArray(value)) {
      this.state.headers[name.toLowerCase()] = value
    } else {
      this.state.headers[name.toLowerCase()] = String(value)
    }
    return this
  }

  getHeader(name: string): string | string[] | number | undefined {
    return this.state.headers[name.toLowerCase()]
  }

  getHeaders(): Record<string, string | string[] | undefined> {
    return { ...this.state.headers }
  }

  getHeaderNames(): string[] {
    return Object.keys(this.state.headers)
  }

  hasHeader(name: string): boolean {
    return name.toLowerCase() in this.state.headers
  }

  removeHeader(name: string): this {
    delete this.state.headers[name.toLowerCase()]
    return this
  }

  appendHeader(name: string, value: string | string[]): this {
    const lowerName = name.toLowerCase()
    const existing = this.state.headers[lowerName]

    if (existing) {
      if (Array.isArray(existing)) {
        if (Array.isArray(value)) {
          existing.push(...value)
        } else {
          existing.push(value)
        }
      } else {
        if (Array.isArray(value)) {
          this.state.headers[lowerName] = [existing, ...value]
        } else {
          if (lowerName === 'set-cookie') {
            this.state.headers[lowerName] = [existing, value]
          } else {
            this.state.headers[lowerName] = `${existing}, ${value}`
          }
        }
      }
    } else {
      if (Array.isArray(value)) {
        this.state.headers[lowerName] = value
      } else {
        this.state.headers[lowerName] = value
      }
    }
    return this
  }

  flushHeaders(): void {
    this.headersSent = true
  }

  // ===========================================================================
  // http.ServerResponse — write/end methods
  // ===========================================================================

  writeHead(
    statusCode: number,
    statusMessage?: string | Record<string, string | string[] | number>,
    headers?: Record<string, string | string[] | number>
  ): this {
    if (typeof statusMessage === 'object' && statusMessage !== null) {
      headers = statusMessage
      statusMessage = undefined
    }

    this.statusCode = statusCode
    this.state.statusCode = statusCode

    if (typeof statusMessage === 'string') {
      this.statusMessage = statusMessage
    }

    if (headers && typeof headers === 'object') {
      for (const [name, value] of Object.entries(headers)) {
        if (value !== undefined) {
          this.setHeader(name, value as any)
        }
      }
    }

    this.headersSent = true
    return this
  }

  writeProcessing(): void {
    // No-op in serverless
  }

  write(chunk: any, encoding?: BufferEncoding | (() => void), callback?: () => void): boolean {
    if (typeof encoding === 'function') {
      callback = encoding
      encoding = undefined
    }

    if (chunk !== undefined && chunk !== null) {
      if (Buffer.isBuffer(chunk)) {
        this._chunks.push(chunk)
      } else {
        this._chunks.push(Buffer.from(String(chunk), encoding || 'utf8'))
      }
    }

    if (callback) callback()
    return true
  }

  end(data?: any, encoding?: BufferEncoding | (() => void), callback?: () => void): this {
    if (typeof data === 'function') {
      callback = data
      data = undefined
      encoding = undefined
    } else if (typeof encoding === 'function') {
      callback = encoding
      encoding = undefined
    }

    if (data !== undefined && data !== null) {
      if (Buffer.isBuffer(data)) {
        this._chunks.push(data)
      } else {
        this._chunks.push(Buffer.from(String(data), (encoding as BufferEncoding) || 'utf8'))
      }
    }

    // Assemble final body
    if (this._chunks.length > 0) {
      this.state.data = Buffer.concat(this._chunks)
    }

    this.headersSent = true
    this.writableEnded = true
    this.writableFinished = true
    this.writable = false
    this.finished = true
    this.state.finished = true
    this.state.statusCode = this.statusCode

    this.emit('finish')
    this.emit('close')

    if (this._endCallback) {
      this._endCallback(this)
      this._endCallback = undefined
    }

    if (callback) callback()
    return this
  }

  // Writable stream compat
  destroy(_error?: Error): this {
    this.writable = false
    this.writableEnded = true
    return this
  }

  cork(): void {}
  uncork(): void {}

  addTrailers(_headers: Record<string, string>): void {
    // No-op — trailers not supported in serverless
  }

  setTimeout(_msecs: number, _callback?: () => void): this {
    return this
  }

  // ===========================================================================
  // Express 5.x response methods
  // ===========================================================================

  status(code: number): this {
    this.statusCode = code
    this.state.statusCode = code
    return this
  }

  sendStatus(code: number): this {
    const message = http.STATUS_CODES[code] || 'Unknown'
    return this.status(code).type('txt').send(message)
  }

  json(data: unknown): this {
    this.setHeader('content-type', 'application/json; charset=utf-8')
    const body = JSON.stringify(data)
    this.setHeader('content-length', Buffer.byteLength(body).toString())
    return this.end(body)
  }

  jsonp(data: unknown): this {
    const body = JSON.stringify(data)
    const callback = this.req.query['callback']

    if (callback) {
      this.setHeader('content-type', 'text/javascript; charset=utf-8')
      this.setHeader('x-content-type-options', 'nosniff')
      const sanitizedCb = callback.replace(/[^\[\]\w$.]/g, '')
      const result = `/**/ typeof ${sanitizedCb} === 'function' && ${sanitizedCb}(${body});`
      return this.end(result)
    }

    return this.json(data)
  }

  send(data?: any): this {
    if (data === undefined || data === null) {
      if (data === undefined && this.statusCode === 200) {
        this.statusCode = 204
        this.state.statusCode = 204
      }
      this.removeHeader('content-type')
      this.removeHeader('content-length')
      this.removeHeader('transfer-encoding')
      return this.end()
    }

    let buf: Buffer
    let type = this.getHeader('content-type') as string | undefined

    if (typeof data === 'number' || typeof data === 'boolean') {
      if (!type) {
        this.setHeader('content-type', 'text/plain; charset=utf-8')
      }
      buf = Buffer.from(String(data), 'utf8')
    } else if (Buffer.isBuffer(data)) {
      if (!type) {
        this.setHeader('content-type', 'application/octet-stream')
      }
      buf = data
    } else if (typeof data === 'string') {
      if (!type) {
        this.setHeader('content-type', 'text/html; charset=utf-8')
      }
      buf = Buffer.from(data, 'utf8')
    } else {
      // object/array
      this.setHeader('content-type', 'application/json; charset=utf-8')
      buf = Buffer.from(JSON.stringify(data), 'utf8')
    }

    this.setHeader('content-length', buf.length.toString())
    return this.end(buf)
  }

  sendFile(
    filePath: string,
    options: SendFileOptions | ((...args: any[]) => void) = {},
    fn?: (...args: any[]) => void
  ): this {
    if (typeof options === 'function') {
      fn = options
      options = {}
    }

    const opts = options as SendFileOptions
    const root = opts.root || '/'
    const resolved = path.resolve(root, filePath)

    let data: Buffer
    try {
      data = fs.readFileSync(resolved)
    } catch (readErr: any) {
      if (fn) {
        fn(readErr)
        return this
      }
      const code = readErr.code === 'ENOENT' ? 404 : readErr.code === 'EACCES' ? 403 : 500
      return this.sendStatus(code)
    }

    const mimeType = mime.contentType(mime.lookup(resolved) || '')
    if (mimeType) {
      this.setHeader('content-type', mimeType)
    }

    this.setHeader('content-length', String(data.length))

    if (opts.maxAge !== undefined && opts.cacheControl !== false) {
      const maxAgeSeconds = Math.floor(opts.maxAge / 1000)
      this.setHeader('cache-control', `public, max-age=${maxAgeSeconds}`)
    }

    if (opts.lastModified !== false) {
      try {
        const stats = fs.statSync(resolved)
        if (stats.mtime) {
          this.setHeader('last-modified', stats.mtime.toUTCString())
        }
      } catch {
        // Skip
      }
    }

    if (opts.headers) {
      for (const [key, value] of Object.entries(opts.headers)) {
        this.setHeader(key, value)
      }
    }

    if (fn) fn()
    return this.end(data)
  }

  download(
    filePath: string,
    filename?: string | ((...args: any[]) => void),
    options?: SendFileOptions | ((...args: any[]) => void),
    fn?: (...args: any[]) => void
  ): this {
    if (typeof filename === 'function') {
      fn = filename
      filename = undefined
    }
    if (typeof options === 'function') {
      fn = options
      options = undefined
    }
    this.attachment((filename as string) || path.basename(filePath))
    return this.sendFile(filePath, options || {}, fn)
  }

  attachment(filename?: string): this {
    if (filename) {
      const mimeType = mime.contentType(mime.lookup(filename) || '')
      if (mimeType) {
        this.setHeader('content-type', mimeType)
      }
      const needsEncoding = /[^\x20-\x7E]/.test(filename)
      if (needsEncoding) {
        const encoded = encodeURIComponent(filename)
        this.setHeader('content-disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`)
      } else {
        const escaped = filename.replace(/"/g, '\\"')
        this.setHeader('content-disposition', `attachment; filename="${escaped}"`)
      }
    } else {
      this.setHeader('content-disposition', 'attachment')
    }
    return this
  }

  redirect(statusOrUrl: number | string, url?: string): this {
    let statusCode = 302
    let location: string

    if (typeof statusOrUrl === 'number') {
      statusCode = statusOrUrl
      location = url!
    } else {
      location = statusOrUrl
    }

    if (location === 'back') {
      location = this.req.get('Referrer') || this.req.get('Referer') || '/'
    }

    this.setHeader('location', location)
    this.status(statusCode)
    this.type('html')

    const escapedUrl = location
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    return this.end(`<p>${http.STATUS_CODES[statusCode]}. Redirecting to <a href="${escapedUrl}">${escapedUrl}</a></p>`)
  }

  location(url: string): this {
    this.setHeader('location', url)
    return this
  }

  type(type: string): this {
    const mimeType = mime.contentType(type)
    if (mimeType) {
      this.setHeader('content-type', mimeType as string)
    }
    return this
  }

  contentType(type: string): this {
    return this.type(type)
  }

  format(obj: Record<string, () => void>): this {
    const keys = Object.keys(obj).filter(k => k !== 'default')

    const type = this.req.accepts(keys)
    if (type) {
      this.setHeader('content-type', (mime.contentType(type as string) || type) as string)
      obj[type as string]()
    } else if (obj.default) {
      obj.default()
    } else {
      this.status(406).end()
    }
    return this
  }

  links(links: Record<string, string>): this {
    const link = Object.entries(links)
      .map(([rel, url]) => `<${url}>; rel="${rel}"`)
      .join(', ')
    const existing = this.getHeader('link')
    if (existing) {
      this.setHeader('link', `${existing}, ${link}`)
    } else {
      this.setHeader('link', link)
    }
    return this
  }

  vary(field: string | string[]): this {
    const fields = Array.isArray(field) ? field : [field]
    const existing = (this.getHeader('vary') as string) || ''
    const current = existing ? existing.split(',').map(s => s.trim().toLowerCase()) : []

    const toAdd = fields.filter(f => {
      if (f === '*') return true
      return !current.includes(f.toLowerCase())
    })

    if (toAdd.includes('*')) {
      this.setHeader('vary', '*')
    } else if (toAdd.length > 0) {
      const newVal = existing ? `${existing}, ${toAdd.join(', ')}` : toAdd.join(', ')
      this.setHeader('vary', newVal)
    }
    return this
  }

  cookie(name: string, value: unknown, options: CookieOptions = {}): this {
    const encoder = options.encode || encodeURIComponent
    let cookieValue: string

    if (typeof value === 'object' && value !== null) {
      cookieValue = 'j:' + encoder(JSON.stringify(value))
    } else {
      cookieValue = encoder(String(value))
    }

    let cookie = `${name}=${cookieValue}`
    cookie += `; Path=${options.path || '/'}`

    if (options.domain) cookie += `; Domain=${options.domain}`

    if (options.maxAge !== undefined) {
      const maxAgeSeconds = Math.floor(options.maxAge / 1000)
      cookie += `; Max-Age=${maxAgeSeconds}`
      const expires = new Date(Date.now() + options.maxAge)
      cookie += `; Expires=${expires.toUTCString()}`
    } else if (options.expires) {
      const expDate = options.expires instanceof Date ? options.expires : new Date(options.expires)
      cookie += `; Expires=${expDate.toUTCString()}`
    }

    if (options.httpOnly) cookie += '; HttpOnly'
    if (options.secure) cookie += '; Secure'

    if (options.sameSite) {
      const sameSite =
        typeof options.sameSite === 'string' ? options.sameSite : options.sameSite === true ? 'Strict' : ''
      if (sameSite) cookie += `; SameSite=${sameSite}`
    }

    this.append('set-cookie', cookie)
    return this
  }

  clearCookie(name: string, options: CookieOptions = {}): this {
    return this.cookie(name, '', { ...options, expires: new Date(1), maxAge: 0 })
  }

  // Express-style `set` / `header` (overloaded: single or object)
  set(field: string | Record<string, string | string[]>, value?: string | string[]): this {
    if (typeof field === 'object') {
      for (const [key, val] of Object.entries(field)) {
        this.setHeader(key, val as any)
      }
      return this
    }
    if (value !== undefined) {
      this.setHeader(field, value as any)
    }
    return this
  }

  header(field: string | Record<string, string | string[]>, value?: string | string[]): this {
    return this.set(field, value)
  }

  get(name: string): string | string[] | number | undefined {
    return this.getHeader(name)
  }

  append(field: string, value: string | string[]): this {
    return this.appendHeader(field, value)
  }

  // ===========================================================================
  // Pipe from Fetch API Response
  // ===========================================================================

  async pipeFrom(fetchResponse: Response): Promise<void> {
    const blacklistedHeaders = ['transfer-encoding', 'content-length', 'connection', 'content-encoding']

    fetchResponse.headers.forEach((value: string, key: string) => {
      if (blacklistedHeaders.includes(key.toLowerCase())) return
      this.setHeader(key, value)
    })

    this.status(fetchResponse.status)

    const body = await fetchResponse.arrayBuffer()
    this.end(Buffer.from(body))
  }

  // ===========================================================================
  // render() — stubbed (requires view engine)
  // ===========================================================================

  render(_view: string, _options?: Record<string, any>, _callback?: (err: Error | null, html?: string) => void): void {
    throw new Error('res.render() is not supported. Use a framework adapter or pre-render templates.')
  }
}

/**
 * Convert internal ResponseState to the wire ResponseData format.
 * @internal
 */
export function stateToResponseData(state: ResponseState): ResponseData {
  return {
    statusCode: state.statusCode,
    headers: state.headers,
    body: state.data ? state.data.toString('base64') : null
  }
}
