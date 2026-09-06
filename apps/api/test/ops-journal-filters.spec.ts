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
};

// AT OPS-02 / MAR-8: optional type+status on GET /documents|/operations.
// Seed Prisma only — no mutating ИС МПТ / STAGE HTTP.
describe("ops journal type/status filters", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let documents: DocumentService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let otherTenantId: string;
  let ids: {
    importSuccess: string;
    importError: string;
    withdrawalSuccess: string;
    utilisationProcess: string;
  };
  let tokenOf: (tid: string | null, roles?: string[]) => string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ops-flt-"));
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
        sub: "u-ops-flt",
        tenantId: tid,
        roles,
        mfaCompleted: true,
      });

    const t1 = await prisma.tenant.create({
      data: { bin: "888000333111", name: "OpsFilterA", status: "ACTIVE" },
    });
    tenantId = t1.id;
    const t2 = await prisma.tenant.create({
      data: { bin: "888000333222", name: "OpsFilterB", status: "ACTIVE" },
    });
    otherTenantId = t2.id;
    ids = await seedFilteredJournal(prisma, tenantId);
    await seedFilteredJournal(prisma, otherTenantId, "B");
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  function getJournal(path: string, query?: Record<string, string>) {
    const req = request(app.getHttpServer())
      .get(path)
      .set("Authorization", `Bearer ${tokenOf(tenantId)}`);
    return query ? req.query(query) : req;
  }

  it("omitted type/status returns the full tenant journal", async () => {
    const res = await getJournal("/documents").expect(200);
    const items = res.body.items as JournalRow[];
    expect(items).toHaveLength(4);
    expect(new Set(items.map((r) => r.id))).toEqual(
      new Set(Object.values(ids))
    );
  });

  it("GET /documents?type=IMPORT returns only import rows", async () => {
    const res = await getJournal("/documents", { type: "IMPORT" }).expect(200);
    const items = res.body.items as JournalRow[];
    expect(items.map((r) => r.id).sort()).toEqual(
      [ids.importSuccess, ids.importError].sort()
    );
    expect(items.every((r) => r.type === "IMPORT")).toBe(true);
    const ops = await getJournal("/operations", { type: "IMPORT" }).expect(200);
    expect((ops.body.items as JournalRow[]).map((r) => r.id).sort()).toEqual(
      items.map((r) => r.id).sort()
    );
  });

  it("GET /operations?status=SUCCESS matches GET /documents?status=SUCCESS", async () => {
    const docs = await getJournal("/documents", { status: "SUCCESS" }).expect(
      200
    );
    const ops = await getJournal("/operations", { status: "SUCCESS" }).expect(
      200
    );
    const docIds = (docs.body.items as JournalRow[]).map((r) => r.id).sort();
    const opsIds = (ops.body.items as JournalRow[]).map((r) => r.id).sort();
    expect(docIds).toEqual([ids.importSuccess, ids.withdrawalSuccess].sort());
    expect(opsIds).toEqual(docIds);
  });

  it("type+status intersection and empty match", async () => {
    const hit = await getJournal("/operations", {
      type: "IMPORT",
      status: "ERROR",
    }).expect(200);
    expect((hit.body.items as JournalRow[]).map((r) => r.id)).toEqual([
      ids.importError,
    ]);
    const miss = await getJournal("/documents", {
      type: "UTILISATION",
      status: "SUCCESS",
    }).expect(200);
    expect(miss.body.items).toEqual([]);
  });

  it("filter stays tenant-scoped", async () => {
    const res = await getJournal("/documents", { type: "IMPORT" }).expect(200);
    const items = res.body.items as JournalRow[];
    expect(items).toHaveLength(2);
    expect(items.every((r) => Object.values(ids).includes(r.id))).toBe(true);
  });

  it("invalid type or status → 400 with fieldErrors", async () => {
    const badType = await getJournal("/documents", { type: "SHIPMENT" }).expect(
      400
    );
    expect(badType.body.fieldErrors.type).toMatch(
      /IMPORT\|WITHDRAWAL\|UTILISATION/
    );
    const badStatus = await getJournal("/operations", {
      status: "DRAFT",
    }).expect(400);
    expect(badStatus.body.fieldErrors.status).toMatch(
      /EXPECTED\|SUBMITTED\|IN_PROCESS\|PARTIALLY_PROCESSED\|SUCCESS\|ERROR/
    );
  });

  it("DocumentService.list without tenant still throws", async () => {
    await expect(documents.list("")).rejects.toThrow(/tenant required/);
  });
});

async function seedFilteredJournal(
  prisma: PrismaService,
  tenantId: string,
  tag = "A"
): Promise<{
  importSuccess: string;
  importError: string;
  withdrawalSuccess: string;
  utilisationProcess: string;
}> {
  const importSuccess = await prisma.importDocument.create({
    data: {
      tenantId,
      orderId: `ord-${tag}-ok`,
      customsDate: "2026-08-01",
      customsNumber: `DT-${tag}-OK`,
      status: "SUCCESS",
    },
  });
  const importError = await prisma.importDocument.create({
    data: {
      tenantId,
      orderId: `ord-${tag}-err`,
      customsDate: "2026-08-02",
      customsNumber: `DT-${tag}-ERR`,
      status: "ERROR",
      rejectReason: "rejected",
    },
  });
  const withdrawalSuccess = await prisma.withdrawalDocument.create({
    data: {
      tenantId,
      codes: [`code-${tag}`],
      withdrawalType: "WITHDRAWAL",
      withdrawalReason: "DEFECT",
      status: "SUCCESS",
    },
  });
  const utilisationProcess = await prisma.utilisationReport.create({
    data: {
      tenantId,
      orderId: `ord-${tag}-ok`,
      idempotencyKey: `util-flt-${tag}`,
      reportId: `rpt-flt-${tag}`,
      status: "IN_PROCESS",
      sntins: [],
      releaseType: "IMPORT",
      expirationDate: "2027-01-01",
      productionDate: "2026-08-01",
      manufacturerCountry: "KZ",
      businessPlaceId: "1",
    },
  });
  return {
    importSuccess: importSuccess.id,
    importError: importError.id,
    withdrawalSuccess: withdrawalSuccess.id,
    utilisationProcess: utilisationProcess.id,
  };
}
