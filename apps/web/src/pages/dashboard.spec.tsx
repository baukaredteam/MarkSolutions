// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./dashboard";
import { sessionStore } from "../session";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../api", () => ({
  api: { get, post: vi.fn() },
  ApiErrorResponse: class ApiErrorResponse extends Error {
    constructor(readonly error: { code: number; message: string }) {
      super(error.message);
    }
  },
  ApiUnavailable: class ApiUnavailable extends Error {},
}));

vi.mock("../toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

const EMPTY_SUMMARY = {
  codesNotApplied: 0,
  deadlineSoon: 0,
  openAggregates: 0,
  docsPendingDt: 0,
  exceptions: 0,
};

const POPULATED_SUMMARY = {
  codesNotApplied: 42,
  deadlineSoon: 2,
  openAggregates: 1,
  docsPendingDt: 3,
  exceptions: 5,
};

const INTEGRATIONS = {
  items: [
    { id: "mpt", name: "ИС МПТ", mode: "mock", errors: 0, queue: 0 },
    { id: "nkt", name: "НКТ", mode: "mock", errors: 1, queue: 0 },
    { id: "gs1", name: "GS1 Kazakhstan", mode: "mock" },
    { id: "1c", name: "1С:ERP", mode: "http", errors: 0, queue: 0 },
    { id: "1ecom", name: "1ecom", mode: "mock" },
  ],
};

function mockApis(summary: typeof EMPTY_SUMMARY) {
  get.mockImplementation((path: string) => {
    if (path === "/dashboard/summary") return Promise.resolve(summary);
    if (path === "/integrations/status") return Promise.resolve(INTEGRATIONS);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStore.clear();
  vi.restoreAllMocks();
  sessionStore.set({
    tenantId: "t",
    token: "j",
    roles: ["manager"],
    login: "m",
  });
});

describe("HOME-01 dashboard read-model", () => {
  it("рендерит заголовок, подзаголовок и 4 KPI-карточки", async () => {
    mockApis(EMPTY_SUMMARY);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Главная" })).toBeTruthy()
    );
    expect(
      screen.getByText(
        /Единая точка контроля маркировки: процессы, риски, задачи и состояние интеграций/
      )
    ).toBeTruthy();
    expect(screen.getByText("Операции сегодня")).toBeTruthy();
    expect(
      screen.getAllByText("Требуют внимания").length
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Активные поставки")).toBeTruthy();
    expect(screen.getByText("Кодов в работе")).toBeTruthy();
  });

  it("показывает честные пустые состояния без demo-чисел", async () => {
    mockApis(EMPTY_SUMMARY);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getAllByText("нет данных").length).toBeGreaterThan(0)
    );
    expect(screen.getByText("модуль поставок — нет")).toBeTruthy();
    expect(screen.queryByText("1 284")).toBeNull();
    expect(screen.queryByText("1284")).toBeNull();
    expect(screen.queryByText("42 800")).toBeNull();
    await waitFor(() =>
      expect(screen.getByText(/Нет задач, требующих внимания/)).toBeTruthy()
    );
  });

  it("мапит summary на KPI и список внимания", async () => {
    mockApis(POPULATED_SUMMARY);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("42")).toBeTruthy());
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("Интеграционные исключения")).toBeTruthy();
    expect(screen.getByText("ДТ ожидают оформления")).toBeTruthy();
    expect(screen.getByText("Заказы с дедлайном ≤ 7 дней")).toBeTruthy();
    expect(screen.getByText("Открытые агрегаты")).toBeTruthy();
    expect(screen.getByText("Коды без нанесения")).toBeTruthy();
  });

  it("интеграции: статус из API, без выдуманного «Работает»", async () => {
    mockApis(EMPTY_SUMMARY);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("ИС МПТ")).toBeTruthy());
    expect(screen.getByText("ЭСФ")).toBeTruthy();
    expect(screen.getByText("Таможня")).toBeTruthy();
    expect(screen.queryByText("Работает")).toBeNull();
    expect(screen.getAllByText("нет данных").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Мок (dev)").length).toBeGreaterThan(0);
    expect(screen.getByText("Ошибки: 1")).toBeTruthy();
    expect(screen.getByText("Подключено")).toBeTruthy();
  });

  it("быстрые переходы HOME-01", async () => {
    mockApis(EMPTY_SUMMARY);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("Центр задач")).toBeTruthy());
    expect(screen.getByText("Глобальный поиск")).toBeTruthy();
    expect(screen.getByText("Заказать коды")).toBeTruthy();
    expect(screen.getByText("Создать поставку")).toBeTruthy();
  });
});
