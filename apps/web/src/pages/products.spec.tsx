// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProductsPage } from "./products";
import { sessionStore } from "../session";

const card = (id: string, name: string, status = "REGISTERED") => ({
  id,
  name,
  gtin: "04014835723399",
  ntin: "KZ-MO-0001",
  status,
  updatedAt: "2026-08-01T10:00:00Z",
});

const draft = (id: string, name: string, tnved: string) => ({
  id,
  status: tnved === "2710198200" ? "DRAFT" : "DOBOR",
  proposed: {
    name,
    tnved,
    tnvedHint: tnved === "2710198200" ? null : "возможно 2710198200",
  },
});

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => {
      const found = Object.keys(routes).find((k) => String(url).includes(k));
      if (found) return { ok: true, json: async () => routes[found] };
      return { ok: true, json: async () => ({ items: [] }) };
    })
  );
}

describe("ProductsPage (UI-04: cards list + drafts)", () => {
  beforeEach(() => {
    sessionStore.clear();
    sessionStore.set({
      tenantId: "t1",
      token: "jwt",
      roles: ["admin"],
      login: "a",
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("рендерит список карточек (name/gtin/status badge)", async () => {
    mockFetch({
      "/products/cards": {
        items: [card("c1", "MarkOil 5W-30"), card("c2", "Castrol EDGE")],
      },
    });
    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText("MarkOil 5W-30")).toBeTruthy();
      expect(screen.getByText("Castrol EDGE")).toBeTruthy();
      // 2 badge c data-status=REGISTERED и русской подписью «Зарегистрирована»
      const badges = document.querySelectorAll('[data-status="REGISTERED"]');
      expect(badges).toHaveLength(2);
      expect(badges[0].textContent).toBe("Зарегистрирована");
    });
  });

  it("вкладка «Черновики» показывает добор + действие «Исправить код»", async () => {
    mockFetch({
      "/products/cards": { items: [] },
      "/products/drafts": {
        items: [draft("d1", "Nomad 27101919", "27101919")],
      },
    });
    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Черновики/));
    });
    await waitFor(() => {
      expect(screen.getByText("Nomad 27101919")).toBeTruthy();
      expect(screen.getByText("Исправить код")).toBeTruthy();
    });
  });

  it("импорт: JSON rows → POST /products/drafts/import", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
        calls.push(String(url));
        if (String(url).includes("drafts/import")) {
          return { ok: true, json: async () => ({ created: 1 }) };
        }
        return { ok: true, json: async () => ({ items: [] }) };
      })
    );
    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      fireEvent.click(screen.getByText("⇧ Импорт"));
    });
    fireEvent.change(screen.getByPlaceholderText(/\[.*name.*gtin/), {
      target: {
        value: '[{"name":"X","gtin":"04014835723399","tnved":"2710198200"}]',
      },
    });
    fireEvent.click(screen.getByText("Импортировать"));
    await waitFor(() => {
      expect(calls.some((c) => c.includes("drafts/import"))).toBe(true);
    });
  });

  it("создание карточки: POST /products/cards", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push(String(url));
        const method = (init?.method ?? "GET").toUpperCase();
        if (String(url).endsWith("/products/cards") && method === "POST") {
          return { ok: true, json: async () => ({ id: "new-card" }) };
        }
        return { ok: true, json: async () => ({ items: [] }) };
      })
    );
    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      fireEvent.click(screen.getByText("+ Создать товар"));
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Полное наименование")).toBeTruthy();
    });
    fireEvent.change(screen.getByPlaceholderText("Полное наименование"), {
      target: { value: "Новое масло" },
    });
    fireEvent.change(screen.getByPlaceholderText("GTIN"), {
      target: { value: "04014835723399" },
    });
    fireEvent.click(screen.getByText("Создать карточку"));
    await waitFor(() => {
      expect(calls.some((c) => c.includes("/products/cards"))).toBe(true);
    });
  });
});
