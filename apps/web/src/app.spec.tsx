// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./app";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

// Заглушенные страницы рендерят h1 с заголовком
const stubRoutes = [
  ["/codecheck", "Информация о коде"],
  ["/vault", "Code Vault"],
  ["/labels", "Этикетки"],
  ["/operations", "Операции"],
  ["/warehouse", "Склад и ТСД"],
  ["/documents", "Документы"],
  ["/reports", "Отчёты"],
  ["/integrations", "Интеграции"],
  ["/support", "Поддержка"],
  ["/organization", "Организация и доступ"],
  ["/operator", "Кабинет оператора"],
  ["/audit", "Журнал аудита"],
  ["/tasks", "Центр задач"],
  ["/production", "Производство"],
  ["/partners", "Контрагенты"],
  ["/processes", "Конструктор процессов"],
  ["/exceptions", "Центр исключений"],
  ["/health", "Состояние платформы"],
];

describe("smoke render: login + stub pages", () => {
  it("renders /login (неавторизован)", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("heading", { name: "Вход в систему" })
    ).toBeTruthy();
  });

  stubRoutes.forEach(([path, heading]) => {
    it(`renders stub ${path}`, () => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      );
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    });
  });
});
