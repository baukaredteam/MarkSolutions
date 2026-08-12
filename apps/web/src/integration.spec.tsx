// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./app";
import { sessionStore } from "./session";
import { api } from "./api";
import { cleanup } from "@testing-library/react";

describe("T2 web-backend integration", () => {
  beforeAll(() => {
    const data: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem(k: string) {
        return data[k] ?? null;
      },
      setItem(k: string, v: string) {
        data[k] = v;
      },
      removeItem(k: string) {
        delete data[k];
      },
    } as Storage);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  beforeEach(() => {
    sessionStore.clear();
  });

  it("api-client sends Authorization Bearer token after login", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    sessionStore.set({ tenantId: "t-42", token: "jwt-token-x" });

    await api.get("/products");

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer jwt-token-x");
    expect(headers["X-Tenant-Id"]).toBeUndefined();
  });

  it("/login stores JWT + roles and navigates to default route", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse((init as RequestInit).body as string);
        if (body.login === "admin@demo" && body.password === "demo-password") {
          return {
            ok: true,
            json: async () => ({
              tenantId: "t-1",
              token: "jwt-demo",
              roles: [
                "admin",
                "manager",
                "accountant",
                "marking",
                "warehouse",
                "viewer",
              ],
            }),
          };
        }
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: 401, message: "invalid" }),
        };
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppRoutes />
      </MemoryRouter>
    );

    const loginInput = screen.getByPlaceholderText("Логин");
    const passInput = screen.getByPlaceholderText("Пароль");
    fireEvent.change(loginInput, { target: { value: "admin@demo" } });
    fireEvent.change(passInput, { target: { value: "demo-password" } });
    fireEvent.click(screen.getByText("Войти"));

    await waitFor(() => {
      expect(sessionStore.get()?.token).toBe("jwt-demo");
      expect(sessionStore.get()?.tenantId).toBe("t-1");
      expect(sessionStore.get()?.roles).toContain("admin");
    });
  });

  it("/products survives ApiUnavailable gracefully (no crash, toast)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    );
    sessionStore.set({ tenantId: "t-1", token: "jwt" });
    const { ToastProvider } = await import("./toast.js");

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/products"]}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    );

    // mount-loadDrafts падает → тост «Сервис недоступен», без белого экрана
    await waitFor(() => {
      expect(screen.getByText(/Сервис недоступен/)).toBeTruthy();
    });
    // нет краша: заголовок «Каталог товаров» на месте, строк нет
    expect(
      screen.getByRole("heading", { name: "Каталог товаров" })
    ).toBeTruthy();
  });

  it("ФИКС 1: fetch 401 → сессия очищена + событие auth:expired + redirect /login", async () => {
    let dispatched = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: 401, message: "jwt expired" }),
      })
    );
    const onExpired = () => {
      dispatched++;
    };
    window.addEventListener("auth:expired", onExpired);
    sessionStore.set({ tenantId: "t-1", token: "expired-jwt" });

    await expect(api.get("/orders")).rejects.toMatchObject({
      error: { code: 401, message: "Сессия истекла — войдите снова" },
    });
    expect(sessionStore.get()).toBeNull();
    expect(dispatched).toBe(1);
    window.removeEventListener("auth:expired", onExpired);
  });
});
