import { ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

interface CapturedResponse {
  status: number;
  body: Record<string, unknown>;
}

function makeHost(url = '/doctors', requestId = 'req-1'): {
  host: ArgumentsHost;
  captured: CapturedResponse;
} {
  const captured: CapturedResponse = { status: 0, body: {} };

  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      captured.body = payload;
      return this;
    },
  };

  const request = { url, method: 'GET', headers: { 'x-request-id': requestId } };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, captured };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('preserves the status and message of an HttpException', () => {
    const { host, captured } = makeHost();

    filter.catch(new BadRequestException('name should not be empty'), host);

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body.message).toBe('name should not be empty');
    expect(captured.body.error).toBe('Bad Request');
  });

  it('keeps field-level validation messages as an array', () => {
    const { host, captured } = makeHost();

    filter.catch(
      new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: ['name should not be empty', 'age must be a number'],
      }),
      host,
    );

    expect(captured.body.message).toEqual([
      'name should not be empty',
      'age must be a number',
    ]);
  });

  it('turns an unknown error into a 500 without leaking internals', () => {
    const { host, captured } = makeHost();

    filter.catch(new Error('connection string user:hunter2 refused'), host);

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body.message).toBe('An unexpected error occurred.');
    // The real point of this test: internal details must never reach the client.
    expect(JSON.stringify(captured.body)).not.toContain('hunter2');
  });

  it('includes the correlation id and path so an error can be traced', () => {
    const { host, captured } = makeHost('/appointments/APT-1', 'req-42');

    filter.catch(new HttpException('Nope', HttpStatus.CONFLICT), host);

    expect(captured.body.requestId).toBe('req-42');
    expect(captured.body.path).toBe('/appointments/APT-1');
    expect(captured.body.timestamp).toEqual(expect.any(String));
  });
});
