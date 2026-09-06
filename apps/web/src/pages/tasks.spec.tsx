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
    expect(screen.getByText("Открыта")).toBeTruthy();
    expect(screen.getByText("Крит.")).toBeTruthy();
    expect(screen.getByText("1 требуют реакции")).toBeTruthy();
    expect(screen.queryByText(/01\d{12}21/)).toBeNull();
  });
});
