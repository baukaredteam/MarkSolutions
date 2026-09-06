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
import { DocumentService } from "../src/document.service";
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./harness";

type JournalRow = {
  id: string;
  type: string;
  status: string;
  rejectReason: string | null;
};

// AT: tenant isolation for OPS journal (import + withdrawal + utilisation).
// Seed Prisma directly — no mutating ИС МПТ / STAGE. Must fail across tenants,
// not on an earlier validation gate (PR #5 lesson).
describe("ops journal tenant isolation (import/withdrawal/utilisation)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let documents: DocumentService;
  let dir: string;
  let testDb: TestDb;
  let tenantA: string;
  let tenantB: string;
  let idsA: { import: string; withdrawal: string; utilisation: string };
  let idsB: { import: string; withdrawal: string; utilisation: string };
  let tokenOf: (tid: string | null, roles?: string[]) => string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ops-iso-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
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
    documents = app.get(DocumentService);
    const jwt = app.get(JwtService);
    tokenOf = (tid, roles = ["admin"]) =>
      jwt.sign({
        sub: "u-ops-iso",
        tenantId: tid,
        roles,
        mfaCompleted: true,
      });

    const t1 = await prisma.tenant.create({
      data: { bin: "888000222111", name: "OpsTenantA", status: "ACTIVE" },
    });
    tenantA = t1.id;
    const t2 = await prisma.tenant.create({
      data: { bin: "888000222222", name: "OpsTenantB", status: "ACTIVE" },
    });
    tenantB = t2.id;

    idsA = await seedJournal(prisma, tenantA, "A");
    idsB = await seedJournal(prisma, tenantB, "B");
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("without JWT → 401 on GET /documents and GET /operations", async () => {
    await request(app.getHttpServer()).get("/documents").expect(401);
    await request(app.getHttpServer()).get("/operations").expect(401);
  });

  it("JWT without tenant (non-operator) → 401 at TenantGuard", async () => {
    const noTenant = tokenOf(null, ["admin"]);
    await request(app.getHttpServer())
      .get("/documents")
      .set("Authorization", `Bearer ${noTenant}`)
      .expect(401);
    await request(app.getHttpServer())
      .get("/operations")
      .set("Authorization", `Bearer ${noTenant}`)
      .expect(401);
  });

  it("operator JWT without tenant → 403 tenant required", async () => {
    const operator = tokenOf(null, ["operator"]);
    await request(app.getHttpServer())
      .get("/documents")
      .set("Authorization", `Bearer ${operator}`)
      .expect(403);
    await request(app.getHttpServer())
      .get("/operations")
      .set("Authorization", `Bearer ${operator}`)
      .expect(403);
  });

  it("DocumentService.list without tenant throws", async () => {
    await expect(documents.list("")).rejects.toThrow(/tenant required/);
  });

  it("tenant A journal lists own import+withdrawal+utilisation; never tenant B", async () => {
    const docs = await request(app.getHttpServer())
      .get("/documents")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(200);
    const ops = await request(app.getHttpServer())
      .get("/operations")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(200);

    const items = docs.body.items as JournalRow[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(3);
    expect(new Set(items.map((r) => r.id))).toEqual(
      new Set([idsA.import, idsA.withdrawal, idsA.utilisation])
    );
    expect(new Set(items.map((r) => r.type))).toEqual(
      new Set(["IMPORT", "WITHDRAWAL", "UTILISATION"])
    );
    expect(items.some((r) => r.id === idsB.import)).toBe(false);
    expect(items.some((r) => r.id === idsB.withdrawal)).toBe(false);
    expect(items.some((r) => r.id === idsB.utilisation)).toBe(false);

    const opsItems = ops.body.items as JournalRow[];
    expect(opsItems.map((r) => r.id).sort()).toEqual(
      items.map((r) => r.id).sort()
    );
  });

  it("tenant B journal never includes tenant A import/withdrawal/utilisation", async () => {
    const res = await request(app.getHttpServer())
      .get("/operations")
      .set("Authorization", `Bearer ${tokenOf(tenantB)}`)
      .expect(200);
    const items = res.body.items as JournalRow[];
    expect(items.length).toBe(3);
    const ids = new Set(items.map((r) => r.id));
    expect(ids.has(idsB.import)).toBe(true);
    expect(ids.has(idsB.withdrawal)).toBe(true);
    expect(ids.has(idsB.utilisation)).toBe(true);
    expect(ids.has(idsA.import)).toBe(false);
    expect(ids.has(idsA.withdrawal)).toBe(false);
    expect(ids.has(idsA.utilisation)).toBe(false);
    expect(items.some((r) => r.id === idsA.import)).toBe(false);
  });

  it("GET /documents and GET /operations stay equal after B-only extra row", async () => {
    const extra = await prisma.importDocument.create({
      data: {
        tenantId: tenantB,
        orderId: "ord-b-extra",
        customsDate: "2026-08-20",
        customsNumber: "DT-B-EXTRA",
        status: "EXPECTED",
      },
    });
    const docsA = await request(app.getHttpServer())
      .get("/documents")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(200);
    const opsB = await request(app.getHttpServer())
      .get("/operations")
      .set("Authorization", `Bearer ${tokenOf(tenantB)}`)
      .expect(200);
    const aIds = (docsA.body.items as JournalRow[]).map((r) => r.id);
    const bIds = (opsB.body.items as JournalRow[]).map((r) => r.id);
    expect(aIds).toHaveLength(3);
    expect(aIds.includes(extra.id)).toBe(false);
    expect(bIds.includes(extra.id)).toBe(true);
    expect(bIds).toHaveLength(4);
    expect(bIds.some((id) => aIds.includes(id))).toBe(false);
  });
});

async function seedJournal(
  prisma: PrismaService,
  tenantId: string,
  tag: string
): Promise<{ import: string; withdrawal: string; utilisation: string }> {
  const imp = await prisma.importDocument.create({
    data: {
      tenantId,
      orderId: `ord-${tag}`,
      customsDate: "2026-08-01",
      customsNumber: `DT-${tag}-1`,
      status: "SUCCESS",
    },
  });
  const wd = await prisma.withdrawalDocument.create({
    data: {
      tenantId,
      codes: [`code-${tag}`],
      withdrawalType: "WITHDRAWAL",
      withdrawalReason: "DEFECT",
      status: "SUCCESS",
    },
  });
  const util = await prisma.utilisationReport.create({
    data: {
      tenantId,
      orderId: `ord-${tag}`,
      idempotencyKey: `util-iso-${tag}`,
      reportId: `rpt-iso-${tag}`,
      status: "SUCCESS",
      sntins: [],
      releaseType: "IMPORT",
      expirationDate: "2027-01-01",
      productionDate: "2026-08-01",
      manufacturerCountry: "KZ",
      businessPlaceId: "1",
    },
  });
  return { import: imp.id, withdrawal: wd.id, utilisation: util.id };
}
