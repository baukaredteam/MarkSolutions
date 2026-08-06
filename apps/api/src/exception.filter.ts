import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

// Единый формат ошибок (Приложение B ТЗ): code, message, details, fieldErrors, correlationId, retryable
interface ApiError {
  code: number;
  message: string;
  details: unknown;
  fieldErrors: Record<string, string>;
  correlationId: string;
  retryable: boolean;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? ((exception.getResponse() as { message?: string }).message ??
          exception.message)
        : "Internal server error";

    const body: ApiError = {
      code: status,
      message: String(message),
      details: null,
      fieldErrors: {},
      correlationId: randomUUID(),
      retryable: status >= 500,
    };

    res.status(status).json(body);
  }
}
