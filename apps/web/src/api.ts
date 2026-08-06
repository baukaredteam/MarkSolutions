import { sessionStore } from "./session";

// Единый формат ошибок (Приложение B ТЗ, ADR-017)
export interface ApiError {
  code: number;
  message: string;
  details: unknown;
  fieldErrors: Record<string, string>;
  correlationId: string;
  retryable: boolean;
}

export class ApiErrorResponse extends Error {
  constructor(readonly error: ApiError) {
    super(error.message);
  }
}

export class ApiUnavailable extends Error {
  constructor() {
    super("Сервис недоступен");
  }
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

export class FetchApiClient implements ApiClient {
  constructor(private readonly base: string = "/api") {}

  async get<T>(path: string): Promise<T> {
    return this.request("GET", path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": sessionStore.get()?.tenantId ?? "",
          Accept: "*/*",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiUnavailable();
    }

    if (res.ok) {
      return (await res.json()) as T;
    }

    let err: ApiError;
    try {
      err = (await res.json()) as ApiError;
    } catch {
      err = {
        code: res.status,
        message: res.statusText,
        details: null,
        fieldErrors: {},
        correlationId: "",
        retryable: res.status >= 500,
      };
    }
    throw new ApiErrorResponse(err);
  }
}

export const api: ApiClient = new FetchApiClient();
