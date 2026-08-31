// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./app";
import { sessionStore } from "./session";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStore.clear();
});

const stubRoutes = [
  ["/codecheck", "Информация о коде"],
  ["/search", "Глобальный поиск"],
  ["/aggregation", "Агрегация"],
  ["/shipments", "Поставки"],
  ["/warehouse", "Склад и ТСД"],
  ["/reports", "Отчёты и аналитика"],
  ["/support", "Поддержка"],
  ["/organization", "Организация и доступ"],
  ["/tasks", "Центр задач и уведомлений"],
  ["/production", "Производство"],
  ["/partners", "Контрагенты"],
  ["/processes", "Конструктор процессов"],
  ["/exceptions", "Центр исключений"],
  ["/health", "Состояние платформы"],
  ["/ai", "ИИ помощник"],
  ["/knowledge", "База знаний"],
  ["/settings", "Настройки"],
];

describe("routing: LoginGate + RequireAuth", () => {
  it("неавторизованный /login → standalone LoginPage (нет sidebar)", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("heading", { name: "Вход в систему" })
    ).toBeTruthy();
    expect(screen.queryByText("Кабинет оператора")).toBeNull();
  });

  it("неавторизованный /dashboard → редирект на /login", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("heading", { name: "Вход в систему" })
    ).toBeTruthy();
  });

  it("авторизованный /login → редирект на default-route (/dashboard)", () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Главная" })).toBeTruthy();
  });

  it("/operations → редирект на /documents", () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    render(
      <MemoryRouter initialEntries={["/operations"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("heading", { name: "Операции и документы" })
    ).toBeTruthy();
  });

  stubRoutes.forEach(([path, heading]) => {
    it(`renders ${path} (авторизован)`, () => {
      sessionStore.set({
        tenantId: "t",
        token: "j",
        roles: ["admin"],
        login: "a",
      });
      render(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      );
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    });
  });

  it("неизвестный маршрут авторизованного → /dashboard", () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    render(
      <MemoryRouter initialEntries={["/nope"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Главная" })).toBeTruthy();
  });
});
