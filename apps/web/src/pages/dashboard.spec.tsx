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
  recentEvents: [] as {
    id: string;
    source: "ORDER" | "PRODUCT" | "DOCUMENT" | "CODE";
    at: string;
    title: string;
  }[],
  myQueue: [] as {
    kind: "PRODUCT" | "ORDER" | "DOCUMENT";
    title: string;
    count: number;
    action: string;
    href: "/products" | "/orders" | "/operations";
  }[],
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
  recentEvents: [
    {
      id: "ORDER:o1",
      source: "ORDER" as const,
      at: new Date(Date.now() - 2 * 60_000).toISOString(),
      title: "Заказ кодов №281 принят системой",
    },
    {
      id: "PRODUCT:c1",
      source: "PRODUCT" as const,
      at: new Date(Date.now() - 18 * 60_000).toISOString(),
      title: "Карточка Motor Oil 5W-30 опубликована",
    },
    {
      id: "DOCUMENT:d1",
      source: "DOCUMENT" as const,
      at: new Date(Date.now() - 31 * 60_000).toISOString(),
      title: "Документ MS-2026-0841 отклонён ИС МПТ",
    },
  ],
  myQueue: [
    {
      kind: "PRODUCT" as const,
      title: "Карточки товара",
      count: 12,
      action: "Проверить атрибуты и регистрацию",
      href: "/products" as const,
    },
    {
      kind: "ORDER" as const,
      title: "Заказы кодов",
      count: 7,
      action: "Контроль статусов и ошибок",
      href: "/orders" as const,
    },
    {
      kind: "DOCUMENT" as const,
      title: "Документы",
      count: 4,
      action: "Исправить отклонённые операции",
      href: "/operations" as const,
    },
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

  it("HOME-03: пустой список — «Нет событий»", async () => {
    mockApis(EMPTY_SUMMARY);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Последние события")).toBeTruthy()
    );
    expect(screen.getByText("Нет событий")).toBeTruthy();
  });

  it("HOME-03: ≤10 событий, newest titles, KM mask only", async () => {
    const extra = Array.from({ length: 9 }, (_, i) => ({
      id: `ORDER:pad-${i}`,
      source: "ORDER" as const,
      at: new Date(Date.now() - (40 + i) * 60_000).toISOString(),
      title: `Заказ кодов №${400 + i} создан`,
    }));
    mockApis({
      ...POPULATED_SUMMARY,
      recentEvents: [
        ...POPULATED_SUMMARY.recentEvents,
        {
          id: "CODE:c1",
          source: "CODE" as const,
          at: new Date(Date.now() - 40 * 60_000).toISOString(),
          title: "Код 04014835723399:80…01 напечатан",
        },
        ...extra,
      ],
    });
    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText(/Заказ кодов №281 принят системой/)).toBeTruthy()
    );
    expect(
      screen.getByText(/Карточка Motor Oil 5W-30 опубликована/)
    ).toBeTruthy();
    expect(
      screen.getByText(/Документ MS-2026-0841 отклонён ИС МПТ/)
    ).toBeTruthy();
    expect(screen.getByText(/04014835723399:80…01/)).toBeTruthy();
    expect(
      container.querySelectorAll("[data-testid=home-recent-events] .event")
        .length
    ).toBe(10);
    expect(container.textContent).not.toContain("8000001");
    expect(screen.queryByText("Нет событий")).toBeNull();
  });

  it("HOME-04: пустая очередь — «Нет задач в очереди»", async () => {
    mockApis(EMPTY_SUMMARY);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("Моя очередь")).toBeTruthy());
    expect(screen.getByText("Нет задач в очереди")).toBeTruthy();
    expect(screen.queryByText("Проверить атрибуты и регистрацию")).toBeNull();
  });

  it("HOME-04: строки очереди и deep-link /products|/orders|/operations", async () => {
    mockApis(POPULATED_SUMMARY);
    function Loc() {
      const loc = useLocation();
      return <div data-testid="path">{loc.pathname}</div>;
    }
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Loc />
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/products" element={<div>products-page</div>} />
          <Route path="/orders" element={<div>orders-page</div>} />
          <Route path="/operations" element={<div>operations-page</div>} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Проверить атрибуты и регистрацию")).toBeTruthy()
    );
    expect(screen.getByText("Контроль статусов и ошибок")).toBeTruthy();
    expect(screen.getByText("Исправить отклонённые операции")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByText("Нет задач в очереди")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Каталог товаров" }));
    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe("/products")
    );
  });

  it("HOME-04: заказ кодов → /orders, документы → /operations", async () => {
    mockApis(POPULATED_SUMMARY);
    function Loc() {
      const loc = useLocation();
      return <div data-testid="path">{loc.pathname}</div>;
    }
    const { unmount } = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Loc />
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/orders" element={<div>orders-page</div>} />
          <Route path="/operations" element={<div>operations-page</div>} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Заказ кодов" })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "Заказ кодов" }));
    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe("/orders")
    );
    unmount();

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Loc />
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/operations" element={<div>operations-page</div>} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Операции" })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "Операции" }));
    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe("/operations")
    );
  });
});
