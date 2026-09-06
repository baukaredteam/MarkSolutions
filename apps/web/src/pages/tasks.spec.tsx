// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TasksPage, type TaskRow } from "./tasks";
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

const OPEN_TASK: TaskRow = {
  id: "t1",
  tenantId: "tenant-a",
  source: "OUTBOX_FAILED",
  sourceRef: "out-1",
  type: "ERROR",
  title: "Ошибка интеграции: timeout A",
  status: "OPEN",
  severity: "CRITICAL",
  createdAt: "2026-08-31T00:00:00.000Z",
};

const ALERT_TASK: TaskRow = {
  id: "t2",
  tenantId: "tenant-a",
  source: "UTILISATION_ALERT",
  sourceRef: "alert-1",
  type: "WARNING",
  title: "Алерт нанесения: осталось 2 дн.",
  status: "OPEN",
  severity: "HIGH",
  createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStore.clear();
  get.mockReset();
  sessionStore.set({
    tenantId: "tenant-a",
    token: "j",
    roles: ["admin"],
    login: "a",
  });
});

describe("Центр задач (TASK minimal)", () => {
  it("пустая очередь — текст ТЗ и переход на Главную, не StubPage", async () => {
    get.mockResolvedValue({ items: [] });
    function Loc() {
      const loc = useLocation();
      return <div data-testid="path">{loc.pathname}</div>;
    }
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Loc />
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/dashboard" element={<div>home</div>} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Открытых задач нет")).toBeTruthy()
    );
    expect(screen.getByText(/Все текущие задачи обработаны/)).toBeTruthy();
    expect(screen.queryByText(/заглушка/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Перейти на Главную" }));
    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe("/dashboard")
    );
  });

  it("список tenant-задач: заголовок, тип, статус, без полного КМ", async () => {
    get.mockResolvedValue({ items: [OPEN_TASK] });
    render(
      <MemoryRouter>
        <TasksPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Центр задач и уведомлений" })
      ).toBeTruthy()
    );
    expect(screen.getByText("Ошибка интеграции: timeout A")).toBeTruthy();
    expect(screen.getByText("Ошибка")).toBeTruthy();
    expect(screen.getAllByText("Открыта").length).toBeGreaterThan(0);
    expect(screen.getByText("Крит.")).toBeTruthy();
    expect(screen.getByText("1 требуют реакции")).toBeTruthy();
    expect(screen.queryByText(/01\d{12}21/)).toBeNull();
  });

  it("deep-link ?source=OUTBOX_FAILED&status=OPEN → GET /tasks с теми же query", async () => {
    get.mockResolvedValue({ items: [OPEN_TASK] });
    function Loc() {
      const loc = useLocation();
      return <div data-testid="search">{loc.search}</div>;
    }
    render(
      <MemoryRouter
        initialEntries={["/tasks?source=OUTBOX_FAILED&status=OPEN"]}
      >
        <Loc />
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/tasks?source=OUTBOX_FAILED&status=OPEN"
      )
    );
    expect(screen.getByTestId("search").textContent).toBe(
      "?source=OUTBOX_FAILED&status=OPEN"
    );
    expect(
      (screen.getByLabelText("Фильтр: источник") as HTMLSelectElement).value
    ).toBe("OUTBOX_FAILED");
    expect(
      (screen.getByLabelText("Фильтр: статус") as HTMLSelectElement).value
    ).toBe("OPEN");
    expect(screen.getByText("Ошибка интеграции: timeout A")).toBeTruthy();
  });

  it("смена фильтра пишет query в URL и перезапрашивает очередь", async () => {
    get.mockResolvedValue({ items: [OPEN_TASK, ALERT_TASK] });
    function Loc() {
      const loc = useLocation();
      return <div data-testid="search">{loc.search}</div>;
    }
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Loc />
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(get).toHaveBeenCalledWith("/tasks"));
    fireEvent.change(screen.getByLabelText("Фильтр: источник"), {
      target: { value: "UTILISATION_ALERT" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("search").textContent).toBe(
        "?source=UTILISATION_ALERT"
      )
    );
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/tasks?source=UTILISATION_ALERT")
    );
    fireEvent.change(screen.getByLabelText("Фильтр: статус"), {
      target: { value: "DONE" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("search").textContent).toBe(
        "?source=UTILISATION_ALERT&status=DONE"
      )
    );
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/tasks?source=UTILISATION_ALERT&status=DONE"
      )
    );
  });

  it("пустой результат фильтра — не StubPage, фильтры остаются", async () => {
    get.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter initialEntries={["/tasks?status=DONE"]}>
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Нет задач по выбранным фильтрам")).toBeTruthy()
    );
    expect(screen.queryByText(/заглушка/i)).toBeNull();
    expect(
      (screen.getByLabelText("Фильтр: статус") as HTMLSelectElement).value
    ).toBe("DONE");
  });

  it("возраст и createdAt видны в строке", async () => {
    get.mockResolvedValue({ items: [ALERT_TASK] });
    render(
      <MemoryRouter>
        <TasksPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Алерт нанесения: осталось 2 дн.")).toBeTruthy()
    );
    expect(screen.getByText(/3 ч/)).toBeTruthy();
    const created = new Date(ALERT_TASK.createdAt);
    const dd = String(created.getUTCDate()).padStart(2, "0");
    const mm = String(created.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = created.getUTCFullYear();
    expect(
      screen.getByText(new RegExp(`${dd}\\.${mm}\\.${yyyy}`))
    ).toBeTruthy();
  });

  it("клик по строке Outbox → /orders", async () => {
    get.mockResolvedValue({ items: [OPEN_TASK] });
    function Loc() {
      const loc = useLocation();
      return <div data-testid="path">{loc.pathname}</div>;
    }
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Loc />
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/orders" element={<div>orders-page</div>} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Ошибка интеграции: timeout A")).toBeTruthy()
    );
    fireEvent.click(screen.getByText("Ошибка интеграции: timeout A"));
    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe("/orders")
    );
  });

  it("клик по строке нанесения → /operations/utilisation", async () => {
    get.mockResolvedValue({ items: [ALERT_TASK] });
    function Loc() {
      const loc = useLocation();
      return <div data-testid="path">{loc.pathname}</div>;
    }
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Loc />
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
          <Route
            path="/operations/utilisation"
            element={<div>utilisation-page</div>}
          />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText("Алерт нанесения: осталось 2 дн.")).toBeTruthy()
    );
    fireEvent.click(screen.getByText("Алерт нанесения: осталось 2 дн."));
    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe(
        "/operations/utilisation"
      )
    );
  });
});
