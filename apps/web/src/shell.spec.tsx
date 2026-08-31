// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./app";
import { sessionStore } from "./session";
import { EntityList, type Column } from "./entity-list";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStore.set({
    tenantId: "t-1",
    token: "jwt",
    roles: ["admin"],
    login: "admin@demo",
  });
});

describe("shell: Ctrl+K + role-switch + EntityList v2", () => {
  it("левое меню: 16 канонических модулей MARK FLOW", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(container.querySelector(".sidebar.sidebar--dark")).toBeTruthy();
    expect(screen.getByText("MARK FLOW")).toBeTruthy();
    expect(screen.getByText("Mark Solutions")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Главная/ }).className).toMatch(
      /active/
    );
    expect(screen.getByRole("link", { name: /Главная/ })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Центр задач и уведомлений/ })
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Глобальный поиск/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Каталог товаров/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Заказ кодов/ })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Печать и этикетки/ })
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Агрегация/ })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Операции и документы/ })
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Поставки/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Производство/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Склад и ТСД/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Биллинг/ })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Отчёты и аналитика/ })
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /ИИ помощник/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /База знаний/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Настройки/ })).toBeTruthy();
  });

  it("Ctrl+K открывает command palette; клик по команде навигирует", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Перейти к разделу/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Каталог товаров/ }));
    // после навигации палитра закрыта
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Перейти к разделу/)).toBeNull();
    });
  });

  it("role-switch редиректит на default-route роли", async () => {
    sessionStore.set({
      tenantId: "t-1",
      token: "jwt",
      roles: ["admin", "accountant"],
      login: "admin@demo",
    });
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    const sw = screen.getByRole("combobox");
    fireEvent.change(sw, { target: { value: "accountant" } });
    // accountant → /billing (BalancePage заголовок «Биллинг»)
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Биллинг/ })).toBeTruthy();
    });
  });

  it("EntityList v2: рендер строк, bulk-select, пагинация", () => {
    interface Row {
      id: string;
      name: string;
    }
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      name: `Товар ${i + 1}`,
    }));
    const cols: Column<Row>[] = [
      { key: "id", label: "ID" },
      { key: "name", label: "Название" },
    ];
    const { container } = render(
      <EntityList
        rows={rows}
        columns={cols}
        rowKey={(r) => r.id}
        bulkSelect
        pageSize={8}
      />
    );
    // первая страница: 8 строк
    expect(container.querySelectorAll("tbody tr")).toHaveLength(8);
    // пагинация «1–8 из 12»
    expect(screen.getByText(/Показано 1–8 из 12/)).toBeTruthy();
    // bulk-select выделяет все на странице
    const checkboxes = container.querySelectorAll(
      'tbody input[type="checkbox"]'
    );
    fireEvent.click(checkboxes[0]);
    expect(
      (
        container.querySelectorAll(
          'tbody input[type="checkbox"]'
        )[0] as HTMLInputElement
      ).checked
    ).toBe(true);
  });
});
