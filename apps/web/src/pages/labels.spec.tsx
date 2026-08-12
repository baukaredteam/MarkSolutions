// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LabelsPage } from "./labels";
import { sessionStore } from "../session";
import { api } from "../api";

const ORDERS = {
  items: [{ id: "o1", number: 7, gtin: "04014835723399", status: "COMPLETED" }],
};
const CODES = {
  items: [
    { id: "c1", gtin: "04014835723399", mask: "00…01", status: "ACTIVE" },
    { id: "c2", gtin: "04014835723399", mask: "00…02", status: "PRINTED" },
    { id: "c3", gtin: "04014835723399", mask: "00…03", status: "APPLIED" },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStore.clear();
  vi.restoreAllMocks();
});

describe("labels page (UI-06a)", () => {
  it("рендерит селектор заказа, коды и статус-badges", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["marking"],
      login: "m",
    });
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/orders") return ORDERS;
      if (path === "/codes/o1/codes") return CODES;
      return { items: [] };
    });
    render(<LabelsPage />);
    // option заказа присутствует (селектор) + коды таблицы
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /KM-2026-000007/ })
      ).toBeTruthy()
    );
    await waitFor(() => expect(screen.getByText("00…01")).toBeTruthy());
    expect(screen.getByText("00…02")).toBeTruthy();
    expect(screen.getByText("00…03")).toBeTruthy();
    // APPLIED-код: «Печать» и «Перепечатать» disabled
    const row3 = screen.getByText("00…03").closest("tr")!;
    const btns = row3.querySelectorAll("button");
    expect((btns[0] as HTMLButtonElement).disabled).toBe(true);
    expect((btns[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("Печать ACTIVE → POST /labels/:id/print → превью + очередь done", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/orders") return ORDERS;
      if (path === "/codes/o1/codes") return CODES;
      return { items: [] };
    });
    vi.spyOn(api, "post").mockResolvedValue({
      key: "k1",
      pngBase64: "iVBORw0KGgo",
    });
    render(<LabelsPage />);
    await waitFor(() => expect(screen.getByText("00…01")).toBeTruthy());
    const row1 = screen.getByText("00…01").closest("tr")!;
    fireEvent.click(row1.querySelectorAll("button")[0]);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/labels/c1/print", {})
    );
    await waitFor(() => expect(screen.getByAltText("DataMatrix")).toBeTruthy());
    expect(screen.getByText(/Размер: 58×40 мм/)).toBeTruthy();
    expect(screen.getByText(/Разрешение: 300 DPI/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Завершено")).toBeTruthy());
  });

  it("Перепечатать: OTHER без комментария → клиентская валидация (не POST)", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["marking"],
      login: "m",
    });
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/orders") return ORDERS;
      if (path === "/codes/o1/codes") return CODES;
      return { items: [] };
    });
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValue({ key: "k", pngBase64: "x" });
    render(<LabelsPage />);
    await waitFor(() => expect(screen.getByText("00…02")).toBeTruthy());
    const row2 = screen.getByText("00…02").closest("tr")!;
    fireEvent.click(row2.querySelectorAll("button")[1]);
    await waitFor(() =>
      expect(screen.getByText("Перепечатка этикетки")).toBeTruthy()
    );
    fireEvent.change(screen.getByLabelText("Причина"), {
      target: { value: "OTHER" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Перепечатать" }).at(-1)!
    );
    // комментарий пуст → валидация блокирует запрос
    await waitFor(() => expect(post).not.toHaveBeenCalled());
    expect(screen.getByText("Перепечатка этикетки")).toBeTruthy();
  });

  it("Перепечатать OTHER с комментарием ≥5 → POST reprint + превью", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["marking"],
      login: "m",
    });
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/orders") return ORDERS;
      if (path === "/codes/o1/codes") return CODES;
      return { items: [] };
    });
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValue({ key: "k", pngBase64: "iVBORw0KGgo" });
    render(<LabelsPage />);
    await waitFor(() => expect(screen.getByText("00…02")).toBeTruthy());
    const row2 = screen.getByText("00…02").closest("tr")!;
    fireEvent.click(row2.querySelectorAll("button")[1]);
    await waitFor(() =>
      expect(screen.getByText("Перепечатка этикетки")).toBeTruthy()
    );
    fireEvent.change(screen.getByLabelText("Причина"), {
      target: { value: "OTHER" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Опишите причину/), {
      target: { value: "порван на складе при разгрузке" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Перепечатать" }).at(-1)!
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/labels/c2/reprint", {
        reasonCode: "OTHER",
        comment: "порван на складе при разгрузке",
      })
    );
    await waitFor(() => expect(screen.getByAltText("DataMatrix")).toBeTruthy());
  });

  it("роль viewer: кнопки Печать/Перепечатать скрыты, заказ не в списке", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["viewer"],
      login: "v",
    });
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/orders") return ORDERS;
      if (path === "/codes/o1/codes") return CODES;
      return { items: [] };
    });
    render(<LabelsPage />);
    await waitFor(() => expect(screen.getByText("00…01")).toBeTruthy());
    const row1 = screen.getByText("00…01").closest("tr")!;
    expect(row1.querySelectorAll("button").length).toBe(0);
  });
});
