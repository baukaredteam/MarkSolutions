import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setTimeout as sleep } from "node:timers/promises";
import { OutboxPoller } from "./outbox.poller";
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./test-harness";

describe("OutboxPoller", () => {
  let prisma: PrismaClient;
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    prisma = new PrismaClient();
    // baseline migration already created the Outbox table via harness
  }, 120000);

  afterAll(async () => {
    await prisma.$disconnect();
    await sleep(300);
    await teardownTestDatabase(testDb);
  });

  it("processes pending outbox records in-process", async () => {
    const handled: unknown[] = [];
    const poller = new OutboxPoller(prisma, async (payload) => {
      handled.push(payload);
    });
    await prisma.outbox.create({
      data: {
        aggregate: "tenant",
        payload: { event: "provisioned", tenantId: "t1" },
      },
    });

    await poller.runOnce();

    expect(handled).toHaveLength(1);
    const done = await prisma.outbox.findMany();
    expect(done[0].status).toBe("PROCESSED");
  });

  it("exactly-once: concurrent pollers process each record once", async () => {
    let calls = 0;
    const makePoller = () =>
      new OutboxPoller(prisma, async () => {
        calls++;
      });
    await prisma.outbox.create({
      data: {
        aggregate: "tenant",
        payload: { event: "provisioned", tenantId: "t2" },
      },
    });

    // two pollers race for the same record
    await Promise.all([makePoller().runOnce(), makePoller().runOnce()]);

    expect(calls).toBe(1);
    const rec = await prisma.outbox.findFirst({
      where: { payload: { equals: { event: "provisioned", tenantId: "t2" } } },
    });
    expect(rec?.status).toBe("PROCESSED");
  });

  it("marks FAILED when handler throws", async () => {
    const poller = new OutboxPoller(prisma, async () => {
      throw new Error("boom");
    });
    await prisma.outbox.create({
      data: { aggregate: "tenant", payload: { event: "x" } },
    });

    await poller.runOnce();

    const rec = await prisma.outbox.findFirst({
      where: { payload: { equals: { event: "x" } } },
    });
    expect(rec?.status).toBe("FAILED");
  });
});
