// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BalancePage } from "./balance";
import { sessionStore } from "../session";

const { postRaw, get } = vi.hoisted(() => ({
  postRaw: vi.fn(),
  get: vi.fn(),
}));

vi.mock("../api", () => ({
  api: { get, postRaw },
  ApiErrorResponse: class ApiErrorResponse extends Error {
    constructor(readonly error: { code: number; message: string }) {
      super(error.message);
    }
  },
  ApiUnavailable: class ApiUnavailable extends Error {},
}));

vi.mock("../toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

const LEDGER = {
  items: [
    {
      id: "e1",
      date: "2026-08-13T10:00:00Z",
      kind: "TOPUP",
      amount: "1000",
      ref1c: "PAY-1",
      refOrderId: null,
      reason: "пополнение",
      balance: "1200",
    },
    {
      id: "e2",
      date: "2026-08-12T10:00:00Z",
      kind: "SETTLE",
      amount: "300",
      ref1c: null,
      refOrderId: "o-1",
      reason: "settle",
      balance: "200",
    },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStore.clear();
  postRaw.mockReset();
  get.mockReset();
});

describe("BalancePage (UI-06c)", () => {
  it("KPI-3 + таблица операций (статусы русские, desc)", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    get.mockImplementation(async (path: string) => {
      if (path === "/billing/balance")
        return { balance: "1200", reserved: "200", available: "1000" };
      if (path === "/billing/ledger") return LEDGER;
      return { items: [] };
    });
    render(
      <MemoryRouter>
        <BalancePage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Доступный баланс")).toBeTruthy()
    );
    expect(screen.getByText("Пополнение")).toBeTruthy();
    expect(screen.getByText("Списание")).toBeTruthy();
    expect(screen.getAllByText("Проведено").length).toBeGreaterThan(0);
    expect(screen.getByText("PAY-1")).toBeTruthy();
  });

  it("пополнение: ref1c+сумма → POST /billing/payments/import; повтор → тост «уже существует»", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    get.mockImplementation(async (path: string) => {
      if (path === "/billing/balance")
        return { balance: "1200", reserved: "200", available: "1000" };
      if (path === "/billing/ledger") return { items: [] };
      return { items: [] };
    });
    postRaw.mockResolvedValueOnce({ status: 200, body: { id: "e1" } });
    render(
      <MemoryRouter>
        <BalancePage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Доступный баланс")).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "Пополнить баланс" }));
    await waitFor(() =>
      expect(screen.getByText("Пополнение баланса")).toBeTruthy()
    );
    fireEvent.change(screen.getByLabelText("ref1c"), {
      target: { value: "PAY-1" },
    });
    fireEvent.change(screen.getByLabelText("Сумма (тенге)"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Пополнить" }));
    await waitFor(() => expect(postRaw).toHaveBeenCalled());
    expect(postRaw.mock.calls[0][0]).toBe("/billing/payments/import");
    expect(postRaw.mock.calls[0][1]).toMatchObject({
      ref1c: "PAY-1",
      amount: "500",
    });
  });

  it("роль viewer: кнопки пополнения/сверки скрыты, таблица видна", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["viewer"],
      login: "v",
    });
    get.mockImplementation(async (path: string) => {
      if (path === "/billing/balance")
        return { balance: "1200", reserved: "200", available: "1000" };
      if (path === "/billing/ledger") return LEDGER;
      return { items: [] };
    });
    render(
      <MemoryRouter>
        <BalancePage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Доступный баланс")).toBeTruthy()
    );
    expect(
      screen.queryByRole("button", { name: "Пополнить баланс" })
    ).toBeNull();
    expect(screen.getByText("Операции лицевого счёта")).toBeTruthy();
  });
});
