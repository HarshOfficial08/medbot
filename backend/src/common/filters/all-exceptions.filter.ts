import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorResponseDto } from '../dto/error-response.dto.js';

/**
 * Catch-all filter producing one consistent error shape.
 *
 * Per CLAUDE.md, a filter shapes the error response and nothing else —
 * no business logic lives here. Registered globally (via APP_FILTER) so
 * it also covers errors thrown in middleware, which method- and
 * controller-scoped filters would miss.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const { error, message } = this.describe(exception);

    // 5xx means we broke something — keep the stack. 4xx is the caller
    // being wrong, which is expected traffic, not an incident.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}`);
    }

    // Nest's own BaseExceptionFilter guards this: if the response has
    // already started streaming, writing again throws
    // ERR_HTTP_HEADERS_SENT from inside the filter and masks the
    // original error.
    if (response.headersSent) {
      return;
    }

    const body: ErrorResponseDto = {
      statusCode: status,
      error,
      message,
      path: request.url,
      requestId: String(request.headers['x-request-id'] ?? ''),
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    error: string;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { error: exception.name, message: payload };
      }

      const record = payload as Record<string, unknown>;
      return {
        error:
          typeof record.error === 'string' ? record.error : exception.name,
        message: (record.message ?? exception.message) as string | string[],
      };
    }

    // Never leak an internal error's details to the caller; the stack is
    // in the logs above, correlated by requestId.
    return {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    };
  }
}
