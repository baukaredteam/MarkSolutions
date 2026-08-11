// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrderForm } from "./order-form";

const { postRaw, get, MockApiErrorResponse } = vi.hoisted(() => {
  class MockApiErrorResponse extends Error {
    constructor(readonly error: { code: number; message: string }) {
      super(error.message);
    }
  }
  return {
    postRaw: vi.fn(),
    get: vi.fn(),
    MockApiErrorResponse,
  };
});

vi.mock("../api", () => ({
  api: { get, postRaw },
  ApiErrorResponse: MockApiErrorResponse,
  ApiUnavailable: class ApiUnavailable extends Error {},
}));

const toastPush = vi.fn();
vi.mock("../toast", () => ({ useToast: () => ({ push: toastPush }) }));

describe("OrderForm", () => {
  beforeEach(() => {
    postRaw.mockReset();
    get.mockReset();
    toastPush.mockReset();
  });

  it("quantity > places×units → 400-подобный тост без POST; валидный → POST с Idempotency-Key", async () => {
    get.mockResolvedValue({ id: "t1", pricePerCodeKZT: "100" });
    postRaw.mockResolvedValue({ status: 201, body: { id: "o1" } });

    render(<OrderForm />);
    fireEvent.change(screen.getByPlaceholderText("cardId"), {
      target: { value: "c1" },
    });
    fireEvent.change(screen.getByPlaceholderText("GTIN"), {
      target: { value: "04014835723399" },
    });
    fireEvent.change(screen.getByPlaceholderText("Места"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByPlaceholderText("Штук в месте"), {
      target: { value: "3" },
    });
    // невалидный quantity=7 (>6) → тост без POST
    fireEvent.change(screen.getByPlaceholderText("quantity"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Заказать коды" }));
    await waitFor(() =>
      expect(toastPush).toHaveBeenCalledWith(expect.stringMatching(/quantity/))
    );
    expect(postRaw).not.toHaveBeenCalled();

    // валидный quantity=6 → POST
    fireEvent.change(screen.getByPlaceholderText("quantity"), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Заказать коды" }));
    await waitFor(() => expect(postRaw).toHaveBeenCalled());
    const [, body, key] = postRaw.mock.calls[0];
    expect(body).toMatchObject({
      places: 2,
      unitsPerPlace: 3,
      quantity: 6,
      cisType: "UNIT",
      serialNumberType: "OPERATOR",
    });
    expect(key).toBeTruthy(); // crypto.randomUUID
  });

  it("402 → тост «Недостаточно средств» (AT-06)", async () => {
    get.mockResolvedValue({ id: "t1", pricePerCodeKZT: "100" });
    postRaw.mockRejectedValue(
      new MockApiErrorResponse({ code: 402, message: "insufficient funds" })
    );
    render(<OrderForm />);
    fireEvent.change(screen.getByPlaceholderText("cardId"), {
      target: { value: "c1" },
    });
    fireEvent.change(screen.getByPlaceholderText("GTIN"), {
      target: { value: "04014835723399" },
    });
    fireEvent.change(screen.getByPlaceholderText("Места"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByPlaceholderText("Штук в месте"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByPlaceholderText("quantity"), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Заказать коды" }));
    await waitFor(() =>
      expect(toastPush).toHaveBeenCalledWith("Недостаточно средств")
    );
  });
});
