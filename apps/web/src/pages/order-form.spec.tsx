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

// UI-04: мастер 4 шага (Товары→Параметры→Финансы→Подтверждение)
describe("OrderForm (мастер 4 шага)", () => {
  beforeEach(() => {
    postRaw.mockReset();
    get.mockReset();
    toastPush.mockReset();
    get.mockImplementation((path: string) => {
      if (path === "/products/cards")
        return Promise.resolve({
          items: [
            {
              id: "c1",
              gtin: "04014835723399",
              name: "Castrol EDGE",
              status: "REGISTERED",
            },
          ],
        });
      if (path === "/billing/tariff/active")
        return Promise.resolve({ id: "t1", pricePerCodeKZT: "100" });
      if (path === "/billing/balance")
        return Promise.resolve({
          balance: "0",
          reserved: "0",
          available: "5000",
        });
      return Promise.resolve(null);
    });
  });

  it("4 шага: выбор товара → параметры (места×штук=quantity) → финансы (остаток после списания) → подтверждение с Idempotency-Key; POST", async () => {
    postRaw.mockResolvedValue({ status: 201, body: { id: "o1" } });

    render(<OrderForm />);
    // шаг 1: выбрать карточку
    await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "c1" },
    });
    // «Далее»
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    // шаг 2: параметры + превью
    fireEvent.change(screen.getByPlaceholderText("Места"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByPlaceholderText("Штук в месте"), {
      target: { value: "3" },
    });
    expect(screen.getByText(/Превью: 2 × 3 = 6/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    // шаг 3: финансы — остаток после списания (available 5000 тиын − total 600 тиын = 4400 тиын = 44,00 ₸)
    expect(screen.getByText(/Остаток после списания/)).toBeTruthy();
    expect(screen.getByText(/44,00 ₸/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    // шаг 4: подтверждение — Idempotency-Key + кнопка
    expect(screen.getByText(/Idempotency-Key/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Заказать коды" }));

    await waitFor(() => expect(postRaw).toHaveBeenCalled());
    const [, body, key] = postRaw.mock.calls[0];
    expect(body).toMatchObject({
      cardId: "c1",
      gtin: "04014835723399",
      places: 2,
      unitsPerPlace: 3,
      quantity: 6,
      cisType: "UNIT",
      serialNumberType: "OPERATOR",
      productGroup: "autofluids",
    });
    expect(key).toBeTruthy(); // crypto.randomUUID
  });

  it("P2-C: 13-digit GTIN blocks step 0 with Длина должна быть равна 14", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/products/cards")
        return Promise.resolve({
          items: [
            {
              id: "c13",
              gtin: "4650063110374",
              name: "Short GTIN",
              status: "REGISTERED",
            },
          ],
        });
      if (path === "/billing/tariff/active")
        return Promise.resolve({ id: "t1", pricePerCodeKZT: "100" });
      if (path === "/billing/balance")
        return Promise.resolve({ available: "5000" });
      return Promise.resolve(null);
    });
    render(<OrderForm />);
    await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "c13" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(toastPush).toHaveBeenCalledWith("Длина должна быть равна 14");
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(postRaw).not.toHaveBeenCalled();
  });

  it("P2-C: 04650063110374 + optional businessPlaceId go to POST", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/products/cards")
        return Promise.resolve({
          items: [
            {
              id: "c14",
              gtin: "04650063110374",
              name: "STAGE oils",
              status: "REGISTERED",
            },
          ],
        });
      if (path === "/billing/tariff/active")
        return Promise.resolve({ id: "t1", pricePerCodeKZT: "100" });
      if (path === "/billing/balance")
        return Promise.resolve({ available: "5000" });
      return Promise.resolve(null);
    });
    postRaw.mockResolvedValue({ status: 201, body: { id: "o14" } });
    render(<OrderForm />);
    await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "c14" },
    });
    expect(screen.getByDisplayValue("04650063110374")).toBeTruthy();
    expect(screen.getByText(/autofluids/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("МОД (businessPlaceId)"), {
      target: { value: "803" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.change(screen.getByPlaceholderText("Места"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Штук в месте"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.click(screen.getByRole("button", { name: "Заказать коды" }));
    await waitFor(() => expect(postRaw).toHaveBeenCalled());
    const [, body] = postRaw.mock.calls[0];
    expect(body).toMatchObject({
      cardId: "c14",
      gtin: "04650063110374",
      productGroup: "autofluids",
      businessPlaceId: 803,
      quantity: 1,
    });
  });

  it("quantity > places×units → блок на шаге параметров без POST", async () => {
    postRaw.mockResolvedValue({ status: 201, body: { id: "o1" } });
    render(<OrderForm />);
    await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "c1" } });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.change(screen.getByPlaceholderText("Места"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByPlaceholderText("Штук в месте"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByPlaceholderText("quantity"), {
      target: { value: "7" },
    });
    expect(screen.getByText(/✗ \(1\.\.6\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    // переход заблокирован (невалидный quantity) → остаёмся на шаге параметров
    expect(screen.getByPlaceholderText("Места")).toBeTruthy();
    expect(postRaw).not.toHaveBeenCalled();
  });

  it("402 → тост «Недостаточно средств» (AT-06)", async () => {
    postRaw.mockRejectedValue(
      new MockApiErrorResponse({ code: 402, message: "insufficient funds" })
    );
    render(<OrderForm />);
    await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "c1" } });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.change(screen.getByPlaceholderText("Места"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByPlaceholderText("Штук в месте"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.click(screen.getByRole("button", { name: "Заказать коды" }));
    await waitFor(() =>
      expect(toastPush).toHaveBeenCalledWith("Недостаточно средств")
    );
  });
});
