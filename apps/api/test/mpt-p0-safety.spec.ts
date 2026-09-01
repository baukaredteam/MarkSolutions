import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OutboxPoller,
  DEFAULT_MPT_ORDER_TIMEOUT_MS,
} from "../src/outbox-poller";
import {
  MptPermanentError,
  MptUnknownResultError,
} from "../src/http-mpt.adapter";
import type { IMptAdapter } from "../src/integrations";

// In-memory Prisma + stub MPT: P0 send/reconcile without STAGE or PG.

type OutboxRow = {
  id: string;
  aggregate: string;
  status: string;
  payload: Record<string, unknown>;
  processedAt?: Date | null;
};

type OrderRow = {
  id: string;
  tenantId: string;
  status: string;
  gtin: string | null;
  isPaid: boolean;
  productGroup?: string | null;
  businessPlaceId?: number | null;
  externalOrderId?: string | null;
  cardId?: string | null;
  updatedAt: Date;
  lines: Array<{ gtin: string; quantity: number }>;
};

function memPrisma(state: { outbox: OutboxRow[]; orders: OrderRow[] }) {
  return {
    outbox: {
      findMany: async (args: {
        where?: { aggregate?: string; status?: string };
      }) =>
        state.outbox.filter((r) => {
          if (args.where?.aggregate && r.aggregate !== args.where.aggregate)
            return false;
          if (args.where?.status && r.status !== args.where.status)
            return false;
          return true;
        }),
      findUnique: async (args: { where: { id: string } }) =>
        state.outbox.find((r) => r.id === args.where.id) ?? null,
      update: async (args: {
        where: { id: string };
        data: Partial<OutboxRow>;
      }) => {
        const row = state.outbox.find((r) => r.id === args.where.id);
        if (!row) throw new Error("outbox missing");
        Object.assign(row, args.data);
        return row;
      },
      create: async (args: {
        data: Omit<OutboxRow, "id"> & { id?: string };
      }) => {
        const row: OutboxRow = {
          id: args.data.id ?? `ob-${state.outbox.length + 1}`,
          aggregate: args.data.aggregate,
          status: args.data.status ?? "PENDING",
          payload: (args.data.payload ?? {}) as Record<string, unknown>,
          processedAt: args.data.processedAt ?? null,
        };
        state.outbox.push(row);
        return row;
      },
    },
    order: {
      findMany: async (args: { where?: { status?: { in: string[] } } }) => {
        const allowed = args.where?.status?.in;
        return state.orders.filter((o) =>
          allowed ? allowed.includes(o.status) : true
        );
      },
      findUnique: async (args: { where: { id: string } }) =>
        state.orders.find((o) => o.id === args.where.id) ?? null,
      update: async (args: {
        where: { id: string };
        data: Partial<OrderRow>;
      }) => {
        const row = state.orders.find((o) => o.id === args.where.id);
        if (!row) throw new Error("order missing");
        Object.assign(row, args.data);
        return row;
      },
    },
    importDocument: { findMany: async () => [] },
    withdrawalDocument: { findMany: async () => [] },
    mptOrder: { deleteMany: async () => ({ count: 0 }) },
  };
}

function seedQueued(overrides: Partial<OrderRow> = {}) {
  const order: OrderRow = {
    id: "ord-1",
    tenantId: "ten-1",
    status: "QUEUED",
    gtin: "4601005000001",
    isPaid: true,
    productGroup: "autofluids",
    businessPlaceId: 36,
    externalOrderId: null,
    updatedAt: new Date(),
    lines: [{ gtin: "4601005000001", quantity: 1 }],
    ...overrides,
  };
  const outbox: OutboxRow = {
    id: "ob-send",
    aggregate: "send-order-to-mpt",
    status: "PENDING",
    payload: { orderId: order.id, tenantId: order.tenantId, quantity: 1 },
  };
  return { order, outbox };
}

function makePoller(
  state: { outbox: OutboxRow[]; orders: OrderRow[] },
  mpt: Partial<IMptAdapter>
) {
  const billing = { release: vi.fn().mockResolvedValue(undefined) };
  const vault = { ingest: vi.fn().mockResolvedValue(undefined) };
  const utilisation = { pollReports: vi.fn().mockResolvedValue(undefined) };
  const poller = new OutboxPoller(
    memPrisma(state) as never,
    billing as never,
    vault as never,
    utilisation as never,
    {} as never,
    {} as never,
    mpt as IMptAdapter
  );
  return { poller, billing, vault };
}

