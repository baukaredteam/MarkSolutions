// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { UtilisationFormPage } from "./utilisation-form";

const { postRaw, get, MockApiErrorResponse } = vi.hoisted(() => {
  class MockApiErrorResponse extends Error {
    constructor(readonly error: { code: number; message: string }) {
      super(error.message);
    }
  }
  return {
    postRaw: vi.fn(),
    get: vi.fn(),
    MockApiErrorResponse,
  };
});

vi.mock("../api", () => ({
  api: { get, postRaw },
  ApiErrorResponse: MockApiErrorResponse,
  ApiUnavailable: class ApiUnavailable extends Error {},
}));

const toastPush = vi.fn();
vi.mock("../toast", () => ({ useToast: () => ({ push: toastPush }) }));

const ORDERS = {
  items: [
    {
      id: "ord-completed",
      number: 7,
      gtin: "04014835723399",
      status: "COMPLETED",
    },
    {
      id: "ord-draft",
      number: 8,
      gtin: "04650063110374",
      status: "DRAFT",
    },
  ],
};

function Loc() {
  const loc = useLocation();
  return <div data-testid="path">{loc.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/operations/utilisation"]}>
      <Loc />
      <Routes>
        <Route
          path="/operations/utilisation"
          element={<UtilisationFormPage />}
        />
        <Route path="/operations" element={<div>журнал</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function pickOrderAndGoToFields() {
  await waitFor(() =>
    expect(screen.getByRole("option", { name: /KM-2026-000007/ })).toBeTruthy()
  );
  fireEvent.change(screen.getByLabelText("Заказ"), {
    target: { value: "ord-completed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Далее" }));
}

function fillFields() {
  fireEvent.change(screen.getByLabelText("Тип выпуска"), {
    target: { value: "IMPORT" },
  });
  fireEvent.change(screen.getByLabelText("Дата окончания"), {
    target: { value: "2027-01-31" },
  });
  fireEvent.change(screen.getByLabelText("Дата производства"), {
    target: { value: "2026-09-01" },
  });
  fireEvent.change(screen.getByLabelText("Страна (ISO2)"), {
    target: { value: "kz" },
  });
}

describe("utilisation form page (OPS-04 wizard)", () => {
  beforeEach(() => {
    postRaw.mockReset();
    get.mockReset();
    toastPush.mockReset();
    get.mockImplementation((path: string) => {
      if (path === "/orders") return Promise.resolve(ORDERS);
      return Promise.resolve({ items: [] });
    });
    postRaw.mockResolvedValue({
      status: 201,
      body: { reportId: "r1", status: "SUCCESS" },
    });
  });

  it("форма нанесения в shell, не StubPage, возврат в журнал", async () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: "Отчёт о нанесении" })
    ).toBeTruthy();
    expect(screen.getByLabelText("Шаги мастера")).toBeTruthy();
    expect(screen.getAllByText("Заказ").length).toBeGreaterThan(0);
    expect(screen.getByText("Поля")).toBeTruthy();
    expect(screen.getByText("Подтверждение")).toBeTruthy();
    expect(screen.getByText("Статус")).toBeTruthy();
    expect(screen.queryByText(/заглушка/i)).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /KM-2026-000007/ })
      ).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "К журналу" }));
    expect(screen.getByTestId("path").textContent).toBe("/operations");
  });

  it("заказ выбирается из GET /orders, не из голого UUID", async () => {
    renderPage();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/orders"));
    expect(
      screen.getByRole("option", {
        name: /KM-2026-000007 · 04014835723399 · COMPLETED/,
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("option", {
        name: /KM-2026-000008 · 04650063110374 · DRAFT/,
      })
    ).toBeTruthy();
    expect(screen.queryByPlaceholderText("orderId")).toBeNull();
    expect(screen.queryByLabelText("orderId")).toBeNull();
  });

  it("мастер: заказ → поля → подтверждение → POST /utilisation → статус", async () => {
    renderPage();
    await pickOrderAndGoToFields();

    expect(screen.getByLabelText("Тип выпуска")).toBeTruthy();
    expect(screen.getByLabelText("Дата окончания")).toBeTruthy();
    fillFields();
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    expect(screen.getByText(/KM-2026-000007/)).toBeTruthy();
    expect(screen.getByText("IMPORT")).toBeTruthy();
    expect(screen.getByText("2027-01-31")).toBeTruthy();
    expect(screen.getByText("2026-09-01")).toBeTruthy();
    expect(screen.getByText("KZ")).toBeTruthy();
    expect(postRaw).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Зарегистрировать нанесение" })
    );

    await waitFor(() => expect(postRaw).toHaveBeenCalled());
    const [path, body, key] = postRaw.mock.calls[0];
    expect(path).toBe("/utilisation");
    expect(body).toEqual({
      orderId: "ord-completed",
      releaseType: "IMPORT",
      expirationDate: "2027-01-31",
      productionDate: "2026-09-01",
      manufacturerCountry: "KZ",
    });
    expect(key).toBeTruthy();

    await waitFor(() =>
      expect(
        screen.getByText("Нанесение зарегистрировано, коды списаны")
      ).toBeTruthy()
    );
    expect(screen.getByText(/SUCCESS/)).toBeTruthy();
  });

  it("без выбранного заказа на шаг полей не пускает", async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /KM-2026-000007/ })
      ).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.queryByLabelText("Дата окончания")).toBeNull();
    expect(toastPush).toHaveBeenCalled();
  });

  it("ERROR от mock POST показывает rejectReason на шаге статуса", async () => {
    postRaw.mockResolvedValue({
      status: 201,
      body: {
        reportId: "r-err",
        status: "ERROR",
        rejectReason: "unknown code",
      },
    });
    renderPage();
    await pickOrderAndGoToFields();
    fillFields();
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Зарегистрировать нанесение" })
    );
    await waitFor(() => expect(screen.getByText(/unknown code/)).toBeTruthy());
    expect(screen.getByText(/ERROR/)).toBeTruthy();
  });
});
