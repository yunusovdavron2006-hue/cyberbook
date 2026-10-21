import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const body =
        typeof payload === 'string'
          ? { success: false, message: payload, code: 'ERROR' }
          : (payload as Record<string, unknown>);
      response.status(status).json({
        success: false,
        message: body.message ?? 'Error',
        code: body.code ?? 'ERROR',
        details: body.details ?? undefined,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Prisma unique/exclusion violations surface as P2002 / 23P01.
    const prismaError = exception as { code?: string; message?: string };
    if (prismaError?.code === 'P2002') {
      response.status(HttpStatus.CONFLICT).json({
        success: false,
        message: 'A record with the same unique value already exists',
        code: 'UNIQUE_VIOLATION',
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (
      prismaError?.code === '23P01' ||
      (typeof prismaError?.message === 'string' && prismaError.message.includes('exclusion constraint'))
    ) {
      response.status(HttpStatus.CONFLICT).json({
        success: false,
        message: 'The requested time overlaps with an existing reservation',
        code: 'BOOKING_CONFLICT',
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Never leak stack traces or internal messages.
    console.error('[unhandled]', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
