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

    const response =
      exception instanceof HttpException
        ? (exception.getResponse() as unknown)
        : undefined;

    const message =
      typeof response === "string"
        ? response
        : (((response as Record<string, unknown> | null)?.message as unknown as
            string | undefined) ??
          (exception instanceof Error ? exception.message : undefined) ??
          "Internal server error");

    // AT-03: пробрасываем fieldErrors из кастомного body (validateAttributes)
    const rawFe =
      response &&
      typeof response === "object" &&
      typeof (response as { fieldErrors?: unknown }).fieldErrors === "object"
        ? (response as { fieldErrors: Record<string, string> }).fieldErrors
        : undefined;
    const fieldErrors: Record<string, string> = rawFe ?? {};
    const rawDetails =
      response && typeof response === "object"
        ? (response as { details?: unknown }).details
        : undefined;
    const details: unknown = rawDetails ?? null;

    const body: ApiError = {
      code: status,
      message: String(message),
      details,
      fieldErrors,
      correlationId: randomUUID(),
      retryable: status >= 500,
    };

    res.status(status).json(body);
  }
}
