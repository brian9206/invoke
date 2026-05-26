// ============================================================================
// Exchange — Request/Response module exports
// ============================================================================

/** @internal */
import type { RequestData } from '../../protocol'

import { InvokeRequest } from './request'
import { InvokeResponse } from './response'
import type { ResponseState } from './response'

export { InvokeRequest } from './request'
export { InvokeResponse } from './response'
/** @internal */
export { stateToResponseData } from './response'
export type { SendFileOptions, CookieOptions } from './response'
/** @internal */
export type { ResponseState } from './response'
export { type AcceptEntry } from './helpers'

/** @internal */
export function createReqObject(reqData: RequestData): InvokeRequest {
  return new InvokeRequest(reqData)
}

/** @internal */
export function createResObject(
  req: InvokeRequest,
  endCallback?: (res: InvokeResponse) => void
): { res: InvokeResponse; state: ResponseState } {
  const res = new InvokeResponse(req, endCallback)
  return { res, state: res.state }
}

export type InvokeHandlerCallback = (err?: any) => Promise<unknown> | unknown

/**
 * Request handler used by the Invoke.
 * @param req Incoming request object.
 * @param res Outgoing response object.
 * @param next Optional callback to continue to the next matching handler.
 * @returns Any value returned by the handler.
 */
export type InvokeHandler = (
  req: InvokeRequest,
  res: InvokeResponse,
  next: InvokeHandlerCallback
) => Promise<unknown> | unknown
