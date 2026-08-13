// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { OperatorPage } from "./operator";
import { AuditPage } from "./audit";
import { sessionStore } from "../session";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../api", () => ({
  api: { get, post: vi.fn() },
  ApiErrorResponse: class ApiErrorResponse extends Error {
    constructor(readonly error: { code: number; message: string }) {
      super(error.message);
    }
  },
  ApiUnavailable: class ApiUnavailable extends Error {},
}));

vi.mock("../toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

const QUEUE = {
  items: [
    {
      id: "c1",
      status: "SUBMITTED",
      gtin: "04014835723399",
      tenantId: "t1",
      tenant: { name: "Mark Solutions Demo", bin: "111" },
    },
  ],
};

const EXCEPTIONS = {
  items: [
    {
      id: "e1",
      aggregate: "mpt-order-timeout",
      status: "FAILED",
      payload: { orderId: "o-timeout" },
      createdAt: new Date(Date.now() - 42 * 60000).toISOString(),
    },
  ],
};

const JOURNAL = {
  items: [
    {
      id: "j1",
      at: new Date().toISOString(),
      actor: "u1",
      action: "PRINTED",
      object: "code:abc",
      detail: "—",
      source: "code-event",
    },
    {
      id: "j2",
      at: new Date().toISOString(),
      actor: "system",
      action: "export",
      object: "order:xyz",
      detail: "count=2",
      source: "vault-export",
    },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStore.clear();
  vi.restoreAllMocks();
});

describe("operator + audit pages (UI-07)", () => {
  it("operator: KPI + центр исключений + очередь модерации", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/moderation/queue") return QUEUE;
      if (path === "/moderation/exceptions") return EXCEPTIONS;
      return { items: [] };
    });
    render(<OperatorPage />);
    await waitFor(() =>
      expect(screen.getByText("Кабинет оператора Mark Solutions")).toBeTruthy()
    );
    expect(screen.getByText("Центр исключений")).toBeTruthy();
    expect(screen.getByText("Очередь модерации")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText("mpt-order-timeout")).toBeTruthy()
    );
    expect(screen.getByText("Mark Solutions Demo")).toBeTruthy();
    // действие «Повторить»
    expect(screen.getByRole("button", { name: "Повторить" })).toBeTruthy();
  });

  it("audit: журнал с источниками (code-event + vault-export)", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/audit/journal") return JOURNAL;
      return { items: [] };
    });
    render(<AuditPage />);
    await waitFor(() => expect(screen.getByText("Журнал аудита")).toBeTruthy());
    expect(screen.getByText("PRINTED")).toBeTruthy();
    expect(screen.getByText("export")).toBeTruthy();
    expect(screen.getByText("Код")).toBeTruthy();
    expect(screen.getByText("Выгрузка")).toBeTruthy();
  });
});
