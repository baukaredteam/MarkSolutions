import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma.service";
import { TaskService } from "../src/task.service";
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./harness";

type TaskRow = {
  id: string;
  tenantId: string;
  source: string;
  sourceRef: string;
  status: string;
  createdAt: string;
  relatedHref: string;
};

// AT TASK-02 / MAR-12: optional source+status on GET /tasks.
// Seed Prisma only — no STAGE / ИС МПТ HTTP.
describe("tasks source/status filters (TASK-02)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tasks: TaskService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let otherTenantId: string;
  let ids: {
    outboxOpen: string;
    alertOpen: string;
    outboxDone: string;
  };
  let tokenOf: (tid: string | null, roles?: string[]) => string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "task-flt-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.DEMO_ENABLED = "true";
    process.env.KMS_PROFILE = "file";
    process.env.KMS_FILE_DIR = join(dir, "keys");
    process.env.STORAGE_DIR = join(dir, "storage");
    process.env.ADAPTERS_MPT = "mock";
    execSync(
      "npx prisma migrate deploy --schema packages/db/prisma/schema.prisma",
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: testDb.databaseUrl },
        stdio: "pipe",
      }
    );
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    tasks = app.get(TaskService);
    const jwt = app.get(JwtService);
    tokenOf = (tid, roles = ["admin"]) =>
      jwt.sign({
        sub: "u-task-flt",
        tenantId: tid,
        roles,
        mfaCompleted: true,
      });

    const t1 = await prisma.tenant.create({
      data: { bin: "888000222111", name: "TaskFilterA", status: "ACTIVE" },
    });
    tenantId = t1.id;
    const t2 = await prisma.tenant.create({
      data: { bin: "888000222222", name: "TaskFilterB", status: "ACTIVE" },
    });
    otherTenantId = t2.id;
    ids = await seedFilteredTasks(prisma, tenantId);
    await seedFilteredTasks(prisma, otherTenantId, "B");
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  function getTasks(query?: Record<string, string>) {
    const req = request(app.getHttpServer())
      .get("/tasks")
      .set("Authorization", `Bearer ${tokenOf(tenantId)}`);
    return query ? req.query(query) : req;
  }

  it("omitted source/status returns the full tenant queue", async () => {
    const res = await getTasks().expect(200);
    const items = res.body.items as TaskRow[];
    expect(items).toHaveLength(3);
    expect(new Set(items.map((t) => t.sourceRef))).toEqual(
      new Set(Object.values(ids))
    );
  });

  it("GET /tasks?source=OUTBOX_FAILED returns only outbox rows", async () => {
    const res = await getTasks({ source: "OUTBOX_FAILED" }).expect(200);
    const items = res.body.items as TaskRow[];
    expect(items.map((t) => t.sourceRef).sort()).toEqual(
      [ids.outboxOpen, ids.outboxDone].sort()
    );
    expect(items.every((t) => t.source === "OUTBOX_FAILED")).toBe(true);
  });

  it("GET /tasks?status=OPEN returns only open rows", async () => {
    const res = await getTasks({ status: "OPEN" }).expect(200);
    const items = res.body.items as TaskRow[];
    expect(items.map((t) => t.sourceRef).sort()).toEqual(
      [ids.outboxOpen, ids.alertOpen].sort()
    );
    expect(items.every((t) => t.status === "OPEN")).toBe(true);
  });

  it("source+status intersection and empty match", async () => {
    const hit = await getTasks({
      source: "UTILISATION_ALERT",
      status: "OPEN",
    }).expect(200);
    expect((hit.body.items as TaskRow[]).map((t) => t.sourceRef)).toEqual([
      ids.alertOpen,
    ]);
    const miss = await getTasks({
      source: "UTILISATION_ALERT",
      status: "DONE",
    }).expect(200);
    expect(miss.body.items).toEqual([]);
  });

  it("filter stays tenant-scoped", async () => {
    const res = await getTasks({ source: "OUTBOX_FAILED" }).expect(200);
    const items = res.body.items as TaskRow[];
    expect(items).toHaveLength(2);
    expect(items.every((t) => t.tenantId === tenantId)).toBe(true);
    expect(items.every((t) => Object.values(ids).includes(t.sourceRef))).toBe(
      true
    );
  });

  it("invalid source or status → 400 with fieldErrors", async () => {
    const badSource = await getTasks({ source: "SLA_ENGINE" }).expect(400);
    expect(badSource.body.fieldErrors.source).toMatch(
      /OUTBOX_FAILED\|UTILISATION_ALERT/
    );
    const badStatus = await getTasks({ status: "DRAFT" }).expect(400);
    expect(badStatus.body.fieldErrors.status).toMatch(/OPEN\|DONE/);
  });

  it("each row has createdAt and relatedHref for the source", async () => {
    const res = await getTasks().expect(200);
    const items = res.body.items as TaskRow[];
    expect(items).toHaveLength(3);
    expect(
      items.every((t) => typeof t.createdAt === "string" && t.createdAt.length)
    ).toBe(true);
    const outbox = items.find((t) => t.sourceRef === ids.outboxOpen);
    const alert = items.find((t) => t.sourceRef === ids.alertOpen);
    expect(outbox?.relatedHref).toBe("/orders");
    expect(alert?.relatedHref).toBe("/operations/utilisation");
  });

  it("TaskService.list without tenant still throws", async () => {
    await expect(tasks.list("")).rejects.toThrow(/tenant required/);
  });
});

async function seedFilteredTasks(
  prisma: PrismaService,
  tenantId: string,
  tag = "A"
): Promise<{
  outboxOpen: string;
  alertOpen: string;
  outboxDone: string;
}> {
  const outbox = await prisma.outbox.create({
    data: {
      aggregate: "mpt-order-timeout",
      status: "FAILED",
      payload: { tenantId, orderId: `ord-${tag}`, reason: `timeout ${tag}` },
    },
  });
  const alert = await prisma.utilisationAlert.create({
    data: {
      tenantId,
      orderId: `ord-${tag}`,
      daysLeft: 2,
      kind: "alert",
      status: "OPEN",
      firedAt: null,
    },
  });
  const done = await prisma.task.create({
    data: {
      tenantId,
      source: "OUTBOX_FAILED",
      sourceRef: `done-${tag}`,
      type: "ERROR",
      title: `Завершённая ошибка ${tag}`,
      status: "DONE",
      severity: "HIGH",
    },
  });
  return {
    outboxOpen: outbox.id,
    alertOpen: alert.id,
    outboxDone: done.sourceRef,
  };
}
