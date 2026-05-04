// ============================================================================
// Request — Express-compatible request mock object
// ============================================================================

/** @internal */
import type { RequestData } from '../../protocol'
import { parseCookies, matchMimeType, parseAcceptHeader } from './helpers'

/**
 * Express-compatible request object passed to function handlers.
 */
export class InvokeRequest {
  /** HTTP method in upper-case (e.g. `"GET"`, `"POST"`). */
  method: string
  /** Full request URL including query string. */
  url: string
  /** Unmodified original request URL. */
  originalUrl: string
  /** URL pathname without the query string. */
  path: string
  /** Request protocol: `"http"` or `"https"`. */
  protocol: string
  /** Hostname from the `Host` header, without the port. */
  hostname: string
  /** `true` when the connection uses TLS (`protocol === "https"`). */
  secure: boolean
  /** Remote IP address of the client. */
  ip: string
  /** List of IP addresses from the `X-Forwarded-For` header, nearest-first. */
  ips: string[]
  /** Parsed request body. Value depends on the content type. */
  body: unknown
  /** Parsed query string parameters. */
  query: Record<string, string>
  /** Route parameters extracted by the router (e.g. `req.params.id`). */
  params: Record<string, string>
  /** Incoming request headers (all names are lower-cased). */
  headers: Record<string, string>
  /** Parsed cookies from the `Cookie` header. */
  cookies: Record<string, string>
  /** URL prefix where the router was mounted. */
  baseUrl: string

  /** @internal */
  constructor(reqData: RequestData) {
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
    this.baseUrl = ''
  }

  /**
   * True when the request was made with `XMLHttpRequest`.
   * @returns `true` when the request originated from XHR.
   */
  get xhr(): boolean {
    const val = this.headers['x-requested-with']
    return val ? val.toLowerCase() === 'xmlhttprequest' : false
  }

  /**
   * Parsed subdomains from hostname.
   * @returns A list of subdomains.
   */
  get subdomains(): string[] {
    return []
  }

  /**
   * Read a request header value by name (case-insensitive).
   * @param headerName Header name to read.
   * @returns The header value if present.
   */
  get(headerName: string): string | undefined {
    return this.headers[headerName.toLowerCase()]
  }

  /**
   * Alias of `req.get(headerName)`.
   * @param headerName Header name to read.
   * @returns The header value if present.
   */
  header(headerName: string): string | undefined {
    return this.get(headerName)
  }

  /**
   * Check whether the request content type matches a mime type.
   * @param type Mime type or list of mime types to compare against.
   * @returns The matched type or `false` when there is no match.
   */
  is(type: string | string[]): string | false {
    const contentType = this.headers['content-type']
    if (!contentType) return false

    if (Array.isArray(type)) {
      for (const t of type) {
        const match = matchMimeType(contentType, t)
        if (match) return match
      }
      return false
    }

    return matchMimeType(contentType, type)
  }

  /**
   * Negotiate response content type using the request `Accept` header.
   * @param types Candidate mime types. Omit to return accepted types in priority order.
   * @returns The first acceptable provided type, all accepted types, or `false` when no type matches.
   */
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
      }
    }

    return false
  }

  /**
   * Read a parameter from `params`, `query`, or `body` in that order.
   * @param name Parameter name.
   * @param defaultValue Value returned when the parameter is missing.
   * @returns The found parameter value or the provided default value.
   */
  param(name: string, defaultValue?: unknown): unknown {
    return this.params[name] ?? this.query[name] ?? (this.body as any)?.[name] ?? defaultValue
  }
}
