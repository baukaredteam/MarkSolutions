// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

const EMPTY_OPS_7D = [
  { date: "2026-08-31", count: 0 },
  { date: "2026-09-01", count: 0 },
  { date: "2026-09-02", count: 0 },
  { date: "2026-09-03", count: 0 },
  { date: "2026-09-04", count: 0 },
  { date: "2026-09-05", count: 0 },
  { date: "2026-09-06", count: 0 },
];

const EMPTY_SUMMARY = {
  codesNotApplied: 0,
  deadlineSoon: 0,
  openAggregates: 0,
  docsPendingDt: 0,
  exceptions: 0,
  openTasks: 0,
  operationsToday: 0,
  operationsYesterday: 0,
  operationsDeltaPct: null as number | null,
  operationsLast7d: EMPTY_OPS_7D,
};

const POPULATED_SUMMARY = {
  codesNotApplied: 42,
  deadlineSoon: 2,
  openAggregates: 1,
  docsPendingDt: 3,
  exceptions: 5,
  openTasks: 5,
  operationsToday: 108,
  operationsYesterday: 100,
  operationsDeltaPct: 8,
  operationsLast7d: [
    { date: "2026-08-31", count: 10 },
    { date: "2026-09-01", count: 12 },
    { date: "2026-09-02", count: 9 },
    { date: "2026-09-03", count: 20 },
    { date: "2026-09-04", count: 15 },
    { date: "2026-09-05", count: 100 },
    { date: "2026-09-06", count: 108 },
  ],
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

const EMPTY_CATALOG = { items: [] as { gtin?: string | null }[] };
const EMPTY_DRAFTS = { items: [] as { proposed?: { gtin?: string } }[] };

function mockApis(
  summary: typeof EMPTY_SUMMARY,
  catalog = EMPTY_CATALOG,
  drafts = EMPTY_DRAFTS
) {
  get.mockImplementation((path: string) => {
    if (path === "/dashboard/summary") return Promise.resolve(summary);
    if (path === "/integrations/status") return Promise.resolve(INTEGRATIONS);
    if (path === "/products/cards") return Promise.resolve(catalog);
    if (path === "/products/drafts") return Promise.resolve(drafts);
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
  it("рендерит breadcrumb, заголовок, роль и 4 KPI-карточки", async () => {
    mockApis(EMPTY_SUMMARY);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Главная" })).toBeTruthy()
    );
    expect(screen.getByText("Главная / HOME-01")).toBeTruthy();
    expect(
      screen.getByText(
        /Единая точка контроля маркировки: процессы, риски, задачи и состояние интеграций/
      )
    ).toBeTruthy();
    expect(screen.getByText(/Роль: Руководитель/)).toBeTruthy();
    expect(screen.getByText("Операции сегодня")).toBeTruthy();
    expect(
      screen.getAllByText("Требуют внимания").length
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Активные поставки")).toBeTruthy();
    expect(screen.getByText("Кодов в работе")).toBeTruthy();
  });

  it("HOME-06: пустое состояние без demo-чисел и с CTA", async () => {
    mockApis(EMPTY_SUMMARY);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Данных пока недостаточно")).toBeTruthy()
    );
    expect(
      screen.getByText(/После начала работы здесь появятся ключевые показатели/)
    ).toBeTruthy();
    expect(screen.getByText("Создать первый заказ кодов")).toBeTruthy();
    expect(screen.getByText("Открыть Глобальный поиск")).toBeTruthy();
    expect(screen.getAllByText("нет данных").length).toBeGreaterThan(0);
    expect(screen.getByText("модуль поставок — нет")).toBeTruthy();
    expect(screen.queryByText("1 284")).toBeNull();
    expect(screen.queryByText("1284")).toBeNull();
    expect(screen.queryByText("42 800")).toBeNull();
  });

  it("attention KPI не включает codesNotApplied; коды только на отдельной карточке", async () => {
    mockApis(POPULATED_SUMMARY);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1)
    );
    expect(screen.getByText("5 критичных")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Открытые задачи")).toBeTruthy();
    expect(screen.getByText("ДТ ожидают оформления")).toBeTruthy();
    expect(screen.getByText("Заказы с дедлайном ≤ 7 дней")).toBeTruthy();
    expect(screen.queryByText("Открытые агрегаты")).toBeNull();
    expect(screen.queryByText("Коды без нанесения")).toBeNull();
    expect(screen.getAllByText("SLA").length).toBeGreaterThanOrEqual(3);
  });

  it("исключения открывают /tasks, не legacy /exceptions", async () => {
    mockApis({ ...EMPTY_SUMMARY, exceptions: 2, openTasks: 2 });
    function Loc() {
      const loc = useLocation();
      return <div data-testid="path">{loc.pathname}</div>;
    }
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Loc />
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tasks" element={<div>tasks-page</div>} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Открытые задачи")).toBeTruthy()
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Открыть" })[0]);
    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe("/tasks")
    );
  });

  it("ТОВАР из каталога: карточки без GTIN", async () => {
    mockApis(
      EMPTY_SUMMARY,
      { items: [{ gtin: null }, { gtin: "04014835723399" }] },
      { items: [{ proposed: {} }] }
    );
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Карточка без GTIN")).toBeTruthy()
    );
    expect(screen.getByText("2 карточек")).toBeTruthy();
    expect(screen.getByText("ТОВАР")).toBeTruthy();
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

  it("рабочая динамика: chart-grid placeholder «Нет данных»", async () => {
    mockApis(EMPTY_SUMMARY);
    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("Нет данных")).toBeTruthy());
    expect(container.querySelector(".chart")).toBeTruthy();
    expect(screen.getByText("нет операций за сегодня")).toBeTruthy();
    expect(
      container.querySelector(".home-kpi--green .home-kpi-num")?.textContent
    ).toBe("0");
  });

  it("HOME-02: живые операции сегодня и столбики динамики, не «нет данных»", async () => {
    mockApis(POPULATED_SUMMARY);
    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("108")).toBeTruthy());
    expect(screen.getByText("+8% к вчера")).toBeTruthy();
    expect(screen.queryByText("нет операций за сегодня")).toBeNull();
    const opsCard = container.querySelector(".home-kpi--green");
    expect(opsCard?.textContent).not.toContain("нет данных");
    expect(screen.queryByText("Нет данных")).toBeNull();
    expect(container.querySelectorAll(".home-dynamics-bar").length).toBe(7);
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
