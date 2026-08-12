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
    fireEvent.click(screen.getByText("Каталог товаров"));
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
    // accountant → /billing (BalancePage заголовок)
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Баланс/ })).toBeTruthy();
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
