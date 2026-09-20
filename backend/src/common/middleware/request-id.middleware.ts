import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

/** Header carrying the correlation id, in and out. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Assigns each request a correlation id and echoes it back.
 *
 * Middleware, deliberately, not an interceptor: middleware is the first
 * stage of the request lifecycle and runs for *every* request, whereas
 * interceptors only run once a route has matched. A 404 or a request
 * rejected before routing would otherwise reach the exception filter
 * with no id attached, leaving the error unable to be correlated with
 * its logs — which is exactly when you most want to correlate it.
 *
 * An inbound x-request-id is preserved so a caller (the LiveKit agent,
 * say) can trace one logical action across services.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = sanitize(request.headers[REQUEST_ID_HEADER]);

    request.headers[REQUEST_ID_HEADER] = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }
}

/** Safe correlation-id characters: uuid, ULID, and similar opaque tokens. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Accept a caller's id only if it is short and opaque.
 *
 * These ids end up in the audit trail, which is a compliance artifact —
 * an unbounded, unvalidated header would let a caller write arbitrary
 * content there (or forge another session's id), and oversized values
 * break some upstream proxies.
 */
function sanitize(value: unknown): string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value)
    ? value
    : randomUUID();
}
