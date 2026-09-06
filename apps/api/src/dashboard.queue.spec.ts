import { describe, expect, it } from "vitest";
import {
  MY_QUEUE_DOCUMENT_STATUSES,
  MY_QUEUE_ORDER_STATUSES,
  MY_QUEUE_PRODUCT_STATUSES,
  buildMyQueue,
} from "./dashboard.service";

describe("HOME-04 my-queue helpers", () => {
  it("buildMyQueue: empty counts → []", () => {
    expect(buildMyQueue({ products: 0, orders: 0, documents: 0 })).toEqual([]);
  });

  it("buildMyQueue: only rows with count > 0, mockup titles/actions/hrefs", () => {
    expect(buildMyQueue({ products: 12, orders: 0, documents: 4 })).toEqual([
      {
        kind: "PRODUCT",
        title: "Карточки товара",
        count: 12,
        action: "Проверить атрибуты и регистрацию",
        href: "/products",
      },
      {
        kind: "DOCUMENT",
        title: "Документы",
        count: 4,
        action: "Исправить отклонённые операции",
        href: "/operations",
      },
    ]);
    expect(buildMyQueue({ products: 0, orders: 7, documents: 0 })).toEqual([
      {
        kind: "ORDER",
        title: "Заказы кодов",
        count: 7,
        action: "Контроль статусов и ошибок",
        href: "/orders",
      },
    ]);
  });

  it("queue statuses are action-needed only (no REGISTERED/COMPLETED/SUCCESS)", () => {
    expect(MY_QUEUE_PRODUCT_STATUSES).toEqual([
      "DRAFT",
      "NEEDS_CORRECTION",
      "REJECTED",
    ]);
    expect(MY_QUEUE_ORDER_STATUSES).toEqual([
      "DRAFT",
      "SENT",
      "ACCEPTED",
      "PROCESSING",
      "REJECTED",
      "FAILED",
    ]);
    expect(MY_QUEUE_DOCUMENT_STATUSES).toEqual(["ERROR"]);
    expect(MY_QUEUE_PRODUCT_STATUSES).not.toContain("REGISTERED");
    expect(MY_QUEUE_ORDER_STATUSES).not.toContain("COMPLETED");
    expect(MY_QUEUE_DOCUMENT_STATUSES).not.toContain("SUCCESS");
  });
});
