import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // If already wrapped (e.g., paginated response), pass through
        if (data && typeof data === 'object' && 'success' in data) return data;
        return {
          success: true,
          message: 'OK',
          data,
        };
      }),
    );
  }
}
