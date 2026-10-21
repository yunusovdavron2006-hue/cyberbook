import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

/**
 * Wraps every successful controller result in the standard envelope:
 *   { success: true, message: string, data: unknown }
 * Errors are handled by HttpExceptionFilter using the same shape.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T> | T> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'success' in (data as object) && 'data' in (data as object)) {
          return data; // already enveloped (rare)
        }
        return { success: true, message: 'OK', data } as ApiEnvelope<T>;
      }),
    );
  }
}
