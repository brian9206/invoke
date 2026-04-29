// ============================================================================
// Response — Express-compatible response mock object
// ============================================================================

import http from 'http'
import path from 'path'
import fs from 'fs'
import mime from 'mime-types'

/** @internal */
import type { ResponseData } from '../../protocol'

import { InvokeRequest } from './request'

/**
 * Options for `res.sendFile()` and `res.download()`.
 */
export interface SendFileOptions {
  /** Root directory to resolve the file path against. Defaults to `'/'`. */
  root?: string
  /** Cache max-age in milliseconds for the `Cache-Control` header. */
  maxAge?: number
  /** Whether to set the `Cache-Control` header. Defaults to `true`. */
  cacheControl?: boolean
  /** Whether to set the `Last-Modified` header. Defaults to `true`. */
  lastModified?: boolean
  /** Additional response headers to include. */
  headers?: Record<string, string>
}

/**
 * Cookie options for `res.cookie()` and `res.clearCookie()`.
 */
export interface CookieOptions {
  /** Cookie path. Defaults to `'/'`. */
  path?: string
  /** Cookie domain scope. */
  domain?: string
  /** Max-age in seconds. */
  maxAge?: number
  /** Explicit expiry date. */
  expires?: Date | string
  /** Restrict cookie to HTTP(S) only; inaccessible from JavaScript. */
  httpOnly?: boolean
  /** Only transmit the cookie over HTTPS. */
  secure?: boolean
  /** `SameSite` attribute: `'strict'`, `'lax'`, `'none'`, or a boolean. */
  sameSite?: string | boolean
  /** Custom encoder applied to the cookie value before serialization. */
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
 * Express-compatible response object passed to function handlers.
 */
export class InvokeResponse {
  /** @internal */
  readonly state: ResponseState
  /** `true` once the response headers have been flushed to the client. */
  headersSent = false

  /** @internal */
  constructor(
    private readonly req: InvokeRequest,
    private _endCallback?: (res: InvokeResponse) => void
  ) {
    this.state = {
      statusCode: 200,
      headers: {},
      data: undefined,
      finished: false
    }
  }

  /**
   * Current HTTP status code.
   * @returns The current status code.
   */
  get statusCode(): number {
    return this.state.statusCode
  }

  /**
   * Set the response HTTP status code.
   * @param code HTTP status code.
   * @returns The response instance.
   */
  status(code: number): InvokeResponse {
    this.state.statusCode = code
    return this
  }

  /**
   * Set status and send its default status message body.
   * @param code HTTP status code.
   * @returns The response instance.
   */
  sendStatus(code: number): InvokeResponse {
    const message = http.STATUS_CODES[code] || 'Unknown'
    return this.status(code).type('txt').send(message)
  }

  /**
   * Send a JSON response body.
   * @param data Serializable payload.
   * @returns The response instance.
   */
  json(data: unknown): InvokeResponse {
    this.setHeader('content-type', 'application/json; charset=utf-8')
    return this.end(JSON.stringify(data))
  }

  /**
   * Send a response body and infer content type when needed.
   * @param data Response body to send.
   * @returns The response instance.
   */
  send(data?: unknown): InvokeResponse {
    if (data === undefined) {
      this.removeHeader('Content-Type')
      return this.status(204).end()
    }

    let buf: Buffer

    if (data === null) {
      this.setHeader('content-type', 'text/plain; charset=utf-8')
      buf = Buffer.from('', 'utf8')
    } else if (typeof data === 'number' || typeof data === 'boolean') {
      this.setHeader('content-type', 'text/plain; charset=utf-8')
      buf = Buffer.from(String(data), 'utf8')
    } else if (Buffer.isBuffer(data)) {
      if (!this.get('content-type')) {
        this.setHeader('content-type', 'application/octet-stream')
      }
      buf = data
    } else if (typeof data === 'string') {
      if (!this.get('content-type')) {
        this.setHeader('content-type', 'text/html; charset=utf-8')
      }
      buf = Buffer.from(data, 'utf8')
    } else {
      // Array or object
      this.setHeader('content-type', 'application/json; charset=utf-8')
      buf = Buffer.from(JSON.stringify(data), 'utf8')
    }

    return this.end(buf)
  }

  /**
   * Send a file from ephemeral storage.
   * @param filePath File path to send.
   * @param options File sending options.
   * @returns The response instance.
   */
  sendFile(filePath: string, options: SendFileOptions = {}): InvokeResponse {
    const root = options.root || '/'
    const resolved = path.resolve(root, filePath)

    let data: Buffer
    try {
      data = fs.readFileSync(resolved)
    } catch (readErr: any) {
      const code = readErr.code === 'ENOENT' ? 404 : readErr.code === 'EACCES' ? 403 : 500
      return this.sendStatus(code)
    }

    const mimeType = mime.contentType(mime.lookup(resolved) || '')
    if (mimeType) {
      this.setHeader('Content-Type', mimeType)
    }

    this.setHeader('Content-Length', String(data.length))

    if (options.maxAge !== undefined && options.cacheControl !== false) {
      const maxAgeSeconds = Math.floor(options.maxAge / 1000)
      this.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`)
    }

    if (options.lastModified !== false) {
      try {
        const stats = fs.statSync(resolved)
        if (stats.mtime) {
          this.setHeader('Last-Modified', stats.mtime.toUTCString())
        }
      } catch {
        // Skip metadata
      }
    }

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        this.setHeader(key, value)
      }
    }

    return this.send(data)
  }

  /**
   * Send a file as a download attachment.
   * @param filePath File path to download.
   * @param filename Optional download name.
   * @param options File sending options.
   * @returns The response instance.
   */
  download(filePath: string, filename?: string, options?: SendFileOptions): InvokeResponse {
    this.attachment(filename || path.basename(filePath))
    return this.sendFile(filePath, options)
  }

  /**
   * Set `Content-Disposition` as attachment.
   * @param filename Optional attachment filename.
   * @returns The response instance.
   */
  attachment(filename?: string): InvokeResponse {
    if (filename) {
      const needsEncoding = /[^\x20-\x7E]/.test(filename)
      if (needsEncoding) {
        const encoded = encodeURIComponent(filename)
        this.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`)
      } else {
        const escaped = filename.replace(/"/g, '\\"')
        this.setHeader('Content-Disposition', `attachment; filename="${escaped}"`)
      }
    } else {
      this.setHeader('Content-Disposition', 'attachment')
    }
    return this
  }

