// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { UtilisationFormPage } from "./utilisation-form";

function Loc() {
  const loc = useLocation();
  return <div data-testid="path">{loc.pathname}</div>;
}

describe("utilisation form page (OPS journal wiring)", () => {
  it("форма нанесения в shell, не StubPage, возврат в журнал", () => {
    render(
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
    expect(
      screen.getByRole("heading", { name: "Отчёт о нанесении" })
    ).toBeTruthy();
    expect(screen.getByText("Зарегистрировать нанесение")).toBeTruthy();
    expect(screen.queryByText(/заглушка/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "К журналу" }));
    expect(screen.getByTestId("path").textContent).toBe("/operations");
  });
});
