import path from 'path'
import history, { Rewrite } from 'connect-history-api-fallback'
import serveStatic, { ServeStaticOptions } from './serve-static'
import { Router } from '../router'
import type { InvokeHandler, InvokeResponse } from '../exchange'

export interface ServeSpaOptions extends ServeStaticOptions {
  /**
   * The path of the index file. Defaults to '/index.html'.
   */
  index?: string | undefined

  /**
   * Disable the dot rule (don't rewrite requests to files with dots in the name).
   */
  disableDotRule?: true | undefined

  /**
   * Accept headers for HTML content. Default is ['text/html', 'application/xhtml+xml'].
   */
  htmlAcceptHeaders?: string[] | undefined

  /**
   * Array of rewrite rules to apply before serving files.
   */
  rewrites?: Rewrite[] | undefined

  /**
   * Enable verbose logging for history API fallback behavior.
   */
  verbose?: boolean | undefined
}

export default function createServeSpaHandler(root: string, options?: ServeSpaOptions): InvokeHandler {
  const index = options?.index || '/index.html'
  const app = new Router()

  app.use(
    history({
      index,
      verbose: options?.verbose,
      disableDotRule: options?.disableDotRule,
      htmlAcceptHeaders: options?.htmlAcceptHeaders,
      rewrites: options?.rewrites
    })
  )

  app.use(
    serveStatic(root, {
      ...options,
      maxAge: options?.maxAge ?? '1y',
      immutable: options?.immutable ?? true,
      setHeaders: (res: InvokeResponse, filePath: string, stat: any) => {
        options?.setHeaders?.(res, filePath, stat)
        if (path.basename(filePath) === path.basename(index)) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')
        }
      }
    })
  )

  return app
}
