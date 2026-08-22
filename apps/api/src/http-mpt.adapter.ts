import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PrismaService } from "./prisma.service";
import type { AppConfig } from "./config-validation";
import type { MptWritePolicy } from "./mpt-write-policy";
import type {
  IMptAdapter,
  MptCodeView,
  MptOrderInput,
  MptOrderStatus,
} from "./integrations";

// HttpMptAdapter (C-01): реальный транспорт ИС МПТ (xTrace ver 1.0) за портом
// IMptAdapter (ADR-005). Контракт — docs/CONTRACT-IS-MPT.md (ЛОВУШКИ 1/3/4/5).
//
// Правила:
// - Accept: */* на КАЖДЫЙ запрос (ЛОВУШКА 3: без него 406 с пустым телом).
// - Auth: POST /api/users/authenticate (login/password из env, только сервер) →
//   accessToken+refreshToken. Refresh: POST /api/users/tokens/refresh,
//   Content-Type x-www-form-urlencoded (ЛОВУШКА 1: URL refresh, не authenticate).
// - Ровно ОДИН refresh на 401, затем повтор исходного запроса с тем же operation ID.
// - Backoff+jitter ТОЛЬКО для временных ошибок (5xx/504/network timeout);
//   4xx не ретраится. После исчерпания — бросок (поллер оставит outbox PENDING
//   для reconciliation).
// - documentBody doc/* = base64(JSON, ключи отсортированы A–Z ПЕРЕД base64;
//   массивы кодов as-is) (ЛОВУШКА 4).
// - businessPlaceId нормализуется в int32 (ЛОВУШКА 5).
// - credentials и refresh-токены живут только на сервере (in-memory адаптера),
//   в браузер не уходят. Эволюция: Redis/БД при горизонтальном масштабе.
//
// Пути doc/* уточняются контрактным тестом на STAGE (текущие — из CONTRACT-IS-MPT).
//
// Известные ограничения (не блокируют mock-режим):
// - doc/* и utilisation получают коды в том виде, в котором их отдаёт порт
//   (document.service шлёт внутренние codeKeys Vault; utilisation — serial).
//   Для реального контура это должно стать полными КМ из vault.reveal —
//   в скоупе тикетов 02/03 (http-режим для документов включать после них).
// - getOrder/getCodes фильтруют по orderId query-параметром; точный контракт
//   списков подтверждается контрактным тестом на STAGE.
// - requestId генерируется локально (трассировка в outbox), на провод не уходит.

export function toInt32(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new BadRequestException("businessPlaceId must be an int32 number");
  }
  const i = Math.trunc(n);
  if (i < 0 || i > 2147483647) {
    // businessPlaceId ИС МПТ — int32, отрицательные/вне диапазона недопустимы (ЛОВУШКА 5)
    throw new BadRequestException("businessPlaceId out of valid int32 range");
  }
  return i;
}

// Постоянная ошибка внешнего API (4xx/конфиг) — ретраить БЕСПОЛЕЗНО.
// Поллер различает её по флагу `permanent` и переводит outbox в FAILED + задача
// оператору, вместо вечного повторения PENDING (reconciliation — только временные).
export class MptPermanentError extends Error {
  readonly permanent = true;
  constructor(
    message: string,
    readonly status: number,
    readonly path: string
  ) {
    super(message);
    this.name = "MptPermanentError";
  }
}

