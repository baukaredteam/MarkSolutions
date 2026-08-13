// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { IntegrationsPage } from "./integrations";
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

const STATUS = {
  items: [
    {
      id: "mpt",
      name: "ИС МПТ",
      icon: "МП",
      desc: "Коды",
      mode: "mock",
      latencyP95: 820,
      errorsPct: 0.3,
      errors: 1,
      queue: 2,
    },
    {
      id: "nkt",
      name: "НКТ",
      icon: "НК",
      desc: "Регистрация",
      mode: "mock",
      queue: 0,
      errors: 0,
    },
    {
      id: "gs1",
      name: "GS1 Kazakhstan",
      icon: "ГС",
      desc: "Проверка GTIN",
      mode: "mock",
      last: "mod10",
    },
    {
      id: "1c",
      name: "1С:ERP",
      icon: "1C",
      desc: "Файлы",
      mode: "mock",
      last: "Файлы v1",
    },
    {
      id: "1ecom",
      name: "1ecom",
      icon: "E",
      desc: "Контрагент",
      mode: "mock",
      last: "BIN",
    },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStore.clear();
  vi.restoreAllMocks();
});

describe("integrations page (W5-02)", () => {
  it("рендерит карточки адаптеров со статусами и метриками MPT", async () => {
    sessionStore.set({
      tenantId: "t",
      token: "j",
      roles: ["admin"],
      login: "a",
    });
    get.mockResolvedValue(STATUS);
    render(<IntegrationsPage />);
    await waitFor(() => expect(screen.getByText("Интеграции")).toBeTruthy());
    expect(screen.getByText("ИС МПТ")).toBeTruthy();
    expect(screen.getByText("НКТ")).toBeTruthy();
    expect(screen.getByText("GS1 Kazakhstan")).toBeTruthy();
    expect(screen.getByText("1С:ERP")).toBeTruthy();
    expect(screen.getByText("1ecom")).toBeTruthy();
    // MPT метрики
    expect(screen.getByText(/Latency p95: 820/)).toBeTruthy();
    expect(screen.getByText(/Очередь: 2/)).toBeTruthy();
    // статус mock
    expect(screen.getAllByText("Мок").length).toBeGreaterThan(0);
  });
});
