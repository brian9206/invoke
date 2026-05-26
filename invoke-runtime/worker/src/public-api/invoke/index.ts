import serveStatic from './serve-static'
import serveSpa from './serve-spa'
import serveNext from './serve-next'
import type { ServeStaticOptions } from './serve-static'
import type { ServeSpaOptions } from './serve-spa'
import type { ServeNextOptions } from './serve-next'
import type { InvokeHandler } from '../exchange'

interface InvokeServe {
  /**
   * Create a new handler function to serve files from within a given root directory. The file to serve will be determined by combining req.url with the provided root directory. When a file is not found, instead of sending a 404 response, this module will instead call next() to move on to the next middleware, allowing for stacking and fall-backs.
   */
  static(root: string, options?: ServeStaticOptions): InvokeHandler

  /**
   * Create a new handler function to serve a single-page application (SPA) from within a given root directory. The SPA handler will use the HTML5 history API fallback to serve the index file for all non-file requests.
   */
  spa(root: string, options?: ServeSpaOptions): InvokeHandler

  /**
   * Create a new handler function to serve a Next.js application from within a given Next.js standalone directory. The Next.js handler will handle server-side rendering and API routes.
   */
  next(options?: ServeNextOptions): InvokeHandler
}

const invoke: { serve: InvokeServe } = {
  serve: {
    static: serveStatic,
    spa: serveSpa,
    next: serveNext
  }
}
export default invoke

export type InvokeGlobals = typeof invoke

declare global {
  /** Globals. */
  var invoke: InvokeGlobals
}

/**
 * Expose InvokeGlobals as a global so user
 * code can use `invoke` without any imports.
 * @internal
 */
export function setupGlobals(): void {
  globalThis.invoke = invoke
}
