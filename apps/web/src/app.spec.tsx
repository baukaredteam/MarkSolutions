// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./app";

const routes = [
  { path: "/apply", heading: "Заявка на подключение" },
  { path: "/status", heading: "Статус заявки" },
  { path: "/login", heading: "Вход" },
  { path: "/products", heading: "Товары" },
];

describe("smoke render 4 routes", () => {
  routes.forEach((r) => {
    it(`renders ${r.path}`, () => {
      render(
        <MemoryRouter initialEntries={[r.path]}>
          <AppRoutes />
        </MemoryRouter>
      );
      expect(screen.getByRole("heading", { name: r.heading })).toBeTruthy();
    });
  });
});
