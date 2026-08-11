// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BalancePage } from "./balance";

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

describe("BalancePage", () => {
  beforeEach(() => {
    postRaw.mockReset();
    get.mockReset();
  });

  it("shows balance/reserved/available and top-up; duplicate ref1c → toast 'уже существует'", async () => {
    get.mockResolvedValue({
      balance: "1000",
      reserved: "200",
      available: "800",
    });
    postRaw.mockResolvedValueOnce({ status: 200, body: { id: "e1" } });

    render(
      <MemoryRouter>
        <BalancePage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("1000 ₸")).toBeTruthy());
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("800")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("ref1c"), {
      target: { value: "PAY-1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Сумма (тенге)"), {
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
});