describe("P0 MPT safety (no STAGE)", () => {
  beforeEach(() => {
    process.env.MPT_ORDER_TIMEOUT_MS = "60000";
  });

  it("DEFAULT_MPT_ORDER_TIMEOUT_MS is ≥15 min (STAGE emission)", () => {
    expect(DEFAULT_MPT_ORDER_TIMEOUT_MS).toBeGreaterThanOrEqual(15 * 60 * 1000);
  });

  it("sendToMpt success → PROCESSED + persist STAGE orderId; uses order productGroup/businessPlaceId", async () => {
    const { order, outbox } = seedQueued();
    const state = { outbox: [outbox], orders: [order] };
    const createOrder = vi.fn().mockResolvedValue({
      status: "CREATED",
      requestId: "req-1",
      orderId: "stage-uuid-9",
    });
    const getOrder = vi.fn().mockResolvedValue({
      status: "PENDING",
      quantity: 0,
      found: true,
    });
    const { poller } = makePoller(state, { createOrder, getOrder });
    await poller.poll();
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder.mock.calls[0][0]).toMatchObject({
      orderId: "ord-1",
      productGroup: "autofluids",
      businessPlaceId: 36,
    });
    expect(outbox.status).toBe("PROCESSED");
    expect(order.status).toBe("SENT");
    expect(order.externalOrderId).toBe("stage-uuid-9");
    expect(getOrder).toHaveBeenCalledWith("stage-uuid-9");
  });

  it("sendToMpt permanent error → outbox FAILED, no SENT", async () => {
    const { order, outbox } = seedQueued();
    const state = { outbox: [outbox], orders: [order] };
    const createOrder = vi
      .fn()
      .mockRejectedValue(new MptPermanentError("bad", 400, "/api/orders"));
    const { poller } = makePoller(state, { createOrder, getOrder: vi.fn() });
    await poller.poll();
    expect(outbox.status).toBe("FAILED");
    expect(order.status).toBe("QUEUED");
    expect(state.outbox.some((r) => r.aggregate === "mpt-order-timeout")).toBe(
      true
    );
  });

  it("sendToMpt UNKNOWN_RESULT → not PENDING; next tick GET-only, no re-POST", async () => {
    const { order, outbox } = seedQueued();
    const state = { outbox: [outbox], orders: [order] };
    const createOrder = vi
      .fn()
      .mockRejectedValue(new MptUnknownResultError("timeout", "/api/orders"));
    const getOrder = vi.fn().mockResolvedValue({
      status: "CREATED",
      quantity: 0,
      found: false,
    });
    const { poller } = makePoller(state, { createOrder, getOrder });
    await poller.poll();
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(outbox.status).not.toBe("PENDING");
    expect(outbox.payload.unknownResult).toBe(true);
    expect(order.status).toBe("SENT");

    await poller.poll();
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(getOrder).toHaveBeenCalled();
  });

  it("reconcile: age>timeout while CREATED/PENDING → no RELEASE, stay SENT", async () => {
    process.env.MPT_ORDER_TIMEOUT_MS = "100";
    const { order, outbox } = seedQueued({
      status: "SENT",
      updatedAt: new Date(Date.now() - 5000),
    });
    outbox.status = "PROCESSED";
    const state = { outbox: [outbox], orders: [order] };
    const createOrder = vi.fn();
    const getOrder = vi.fn().mockResolvedValue({
      status: "PENDING",
      quantity: 0,
      found: true,
    });
    const { poller, billing } = makePoller(state, { createOrder, getOrder });
    await poller.poll();
    expect(order.status).toBe("SENT");
    expect(billing.release).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("reconcile: REJECTED → RELEASE even if not aged", async () => {
    const { order, outbox } = seedQueued({ status: "SENT" });
    outbox.status = "PROCESSED";
    const state = { outbox: [outbox], orders: [order] };
    const { poller, billing } = makePoller(state, {
      createOrder: vi.fn(),
      getOrder: vi.fn().mockResolvedValue({
        status: "REJECTED",
        quantity: 0,
        found: true,
      }),
    });
    await poller.poll();
    expect(order.status).toBe("REJECTED");
    expect(billing.release).toHaveBeenCalled();
  });

  it("reconcile: aged + STAGE id queried + order absent → FAILED + RELEASE", async () => {
    process.env.MPT_ORDER_TIMEOUT_MS = "100";
    const { order, outbox } = seedQueued({
      status: "SENT",
      externalOrderId: "stage-gone",
      updatedAt: new Date(Date.now() - 5000),
    });
    outbox.status = "PROCESSED";
    const state = { outbox: [outbox], orders: [order] };
    const getOrder = vi.fn().mockResolvedValue({
      status: "CREATED",
      quantity: 0,
      found: false,
    });
    const { poller, billing } = makePoller(state, {
      createOrder: vi.fn(),
      getOrder,
    });
    await poller.poll();
    expect(getOrder).toHaveBeenCalledWith("stage-gone");
    expect(order.status).toBe("FAILED");
    expect(billing.release).toHaveBeenCalled();
  });
});
