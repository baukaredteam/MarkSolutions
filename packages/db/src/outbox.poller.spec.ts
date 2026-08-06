import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { OutboxPoller } from "./outbox.poller";

describe("OutboxPoller", () => {
  let dir: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "outbox-test-"));
    const dbPath = join(dir, "outbox.db");
    const adapter = new PrismaLibSQL({ url: `file:${dbPath}` });
    prisma = new PrismaClient({ adapter });
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Outbox" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "version" INTEGER NOT NULL DEFAULT 0,
        "aggregate" TEXT NOT NULL,
        "payload" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "processedAt" DATETIME
      )
    `);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await sleep(300);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
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
});
