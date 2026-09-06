import { describe, expect, it } from "vitest";
import {
  RECENT_EVENTS_LIMIT,
  cardNameOf,
  codeRecentTitle,
  documentRecentTitle,
  mergeRecentEvents,
  orderRecentTitle,
  productRecentTitle,
  type RecentEvent,
} from "./dashboard.service";

function ev(
  id: string,
  at: string,
  title = id
): RecentEvent {
  return { id, source: "ORDER", at, title };
}

describe("HOME-03 recent events helpers", () => {
  it("mergeRecentEvents: newest first, cap 10", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      ev(`e${i}`, `2026-09-06T${String(10 + i).padStart(2, "0")}:00:00.000Z`)
    );
    const merged = mergeRecentEvents(items);
    expect(merged).toHaveLength(RECENT_EVENTS_LIMIT);
    expect(merged[0].id).toBe("e11");
    expect(merged[9].id).toBe("e2");
  });

  it("mergeRecentEvents: empty → []", () => {
    expect(mergeRecentEvents([])).toEqual([]);
  });

  it("titles match HOME mockup verbs; card name from attributes.name", () => {
    expect(orderRecentTitle(281, "ACCEPTED")).toBe(
      "Заказ кодов №281 принят системой"
    );
    expect(productRecentTitle("Motor Oil 5W-30", "REGISTERED")).toBe(
      "Карточка Motor Oil 5W-30 опубликована"
    );
    expect(documentRecentTitle("MS-2026-0841", "ERROR")).toBe(
      "Документ MS-2026-0841 отклонён ИС МПТ"
    );
    expect(cardNameOf({ name: " Motor Oil 5W-30 " })).toBe("Motor Oil 5W-30");
    expect(cardNameOf({})).toBe("без названия");
  });

  it("code title uses KM mask only — no full serial", () => {
    const mask = "04014835723399:80…01";
    const title = codeRecentTitle(mask, "PRINTED");
    expect(title).toBe("Код 04014835723399:80…01 напечатан");
    expect(title).not.toMatch(/8000001/);
    expect(title).not.toContain("serial");
  });
});
