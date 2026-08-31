// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { DocumentsPage } from "./docs";
import { sessionStore } from "../session";
import { api } from "../api";

const DOCS = {
  items: [
    {
      id: "d1",
      type: "IMPORT",
      date: "2026-08-12T10:00:00Z",
      status: "SUCCESS",
      rejectReason: null,
    },
    {
      id: "d2",
      type: "WITHDRAWAL",
      date: "2026-08-11T09:00:00Z",
      status: "ERROR",
      rejectReason: "rejected",
    },
    {
      id: "d3",
      type: "UTILISATION",
      date: "2026-08-10T08:00:00Z",
      status: "IN_PROCESS",
      rejectReason: null,
    },
    {
      id: "d4",
      type: "WITHDRAWAL",
      date: "2026-08-09T07:00:00Z",
      status: "SUCCESS",
      rejectReason: null,
    },
  ],
};

const ORDERS = {
  items: [{ id: "o1", number: 7, gtin: "04014835723399", status: "COMPLETED" }],
};

const CODES = {
  items: [
    { id: "c1", gtin: "04014835723399", mask: "00…01", status: "APPLIED" },
    { id: "c2", gtin: "04014835723399", mask: "00…02", status: "APPLIED" },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStore.clear();
  vi.restoreAllMocks();
});

function renderDocs() {
  return render(
    <MemoryRouter>
      <DocumentsPage />
    </MemoryRouter>
  );
}

describe("documents page (UI-06b)", () => {
  it("рендерит KPI-4 и таблицу документов (тип/статус/причина/дата)", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/documents") return DOCS;
      if (path === "/orders") return ORDERS;
      if (path === "/codes/o1/codes") return CODES;
      return { items: [] };
    });
    renderDocs();
    await waitFor(() =>
      expect(screen.getAllByText("Ввод в оборот").length).toBeGreaterThan(0)
    );
    expect(
      screen.getByRole("heading", { name: "Операции и документы" })
    ).toBeTruthy();
    // KPI-4: SUCCESS×2, IN_PROCESS×1, ERROR×1, SUBMITTED×0
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getAllByText("2")).toHaveLength(1);
    expect(screen.getByText("Ошибки")).toBeTruthy();
    expect(screen.getByText("Завершено")).toBeTruthy();
    expect(screen.getAllByText("Нанесение").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Завершён").length).toBeGreaterThan(0);
    expect(screen.getByText("Ошибка")).toBeTruthy();
    expect(screen.getByText("rejected")).toBeTruthy();
    expect(screen.queryByText(/заглушка/i)).toBeNull();
  });

  it("мастер «Оформить ввоз»: ДТ {date,number} → POST /import → тост", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/documents") return DOCS;
      if (path === "/orders") return ORDERS;
      if (path === "/codes/o1/codes") return CODES;
      return { items: [] };
    });
    const post = vi.spyOn(api, "post").mockResolvedValue({ status: "SUCCESS" });
    renderDocs();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Операции и документы" })
      ).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "Оформить ввоз" }));
    await waitFor(() =>
      expect(screen.getByText("Оформление ввоза (Импорт)")).toBeTruthy()
    );
    fireEvent.change(screen.getByLabelText("Дата ДТ"), {
      target: { value: "2026-08-12" },
    });
    fireEvent.change(screen.getByLabelText("Номер ДТ"), {
      target: { value: "10002000/010826/12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить ввоз" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/import", {
        orderId: "o1",
        customsDeclaration: {
          date: "2026-08-12",
          number: "10002000/010826/12345",
          authorityCode: undefined,
        },
      })
    );
  });

  it("мастер «Ввоз»: без номера ДТ → клиентская валидация (не POST)", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/documents") return DOCS;
      if (path === "/orders") return ORDERS;
      if (path === "/codes/o1/codes") return CODES;
      return { items: [] };
    });
    const post = vi.spyOn(api, "post").mockResolvedValue({ status: "SUCCESS" });
    renderDocs();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Операции и документы" })
      ).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "Оформить ввоз" }));
    await waitFor(() =>
      expect(screen.getByText("Оформление ввоза (Импорт)")).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "Отправить ввоз" }));
    await waitFor(() => expect(post).not.toHaveBeenCalled());
    expect(screen.getByText("Оформление ввоза (Импорт)")).toBeTruthy();
  });

  it("мастер «Вывод/списание»: OTHER без comment → валидация; с comment → POST /withdrawal", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/documents") return DOCS;
      if (path === "/orders") return ORDERS;
      if (path === "/codes/o1/codes") return CODES;
      return { items: [] };
    });
    const post = vi.spyOn(api, "post").mockResolvedValue({ status: "SUCCESS" });
    renderDocs();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Операции и документы" })
      ).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "Вывод/списание" }));
    await waitFor(() =>
      expect(screen.getByText("Вывод из оборота / списание")).toBeTruthy()
    );
    // выбрать коды c1, c2
    fireEvent.click(screen.getByLabelText("00…01"));
    fireEvent.click(screen.getByLabelText("00…02"));
    fireEvent.change(screen.getByLabelText("Причина"), {
      target: { value: "OTHER" },
    });
    // без комментария → блокировка
    fireEvent.click(screen.getByRole("button", { name: "Отправить вывод" }));
    await waitFor(() => expect(post).not.toHaveBeenCalled());
    // с комментарием
    fireEvent.change(screen.getByLabelText("Комментарий (мин. 5)"), {
      target: { value: "утилизация партии по акту" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить вывод" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/withdrawal", {
        codes: ["c1", "c2"],
        withdrawalType: "WITHDRAWAL",
        withdrawalReason: "OTHER",
        comment: "утилизация партии по акту",
        childrenWriteOff: false,
      })
    );
  });

  it("роль viewer: кнопки ввоза/вывода скрыты", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["viewer"],
      login: "v",
    });
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/documents") return DOCS;
      if (path === "/orders") return ORDERS;
      if (path === "/codes/o1/codes") return CODES;
      return { items: [] };
    });
    renderDocs();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Операции и документы" })
      ).toBeTruthy()
    );
    expect(screen.queryByRole("button", { name: "Оформить ввоз" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Вывод/списание" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Отчёт о нанесении" })
    ).toBeNull();
  });

  it("пустое состояние OPS-28: текст ТЗ, не StubPage, переход к нанесению", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    vi.spyOn(api, "get").mockImplementation(async (path: string) => {
      if (path === "/documents") return { items: [] };
      if (path === "/orders") return ORDERS;
      return { items: [] };
    });
    function Loc() {
      const loc = useLocation();
      return <div data-testid="path">{loc.pathname}</div>;
    }
    render(
      <MemoryRouter initialEntries={["/operations"]}>
        <Loc />
        <Routes>
          <Route path="/operations" element={<DocumentsPage />} />
          <Route
            path="/operations/utilisation"
            element={<div>форма нанесения</div>}
          />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Операций пока нет")).toBeTruthy()
    );
    expect(
      screen.getByText(
        /Создайте операцию вручную, импортируйте файл или перейдите из производства/
      )
    ).toBeTruthy();
    expect(screen.queryByText(/заглушка/i)).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Отчёт о нанесении" }));
    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe(
        "/operations/utilisation"
      )
    );
  });
});