// JSON с ключами, отсортированными A–Z РЕКУРСИВНО (ЛОВУШКА 4, перед base64);
// массивы остаются as-is (только элементы-объекты тоже сортируются рекурсивно).
function sortKeysRecursive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysRecursive);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    const src = value as Record<string, unknown>;
    for (const key of Object.keys(src).sort()) {
      sorted[key] = sortKeysRecursive(src[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(obj: Record<string, unknown>): string {
  return JSON.stringify(sortKeysRecursive(obj));
}

function base64Utf8(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

// backoff+jitter: base=100ms, ×2^attempt, jitter 0..base (только временные ошибки).
function backoffMs(attempt: number): number {
  const base = 100 * 2 ** attempt;
  return base + Math.floor(Math.random() * base);
}

interface RequestOptions {
  json?: unknown;
  form?: string;
  headers?: Record<string, string>;
  operationId: string;
}

@Injectable()
export class HttpMptAdapter implements IMptAdapter {
  private readonly baseUrl: string;
  private readonly login: string;
  private readonly password: string;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly productGroup: string;
  private readonly businessPlaceIdCfg: number | undefined;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private fetchImpl: typeof fetch = globalThis.fetch;

  constructor(
    config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly writePolicy: MptWritePolicy
  ) {
    this.baseUrl = (config.mpt.baseUrl ?? "").replace(/\/+$/, "");
    this.login = config.mpt.login ?? "";
    this.password = config.mpt.password ?? "";
    this.requestTimeoutMs = config.mpt.requestTimeoutMs;
    this.maxRetries = config.mpt.maxRetries;
    this.productGroup = config.mpt.productGroup ?? "motor-oils";
    const bp = config.mpt.businessPlaceId;
    this.businessPlaceIdCfg = bp ? toInt32(bp) : undefined;
  }

  // для unit-тестов (fake fetch)
  setFetch(fn: typeof fetch): void {
    this.fetchImpl = fn;
  }

  private async rawFetch(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    if (!this.login || !this.password) {
      throw new MptPermanentError(
        "MPT_LOGIN/MPT_PASSWORD not configured",
        0,
        "/api/users/authenticate"
      );
    }
    const res = await this.rawFetch("/api/users/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "*/*" },
      body: JSON.stringify({ login: this.login, password: this.password }),
    });
    if (!res.ok) {
      throw new MptPermanentError(
        `MPT authenticate failed: ${res.status}`,
        res.status,
        "/api/users/authenticate"
      );
    }
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    return data.accessToken;
  }

  private async refresh(): Promise<void> {
    if (!this.refreshToken) {
      throw new MptPermanentError(
        "MPT refresh token missing",
        0,
        "/api/users/tokens/refresh"
      );
    }
    const res = await this.rawFetch("/api/users/tokens/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "*/*",
      },
      body: new URLSearchParams({ refreshToken: this.refreshToken }).toString(),
    });
    if (!res.ok) {
      throw new MptPermanentError(
        `MPT refresh failed: ${res.status}`,
        res.status,
        "/api/users/tokens/refresh"
      );
    }
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken?: string;
    };
    this.accessToken = data.accessToken;
    if (data.refreshToken) this.refreshToken = data.refreshToken;
  }

  // Единый запрос: Accept */*, Bearer, 401→один refresh→повтор, backoff+jitter.
  private async request(
    path: string,
    method: string,
    opts: RequestOptions
  ): Promise<{ status: number; data: unknown }> {
    const headers: Record<string, string> = { Accept: "*/*" };
    let body: string | undefined;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    } else if (opts.form !== undefined) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = opts.form;
    }
    Object.assign(headers, opts.headers ?? {});

    let refreshed = false;
    for (let retry = 0; ; retry++) {
      let res: Response;
      try {
        const token = await this.ensureToken();
        res = await this.rawFetch(path, {
          method,
          headers: { ...headers, Authorization: `Bearer ${token}` },
          body,
        });
      } catch (e) {
        // постоянная ошибка (конфиг/auth) — ретрай бесполезен
        if (e instanceof MptPermanentError) throw e;
        // network/timeout — retryable: backoff+jitter, затем исчерпали → бросок
        if (retry < this.maxRetries) {
          await new Promise((r) => setTimeout(r, backoffMs(retry)));
          continue;
        }
        throw new Error(`MPT network error on ${path}: ${String(e)}`, {
          cause: e as Error,
        });
      }
      if (res.status === 401 && !refreshed) {
        await this.refresh();
        refreshed = true;
        continue; // повтор исходного запроса с тем же operation ID
      }
      const text = await res.text();
      let data: unknown = null;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
      }
      if (res.status === 401) {
        throw new MptPermanentError(
          `MPT auth failed on ${path} (operation ${opts.operationId})`,
          res.status,
          path
        );
      }
      if (res.status >= 500 || res.status === 504) {
        // временная ошибка — backoff+jitter, затем исчерпали → бросок
        if (retry < this.maxRetries) {
          await new Promise((r) => setTimeout(r, backoffMs(retry)));
          continue;
        }
        throw new Error(`MPT temporary failure on ${path}: ${res.status}`);
      }
      if (res.status >= 400) {
        // 4xx — постоянная ошибка; тело (детали валидации ИС МПТ) в сообщении
        const excerpt =
          typeof data === "string"
            ? data.slice(0, 200)
            : JSON.stringify(data).slice(0, 200);
        throw new MptPermanentError(
          `MPT ${opts.operationId} failed: ${res.status} on ${path}${
            excerpt && excerpt !== "null" ? ` — ${excerpt}` : ""
          }`,
          res.status,
          path
        );
      }
      return { status: res.status, data };
    }
  }

  // ---- Заказ (MARKING-CODE-ORDER.CREATE) ----
  async createOrder(input: MptOrderInput): Promise<{
    status: MptOrderStatus;
    requestId?: string;
  }> {
    this.writePolicy.assertAllowed("createOrder");
    const requestId = randomUUID();
    const businessPlaceId = input.businessPlaceId ?? this.businessPlaceIdCfg;
    const body: Record<string, unknown> = {
      productGroup: input.productGroup ?? this.productGroup,
      products: [
        {
          gtin: input.gtin,
          quantity: input.quantity,
          serialNumberType: input.serialNumberType,
          cisType: input.cisType,
        },
      ],
      isPaid: input.isPaid,
    };
    if (businessPlaceId !== undefined)
      body.businessPlaceId = toInt32(businessPlaceId);
    const { data } = await this.request("/api/orders", "POST", {
      json: body,
      operationId: input.orderId,
      headers: { "Idempotency-Key": input.orderId },
    });
    const d = data as { status?: string; orderId?: string };
    return { status: (d.status as MptOrderStatus) ?? "CREATED", requestId };
  }

  // GET /api/orders (список) — фильтр по заказу уточняется на STAGE контрактным тестом.
  async getOrder(orderId: string): Promise<{
    status: MptOrderStatus;
    quantity: number;
  }> {
    const { data } = await this.request(
      `/api/orders?orderId=${encodeURIComponent(orderId)}`,
      "GET",
      { operationId: orderId }
    );
    const d = data as { status?: string; quantity?: number };
    return {
      status: (d.status as MptOrderStatus) ?? "CREATED",
      quantity: Number(d.quantity ?? 0),
    };
  }

  // GET /api/codes (только READY/CLOSED) → codes[].
  async getCodes(orderId: string): Promise<{ codes: MptCodeView[] }> {
    const { data } = await this.request(
      `/api/codes?orderId=${encodeURIComponent(orderId)}`,
      "GET",
      { operationId: orderId }
    );
    const d = data as { codes?: Array<Record<string, unknown>> };
    const codes = (d.codes ?? []).map((c) => ({
      gtin: String(c.gtin ?? ""),
      serial: String(c.serial ?? ""),
      ai91: (c.ai91 as string | null) ?? null,
      ai92: (c.ai92 as string | null) ?? null,
      form: (c.form as "base" | "extended") ?? "base",
    }));
    return { codes };
  }

  // ---- Нанесение (п.26): POST /api/utilisation ----
  async submitUtilisation(input: {
    tenantId: string;
    sntins: string[];
    businessPlaceId: number;
    releaseType: string;
    expirationDate: string;
    productionDate: string;
    manufacturerCountry: string;
  }): Promise<{
    reportId: string;
    status: "IN_PROCESS" | "ERROR";
    rejectReason?: string;
  }> {
    this.writePolicy.assertAllowed("submitUtilisation");
    const body = {
      sntins: input.sntins,
      businessPlaceId: toInt32(input.businessPlaceId),
      releaseType: input.releaseType,
      expirationDate: input.expirationDate,
      productionDate: input.productionDate,
      manufacturerCountry: input.manufacturerCountry,
    };
    const { data } = await this.request("/api/utilisation", "POST", {
      json: body,
      operationId: `util-${Date.now()}`,
    });
    const d = data as {
      reportId?: string;
      status?: string;
      rejectReason?: string;
    };
    if (d.status === "ERROR") {
      return {
        reportId: d.reportId ?? "",
        status: "ERROR",
        rejectReason: d.rejectReason,
      };
    }
    return { reportId: d.reportId ?? "", status: "IN_PROCESS" };
  }

  async getUtilisation(reportId: string): Promise<{
    status: "IN_PROCESS" | "SUCCESS" | "ERROR";
    rejectReason?: string;
  }> {
    const { data } = await this.request(
      `/api/utilisation/${encodeURIComponent(reportId)}`,
      "GET",
      { operationId: reportId }
    );
    const d = data as { status?: string; rejectReason?: string };
    const st = (d.status ?? "IN_PROCESS") as "IN_PROCESS" | "SUCCESS" | "ERROR";
    return { status: st, rejectReason: d.rejectReason ?? undefined };
  }

  // ---- Документы (doc/*): documentBody = base64(JSON A–Z) ----
  async submitImport(input: {
    tenantId: string;
    codes: string[];
    customsDate: string;
    customsNumber: string;
    authorityCode?: string;
  }): Promise<{
    documentId: string;
    status: "IN_PROCESS" | "ERROR";
    rejectReason?: string;
  }> {
    this.writePolicy.assertAllowed("submitImport");
    const documentBody = base64Utf8(
      canonicalJson({
        codes: input.codes,
        customsDeclaration: {
          date: input.customsDate,
          number: input.customsNumber,
          authorityCode: input.authorityCode ?? null,
        },
      })
    );
    const { data } = await this.request("/public/api/v1/doc/import", "POST", {
      json: { documentBody },
      operationId: input.customsNumber,
    });
    const d = data as {
      documentId?: string;
      status?: string;
      rejectReason?: string;
    };
    if (d.status === "ERROR") {
      return {
        documentId: d.documentId ?? "",
        status: "ERROR",
        rejectReason: d.rejectReason,
      };
    }
    return { documentId: d.documentId ?? "", status: "IN_PROCESS" };
  }

  async submitWithdrawal(input: {
    tenantId: string;
    codes: string[];
    withdrawalType: "WITHDRAWAL" | "WRITE_OFF";
    withdrawalReason: string;
    childrenWriteOff: boolean;
  }): Promise<{
    documentId: string;
    status: "IN_PROCESS" | "ERROR";
    rejectReason?: string;
  }> {
    this.writePolicy.assertAllowed("submitWithdrawal");
    const documentBody = base64Utf8(
      canonicalJson({
        codes: input.codes,
        withdrawalType: input.withdrawalType,
        withdrawalReason: input.withdrawalReason,
        childrenWriteOff: input.childrenWriteOff,
      })
    );
    const { data } = await this.request(
      "/public/api/v1/doc/withdrawal",
      "POST",
      { json: { documentBody }, operationId: `wdr-${Date.now()}` }
    );
    const d = data as {
      documentId?: string;
      status?: string;
      rejectReason?: string;
    };
    if (d.status === "ERROR") {
      return {
        documentId: d.documentId ?? "",
        status: "ERROR",
        rejectReason: d.rejectReason,
      };
    }
    return { documentId: d.documentId ?? "", status: "IN_PROCESS" };
  }

  // Путь docs/:id уточняется на STAGE (CONTRACT-IS-MPT: storage docs/:id).
  async getDocument(documentId: string): Promise<{
    status: "IN_PROCESS" | "SUCCESS" | "ERROR";
    rejectReason?: string;
  }> {
    const { data } = await this.request(
      `/public/api/v1/doc/storage/docs/${encodeURIComponent(documentId)}`,
      "GET",
      { operationId: documentId }
    );
    const d = data as { status?: string; rejectReason?: string };
    const st = (d.status ?? "IN_PROCESS") as "IN_PROCESS" | "SUCCESS" | "ERROR";
    return { status: st, rejectReason: d.rejectReason ?? undefined };
  }
}
