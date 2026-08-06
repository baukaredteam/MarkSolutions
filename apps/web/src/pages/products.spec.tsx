// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProductsPage } from "./products";
import { sessionStore } from "../session";
import fixture from "../../../../fixtures/invoice-38.json";

describe("ProductsPage", () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  it("renders all 40 fixture rows after load and marks 38 out-of-list red", () => {
    sessionStore.set({ tenantId: "t1", token: "jwt" });
    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Загрузить инвойс (демо)"));

    const rows = screen.getAllByRole("row").slice(1); // minus header
    expect(rows).toHaveLength(40);

    const red = rows.filter((r) => r.getAttribute("style")?.includes("red"));
    expect(red).toHaveLength(38);
    expect(fixture).toHaveLength(40);
  });

  it("shows hint for out-of-list TNVED", () => {
    sessionStore.set({ tenantId: "t1", token: "jwt" });
    render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Загрузить инвойс (демо)"));
    expect(screen.getAllByText(/возможно 2710198200/).length).toBeGreaterThan(
      0
    );
  });
});
