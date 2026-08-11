// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FetchApiClient, ApiErrorResponse, ApiUnavailable } from "./api";
import { sessionStore } from "./session";

describe("api-client", () => {
  beforeEach(() => {
    sessionStore.clear();
    vi.restoreAllMocks();
  });

  it("maps Приложение B error body to ApiErrorResponse with code and message", async () => {
    const errBody = {
      code: 400,
      message: "tenant_id required",
      details: null,
      fieldErrors: {},
      correlationId: "corr-1",
      retryable: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => errBody,
      })
    );

    const client = new FetchApiClient();
    await expect(
      client.get("/onboarding/applications/x")
    ).rejects.toMatchObject({
      error: { code: 400, message: "tenant_id required", retryable: false },
    });
    expect(ApiErrorResponse).toBeDefined();
  });

  it("throws ApiUnavailable on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    );
    const client = new FetchApiClient();
    await expect(client.get("/products")).rejects.toBeInstanceOf(
      ApiUnavailable
    );
  });

  it("sends Authorization Bearer header from session (T2: JWT is the tenant source)", async () => {
    sessionStore.set({ tenantId: "t-123", token: "jwt" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new FetchApiClient();
    await client.get("/products");

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer jwt",
    });
  });

  it("sends Idempotency-Key header when provided", async () => {
    sessionStore.set({ tenantId: "t-1", token: "jwt" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const client = new FetchApiClient();
    await client.postRaw("/orders", { cardId: "c" }, "key-123");
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      "Idempotency-Key": "key-123",
    });
  });

  it("postBlob returns text (CSV) with status; 409 maps to ApiErrorResponse", async () => {
    sessionStore.set({ tenantId: "t-1", token: "jwt" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => "\uFEFFgtin;serial;km_full",
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new FetchApiClient();
    const res = await client.postBlob("/codes/export", { orderId: "o1" });
    expect(res.status).toBe(201);
    expect(res.text).toContain("gtin;serial");

    // ошибка 409 → ApiErrorResponse
    const errFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({
          code: 409,
          message: "коды ещё не эмитированы",
          details: null,
          fieldErrors: {},
          correlationId: "c",
          retryable: false,
        }),
    });
    vi.stubGlobal("fetch", errFetch);
    await expect(
      client.postBlob("/codes/export", { orderId: "o1" })
    ).rejects.toMatchObject({
      error: { code: 409 },
    });
  });
});
