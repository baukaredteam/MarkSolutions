import { describe, expect, it } from "vitest";
import {
  buildOpsLast7d,
  opsDeltaPct,
  startOfUtcDay,
  utcDateKey,
} from "./dashboard.service";

describe("HOME-02 ops KPI helpers", () => {
  const now = new Date("2026-09-06T15:30:00.000Z");

  it("buildOpsLast7d: 7 UTC days ending today, empty → zeros", () => {
    const days = buildOpsLast7d([], now);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-08-31", count: 0 });
    expect(days[6]).toEqual({ date: "2026-09-06", count: 0 });
    expect(days.every((d) => d.count === 0)).toBe(true);
  });

  it("buildOpsLast7d: buckets documents/events/orders; drops outside window", () => {
    const days = buildOpsLast7d(
      [
        new Date("2026-09-06T01:00:00.000Z"),
        new Date("2026-09-06T23:00:00.000Z"),
        new Date("2026-09-05T12:00:00.000Z"),
        new Date("2026-08-31T00:00:00.000Z"),
        new Date("2026-08-30T23:59:59.000Z"),
      ],
      now
    );
    expect(days[0]).toEqual({ date: "2026-08-31", count: 1 });
    expect(days[5]).toEqual({ date: "2026-09-05", count: 1 });
    expect(days[6]).toEqual({ date: "2026-09-06", count: 2 });
    expect(days.slice(1, 5).every((d) => d.count === 0)).toBe(true);
  });

  it("opsDeltaPct: +8% к вчера; null when yesterday is 0", () => {
    expect(opsDeltaPct(108, 100)).toBe(8);
    expect(opsDeltaPct(50, 100)).toBe(-50);
    expect(opsDeltaPct(3, 0)).toBeNull();
    expect(opsDeltaPct(0, 0)).toBeNull();
  });

  it("startOfUtcDay / utcDateKey: UTC, not local wall-clock", () => {
    const d = new Date("2026-09-06T01:15:00.000Z");
    expect(utcDateKey(d)).toBe("2026-09-06");
    expect(startOfUtcDay(d).toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });
});
