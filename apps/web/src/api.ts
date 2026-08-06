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
  postRaw<T>(path: string, body: unknown): Promise<{ status: number; body: T }>;
}

export class FetchApiClient implements ApiClient {
  constructor(private readonly base: string = "/api") {}

  async get<T>(path: string): Promise<T> {
    const { body } = await this.request("GET", path);
    return body as T;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const { body: data } = await this.request("POST", path, body);
    return data as T;
  }

  async postRaw<T>(
    path: string,
    body: unknown
  ): Promise<{ status: number; body: T }> {
    return this.request("POST", path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; body: T }> {
    const sess = sessionStore.get();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "*/*",
    };
    if (sess?.token) headers["Authorization"] = `Bearer ${sess.token}`;
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiUnavailable();
    }

    if (res.ok) {
      return { status: res.status, body: (await res.json()) as T };
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
