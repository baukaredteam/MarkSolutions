import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import {
  parseTaskFilter,
  relatedHrefForSource,
  TASK_SOURCES,
  TASK_STATUSES,
} from "./task.service";

describe("TASK-02 filter helpers", () => {
  it("omitted or blank source/status is unfiltered", () => {
    expect(parseTaskFilter(undefined, TASK_SOURCES, "source")).toBeUndefined();
    expect(parseTaskFilter("  ", TASK_STATUSES, "status")).toBeUndefined();
  });

  it("accepts the wire enums", () => {
    expect(parseTaskFilter("OUTBOX_FAILED", TASK_SOURCES, "source")).toBe(
      "OUTBOX_FAILED"
    );
    expect(parseTaskFilter("OPEN", TASK_STATUSES, "status")).toBe("OPEN");
  });

  it("invalid source or status → 400 fieldErrors", () => {
    try {
      parseTaskFilter("SLA_ENGINE", TASK_SOURCES, "source");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const body = (e as BadRequestException).getResponse() as {
        fieldErrors: { source: string };
      };
      expect(body.fieldErrors.source).toMatch(
        /OUTBOX_FAILED\|UTILISATION_ALERT/
      );
    }
    try {
      parseTaskFilter("DRAFT", TASK_STATUSES, "status");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const body = (e as BadRequestException).getResponse() as {
        fieldErrors: { status: string };
      };
      expect(body.fieldErrors.status).toMatch(/OPEN\|DONE/);
    }
  });

  it("relatedHref is source → existing app route", () => {
    expect(relatedHrefForSource("OUTBOX_FAILED")).toBe("/orders");
    expect(relatedHrefForSource("UTILISATION_ALERT")).toBe(
      "/operations/utilisation"
    );
  });
});
