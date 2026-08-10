// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApplyPage } from "./apply";

const { postRaw } = vi.hoisted(() => ({
  postRaw: vi.fn().mockResolvedValue({
    status: 201,
    body: { id: "app-1", status: "PENDING" },
  }),
}));

vi.mock("../api", () => ({
  api: { postRaw },
  ApiErrorResponse: class ApiErrorResponse extends Error {},
  ApiUnavailable: class ApiUnavailable extends Error {},
}));

vi.mock("../toast", () => ({
  useToast: () => ({ push: vi.fn() }),
}));

describe("ApplyPage payload", () => {
  beforeEach(() => postRaw.mockClear());

  it("sends the API consent fields when the offer checkbox is checked", async () => {
    render(
      <MemoryRouter>
        <ApplyPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "demo@example.kz" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Наименование организации" }),
      {
        target: { value: "ТОО Demo" },
      }
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));

    await waitFor(() => expect(postRaw).toHaveBeenCalledTimes(1));
    expect(postRaw.mock.calls[0][0]).toBe("/onboarding/applications");
    expect(postRaw.mock.calls[0][1]).toMatchObject({
      consentDocument: "offer-v1",
      consentSubject: "demo@example.kz",
    });
    expect(postRaw.mock.calls[0][1]).not.toHaveProperty("offerVersion");
  });
});