  /**
   * Redirect to another URL using the given status or default 302.
   * @param statusOrUrl Status code or redirect URL.
   * @param url Redirect URL when the first argument is a status code.
   * @returns The response instance.
   */
  redirect(statusOrUrl: number | string, url?: string): InvokeResponse {
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

    this.setHeader('Location', location)
    this.status(statusCode)
    this.type('html')

    const escapedUrl = location
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    return this.end(`<p>Found. Redirecting to <a href="${escapedUrl}">${escapedUrl}</a></p>`)
  }

  /**
   * Set the `Location` header.
   * @param url Redirect target.
   * @returns The response instance.
   */
  location(url: string): InvokeResponse {
    this.setHeader('Location', url)
    return this
  }

  /**
   * Set response content type by extension or mime type.
   * @param type Extension or mime type.
   * @returns The response instance.
   */
  type(type: string): InvokeResponse {
    const mimeType = mime.contentType(type)
    if (mimeType) {
      this.setHeader('Content-Type', mimeType as string)
    }
    return this
  }

  /**
   * Alias of `res.type(type)`.
   * @param type Extension or mime type.
   * @returns The response instance.
   */
  contentType(type: string): InvokeResponse {
    return this.type(type)
  }

  /**
   * Set a response cookie.
   * @param name Cookie name.
   * @param value Cookie value.
   * @param options Cookie options.
   * @returns The response instance.
   */
  cookie(name: string, value: unknown, options: CookieOptions = {}): InvokeResponse {
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

    this.append('Set-Cookie', cookie)
    return this
  }

  /**
   * Clear a response cookie.
   * @param name Cookie name.
   * @param options Cookie options.
   * @returns The response instance.
   */
  clearCookie(name: string, options: CookieOptions = {}): InvokeResponse {
    return this.cookie(name, '', { ...options, expires: new Date(1), maxAge: 0 })
  }

  /**
   * Set a response header value.
   * @param name Header name.
   * @param value Header value.
   * @returns The response instance.
   */
  setHeader(name: string, value: string): InvokeResponse {
    this.state.headers[name.toLowerCase()] = value
    return this
  }

  /**
   * Alias of `res.setHeader(name, value)`.
   * @param name Header name.
   * @param value Header value.
   * @returns The response instance.
   */
  set(name: string, value: string): InvokeResponse {
    return this.setHeader(name, value)
  }

  /**
   * Get a response header value.
   * @param name Header name.
   * @returns The header value, or `undefined`.
   */
  get(name: string): string | string[] | undefined {
    return this.state.headers[name.toLowerCase()]
  }

  /**
   * Append a value to an existing response header.
   * @param field Header name.
   * @param value Header value to append.
   * @returns The response instance.
   */
  append(field: string, value: string): InvokeResponse {
    const lowerName = field.toLowerCase()
    const existing = this.state.headers[lowerName]

    if (existing) {
      if (lowerName === 'set-cookie') {
        if (Array.isArray(existing)) {
          existing.push(value)
        } else {
          this.state.headers[lowerName] = [existing, value]
        }
      } else {
        this.state.headers[lowerName] = `${existing}, ${value}`
      }
    } else {
      this.state.headers[lowerName] = value
    }
    return this
  }

  /**
   * Remove a response header.
   * @param name Header name.
   * @returns The response instance.
   */
  removeHeader(name: string): InvokeResponse {
    delete this.state.headers[name.toLowerCase()]
    return this
  }

  /**
   * Set status and headers in one call.
   * @param statusCode HTTP status code.
   * @param statusMessage Optional status message or headers object.
   * @param headers Optional headers object.
   * @returns The response instance.
   */
  writeHead(
    statusCode: number,
    statusMessage?: string | Record<string, string | string[]>,
    headers?: Record<string, string | string[]>
  ): InvokeResponse {
    if (typeof statusMessage === 'object' && statusMessage !== null) {
      headers = statusMessage
    }

    if (typeof statusCode !== 'number' || statusCode < 100 || statusCode > 999) {
      throw new Error('Invalid status code: ' + statusCode)
    }

    this.status(statusCode)

    if (headers && typeof headers === 'object') {
      for (const [name, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
          for (const val of value) {
            this.append(name, val)
          }
        } else {
          this.setHeader(name, value)
        }
      }
    }

    return this
  }

  /**
   * Finalize and send the response.
   * @param data Optional response body.
   * @returns The response instance.
   */
  end(data?: unknown): InvokeResponse {
    this.headersSent = true
    this.state.finished = true

    if (data !== undefined) {
      if (Buffer.isBuffer(data)) {
        this.state.data = data
      } else {
        this.state.data = Buffer.from(String(data), 'utf8')
      }
    }

    if (this._endCallback) {
      this._endCallback(this)
      this._endCallback = undefined // Ensure callback is only called once
    }

    return this
  }

  /**
   * Pipe a Fetch API `Response` into this response object.
   * @param fetchResponse Source fetch response.
   * @returns A promise that resolves after the response is copied.
   */
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
