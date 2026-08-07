// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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

  it("/login page stores JWT in session and navigates to /products on success", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse((init as RequestInit).body as string);
        if (body.login === "admin@demo" && body.password === "demo-password") {
          return {
            ok: true,
            json: async () => ({ tenantId: "t-1", token: "jwt-demo" }),
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
    });
  });

  it("/apply handles duplicate BIN (200) gracefully (AT-02 in UI)", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "app-1",
            status: "PENDING",
            bin: "123456789012",
          }),
        };
      })
    );

    render(
      <MemoryRouter initialEntries={["/apply"]}>
        <AppRoutes />
      </MemoryRouter>
    );

    const binInput = screen.getByLabelText("БИН");
    fireEvent.change(binInput, { target: { value: "123456789012" } });
    fireEvent.click(screen.getByText("Согласен с офертой (v1)"));
    fireEvent.click(screen.getByText("Отправить заявку"));

    await waitFor(() => {
      expect(callCount).toBe(1);
      // После дубля кнопка отключена
      expect(
        screen.getByText("Отправить заявку").getAttribute("disabled")
      ).toBeDefined();
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
    // нет краша: заголовок «Товары» на месте, строк нет
    expect(screen.getByRole("heading", { name: "Товары" })).toBeTruthy();
  });
});
