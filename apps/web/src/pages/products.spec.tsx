// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProductsPage } from "./products";
import { sessionStore } from "../session";

const draft = (id: string, name: string, tnved: string, demo = false) => ({
  id,
  status: tnved === "2710198200" ? "DRAFT" : "DOBOR",
  proposed: {
    name,
    tnved,
    tnvedHint: tnved === "2710198200" ? null : "возможно 2710198200",
  },
  demo,
});

describe("ProductsPage (F5: reads GET /products/drafts)", () => {
  beforeEach(() => {
    sessionStore.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders drafts from API on mount; 38 red + 2 green", async () => {
    sessionStore.set({ tenantId: "t1", token: "jwt" });
    const items = [
      ...Array.from({ length: 38 }, (_, i) =>
        draft(`r${i}`, `Nomad ${i}`, "27101919")
      ),
      draft("g1", "Demo 1", "2710198200", true),
      draft("g2", "Demo 2", "3403191000", true),
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      const rows = screen.getAllByRole("row").slice(1);
      expect(rows).toHaveLength(40);
      const red = rows.filter((r) => r.getAttribute("style")?.includes("red"));
      expect(red).toHaveLength(38);
    });
  });

  it("seed button posts /demo/seed-invoice then reloads drafts", async () => {
    sessionStore.set({ tenantId: "t1", token: "jwt" });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("seed-invoice")) {
        return { ok: true, json: async () => ({ count: 40 }) };
      }
      // GET /products/drafts
      return {
        ok: true,
        json: async () => ({ items: [draft("a", "A", "27101919")] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    );
    // дождаться завершения mount-loadDrafts
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/products/drafts",
        expect.anything()
      );
    });
    fireEvent.click(screen.getByText("Загрузить инвойс (демо)"));

    await waitFor(() => {
      expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
    });
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain("/api/demo/seed-invoice");
    expect(urls).toContain("/api/products/drafts");
  });

  it("without session → toast 401 (AT-16), no API call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // обернём в ToastProvider, чтобы тост реально отрендерился
    const { ToastProvider } = await import("../toast.js");
    render(
      <ToastProvider>
        <MemoryRouter>
          <ProductsPage />
        </MemoryRouter>
      </ToastProvider>
    );
    await waitFor(() => {
      expect(screen.getByText("401: jwt required")).toBeTruthy();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ручной GTIN (source=manual) → бейдж «GTIN подтверждён вручную» (Q6 слой 3)", async () => {
    sessionStore.set({ tenantId: "t1", token: "jwt" });
    const items = [
      {
        id: "m1",
        status: "DRAFT",
        proposed: {
          name: "RAVENOL 5W-30",
          tnved: "2710198200",
          gtin: "04014835723399",
          gtinManual: true,
        },
      },
      {
        id: "m2",
        status: "DRAFT",
        proposed: { name: "Обычный", tnved: "2710198200" },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) })
    );
    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/GTIN подтверждён вручную/)).toBeTruthy();
    });
  });
});
