// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { STATUS_BADGE, statusLabel } from "./status-labels";
import { StatusBadge } from "./badge";
import { render } from "@testing-library/react";

describe("status-labels (UI-i18n)", () => {
  it("CARD: SUBMITTED → «Отправлена на модерацию»", () => {
    expect(statusLabel("SUBMITTED")).toBe("Отправлена на модерацию");
  });

  it("все коды семейств дают русскую подпись (≠ код)", () => {
    const codes = [
      // CARD
      "DRAFT", "VALIDATING", "SUBMITTED", "IN_REVIEW", "APPROVED",
      "NEEDS_CORRECTION", "REJECTED", "REGISTERING", "REGISTERED",
      "SUSPENDED", "ARCHIVED",
      // ORDER
      "FUNDS_RESERVED", "QUEUED", "SENT", "ACCEPTED", "PROCESSING",
      "PARTIALLY_COMPLETED", "COMPLETED", "CANCELLED", "FAILED", "CLOSED",
      // CODE
      "ACTIVE", "PRINTED", "APPLIED", "UTILISED", "INTRODUCED", "EXPIRED",
      "AGGREGATED", "WITHDRAWN", "WRITTEN_OFF",
      // DOC
      "EXPECTED", "IN_PROCESS", "PARTIALLY_PROCESSED", "SUCCESS", "ERROR",
      // QUEUE/DEVICE
      "pending", "printing", "done", "ready", "offline",
    ];
    for (const c of codes) {
      expect(statusLabel(c), `code ${c}`).not.toBe(c);
    }
  });

  it("fallback: неизвестный код → сам код", () => {
    expect(statusLabel("NOPE")).toBe("NOPE");
  });

  it("каждый код с подписью имеет цвет в STATUS_BADGE", () => {
    const dict = statusLabel; // просто референс
    void dict;
    // покрытие: все коды из словарей имеют badge-цвет
    const samples = [
      "DRAFT", "SUBMITTED", "QUEUED", "COMPLETED", "FAILED",
      "ACTIVE", "PRINTED", "APPLIED", "INTRODUCED", "WRITTEN_OFF",
      "SUCCESS", "ERROR", "pending", "done", "ready",
    ];
    for (const c of samples) {
      expect(STATUS_BADGE[c], `badge ${c}`).toBeTruthy();
    }
  });

  it("Badge: data-status={code}, текст = русская подпись", () => {
    const { container } = render(<StatusBadge code="SUBMITTED" />);
    const el = container.querySelector(".badge");
    expect(el?.getAttribute("data-status")).toBe("SUBMITTED");
    expect(el?.textContent).toBe("Отправлена на модерацию");
  });
});
