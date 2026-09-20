import { NextFunction, Request, Response } from 'express';
import {
  REQUEST_ID_HEADER,
  RequestIdMiddleware,
} from './request-id.middleware.js';

function makeReqRes(headers: Record<string, string> = {}) {
  const request = { headers } as unknown as Request;
  const setHeaders: Record<string, string> = {};
  const response = {
    setHeader(key: string, value: string) {
      setHeaders[key] = value;
    },
  } as unknown as Response;

  return { request, response, setHeaders };
}

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  it('generates an id when the caller did not supply one', () => {
    const { request, response, setHeaders } = makeReqRes();
    const next = vi.fn() as unknown as NextFunction;

    middleware.use(request, response, next);

    expect(request.headers[REQUEST_ID_HEADER]).toMatch(/[0-9a-f-]{36}/);
    expect(setHeaders[REQUEST_ID_HEADER]).toBe(request.headers[REQUEST_ID_HEADER]);
    expect(next).toHaveBeenCalled();
  });

  it('preserves a caller-supplied id so one action can be traced across services', () => {
    const { request, response, setHeaders } = makeReqRes({
      [REQUEST_ID_HEADER]: 'agent-session-7',
    });

    middleware.use(request, response, vi.fn() as unknown as NextFunction);

    expect(request.headers[REQUEST_ID_HEADER]).toBe('agent-session-7');
    expect(setHeaders[REQUEST_ID_HEADER]).toBe('agent-session-7');
  });
});
