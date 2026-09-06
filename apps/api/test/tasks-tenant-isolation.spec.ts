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
  title: string;
  status: string;
};

// AT: tenant isolation for TASK minimal (outbox FAILED + UtilisationAlert → Task).
// Must fail across tenants — not on an earlier validation gate (PR #5 lesson).
describe("tasks tenant isolation (TASK minimal)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantA: string;
  let tenantB: string;
  let outboxA: string;
  let outboxB: string;
  let alertA: string;
  let tokenOf: (tid: string | null, roles?: string[]) => string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "task-iso-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.DEMO_ENABLED = "true";
    process.env.KMS_PROFILE = "file";
    process.env.KMS_FILE_DIR = join(dir, "keys");
    process.env.STORAGE_DIR = join(dir, "storage");
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
    const jwt = app.get(JwtService);
    tokenOf = (tid, roles = ["admin"]) =>
      jwt.sign({
        sub: "u-task-iso",
        tenantId: tid,
        roles,
        mfaCompleted: true,
      });

    const t1 = await prisma.tenant.create({
      data: { bin: "888000111444", name: "TaskTenantA", status: "ACTIVE" },
    });
    tenantA = t1.id;
    const t2 = await prisma.tenant.create({
      data: { bin: "888000111555", name: "TaskTenantB", status: "ACTIVE" },
    });
    tenantB = t2.id;

    const oa = await prisma.outbox.create({
      data: {
        aggregate: "mpt-order-timeout",
        status: "FAILED",
        payload: { tenantId: tenantA, orderId: "ord-a", reason: "timeout A" },
      },
    });
    outboxA = oa.id;
    const ob = await prisma.outbox.create({
      data: {
        aggregate: "mpt-order-timeout",
        status: "FAILED",
        payload: { tenantId: tenantB, orderId: "ord-b", reason: "timeout B" },
      },
    });
    outboxB = ob.id;

    const alert = await prisma.utilisationAlert.create({
      data: {
        tenantId: tenantA,
        orderId: "ord-a",
        daysLeft: 3,
        kind: "alert",
        status: "OPEN",
        firedAt: null,
      },
    });
    alertA = alert.id;
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("without JWT → 401 on list and create", async () => {
    await request(app.getHttpServer()).get("/tasks").expect(401);
    await request(app.getHttpServer()).post("/tasks").expect(401);
  });

  it("JWT without tenant (non-operator) → 401 at TenantGuard", async () => {
    const noTenant = tokenOf(null, ["admin"]);
    await request(app.getHttpServer())
      .get("/tasks")
      .set("Authorization", `Bearer ${noTenant}`)
      .expect(401);
    await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${noTenant}`)
      .expect(401);
  });

  it("operator JWT without tenant → 403 tenant required", async () => {
    const operator = tokenOf(null, ["operator"]);
    await request(app.getHttpServer())
      .get("/tasks")
      .set("Authorization", `Bearer ${operator}`)
      .expect(403);
    await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${operator}`)
      .expect(403);
  });

  it("tenant A list materializes own outbox FAILED + alert; never tenant B", async () => {
    const res = await request(app.getHttpServer())
      .get("/tasks")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(200);
    const items = res.body.items as TaskRow[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(2);
    expect(items.every((t) => t.tenantId === tenantA)).toBe(true);
    expect(items.some((t) => t.sourceRef === outboxA)).toBe(true);
    expect(items.some((t) => t.sourceRef === alertA)).toBe(true);
    expect(items.some((t) => t.sourceRef === outboxB)).toBe(false);
    expect(items.every((t) => t.status === "OPEN")).toBe(true);
  });

  it("tenant B list never includes tenant A tasks or sources", async () => {
    const res = await request(app.getHttpServer())
      .get("/tasks")
      .set("Authorization", `Bearer ${tokenOf(tenantB)}`)
      .expect(200);
    const items = res.body.items as TaskRow[];
    expect(items.length).toBe(1);
    expect(items[0].tenantId).toBe(tenantB);
    expect(items[0].sourceRef).toBe(outboxB);
    expect(
      items.some((t) => t.sourceRef === outboxA || t.sourceRef === alertA)
    ).toBe(false);
    expect(items.some((t) => t.tenantId === tenantA)).toBe(false);
  });

  it("POST /tasks is idempotent: same outbox/alert does not spawn duplicates", async () => {
    const first = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(201);
    const listed = await request(app.getHttpServer())
      .get("/tasks")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(200);
    expect(first.body.items.length).toBe(2);
    expect(second.body.items.length).toBe(2);
    expect(listed.body.items.length).toBe(2);
    const refs = (listed.body.items as TaskRow[])
      .map((t) => t.sourceRef)
      .sort();
    expect(refs).toEqual([alertA, outboxA].sort());
  });

  it("create under A does not leak: B still sees only own task", async () => {
    await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(201);
    const resB = await request(app.getHttpServer())
      .get("/tasks")
      .set("Authorization", `Bearer ${tokenOf(tenantB)}`)
      .expect(200);
    const items = resB.body.items as TaskRow[];
    expect(items.length).toBe(1);
    expect(items[0].tenantId).toBe(tenantB);
    expect(items[0].sourceRef).toBe(outboxB);
    expect(items.some((t) => t.tenantId === tenantA)).toBe(false);
  });

  it("HOME KPI openTasks is tenant-scoped and excludes codesNotApplied", async () => {
    await prisma.codeVault.create({
      data: {
        tenantId: tenantA,
        orderId: "ord-a",
        gtin: "04014835724401",
        mask: "04014835724401:00…01",
        status: "ACTIVE",
        ciphertext: "dGVzdA==",
      },
    });
    const sumA = await request(app.getHttpServer())
      .get("/dashboard/summary")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(200);
    const sumB = await request(app.getHttpServer())
      .get("/dashboard/summary")
      .set("Authorization", `Bearer ${tokenOf(tenantB)}`)
      .expect(200);
    expect(sumA.body.openTasks).toBe(2);
    expect(sumB.body.openTasks).toBe(1);
    expect(sumA.body.codesNotApplied).toBeGreaterThanOrEqual(1);
    expect(sumA.body.openTasks).not.toBe(sumA.body.codesNotApplied);
    expect(sumA.body.openTasks).not.toBe(sumB.body.openTasks);
  });
});
