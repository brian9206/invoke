// ============================================================================
// Exchange — Request/Response module exports
// ============================================================================

import type { RequestData } from '../protocol';
import { InvokeRequest } from './request';
import { InvokeResponse } from './response';
import type { ResponseState } from './response';

export { InvokeRequest } from './request';
export { InvokeResponse, stateToResponseData } from './response';
export type { ResponseState } from './response';
export { type AcceptEntry } from './helpers';

export function createReqObject(reqData: RequestData): InvokeRequest {
  return new InvokeRequest(reqData);
}

export function createResObject(req: InvokeRequest, endCallback?: (res: InvokeResponse) => void): { res: InvokeResponse; state: ResponseState } {
  const res = new InvokeResponse(req, endCallback);
  return { res, state: res.state };
}