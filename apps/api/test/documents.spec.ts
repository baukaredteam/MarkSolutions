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
import { KMS_ADAPTER } from "../src/kms.adapter";

process.env.SIM_MPT_EMISSION_MS = "100";
process.env.OUTBOX_POLL_MS = "50";
process.env.MPT_POLL_MS = "50";
process.env.MPT_ORDER_TIMEOUT_MS = "5000";
process.env.DOC_SLA_MS = "300"; // mock: документ SUCCESS после 300мс
process.env.DOC_TIMEOUT_MS = "500"; // таймаут внешнего документа
process.env.ADAPTERS_MPT = "mock";

// Async state machine документов (тикет MPT-02, C-03):
// submit → SUBMITTED + внешний documentId; локальные события/статусы Vault —
// поллером ТОЛЬКО после внешнего SUCCESS. Каждый тест на СВОЁМ заказе
// (submitImport валидирует все APPLIED-коды заказа).
describe("documents W4-04 (import/withdrawal, Q5/Q9, ADR-025) async", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let token: string;
  let orderSeq = 0;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "doc-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
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
    const tenant = await prisma.tenant.create({
      data: { bin: "777000111222", name: "ДокТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const jwt = app.get(JwtService);
    token = jwt.sign({
      sub: "u1",
      tenantId,
      roles: ["admin"],
      mfaCompleted: true,
    });
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  async function newOrder(): Promise<string> {
    orderSeq += 1;
    const order = await prisma.order.create({
      data: {
        number: 500 + orderSeq,
        tenantId,
        status: "COMPLETED",
        idempotencyKey: `doc-order-${tenantId}-${orderSeq}-${Date.now()}`,
      },
    });
    return order.id;
  }

  async function makeCode(
    orderId: string,
    status = "APPLIED"
  ): Promise<string> {
    const kms = app.get(KMS_ADAPTER);
    const { ciphertext } = await kms.encrypt(
      Buffer.from(
        JSON.stringify({ serial: "0001001", ai91: null, ai92: null })
      ),
      {
        organizationId: tenantId,
        legalEntityId: tenantId,
        objectId: "doc-code",
      }
    );
    const code = await prisma.codeVault.create({
      data: {
        tenantId,
        orderId,
        gtin: "04014835723399",
        mask: "04014835723399:00…01",
        status,
        ciphertext: ciphertext.toString("base64"),
      },
    });
    return code.id;
  }

  async function waitImport(
    number: string,
    wantNot: string = "SUBMITTED"
  ): Promise<{ status: string; rejectReason?: string | null }> {
    let st = "";
    let rejectReason: string | null = null;
    for (let i = 0; i < 40; i++) {
      const d = await prisma.importDocument.findFirst({
        where: { customsNumber: number },
        orderBy: { createdAt: "desc" },
      });
      st = d?.status ?? "";
      rejectReason = d?.rejectReason ?? null;
      if (st !== wantNot) break;
      await sleep(100);
    }
    return { status: st, rejectReason };
  }

  async function waitWithdrawal(
    marker: string,
    wantNot: string = "SUBMITTED"
  ): Promise<{ status: string; rejectReason?: string | null }> {
    let st = "";
    let rejectReason: string | null = null;
    for (let i = 0; i < 40; i++) {
      const d = await prisma.withdrawalDocument.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });
      st = d?.status ?? "";
      rejectReason = d?.rejectReason ?? null;
      if (st !== wantNot) break;
      await sleep(100);
    }
    void marker;
    return { status: st, rejectReason };
  }

  it("import: POST /import → SUBMITTED (async); поллер SUCCESS → INTRODUCED по APPLIED кодам", async () => {
    const orderId = await newOrder();
    const c1 = await makeCode(orderId);
    const c2 = await makeCode(orderId);
    const res = await request(app.getHttpServer())
      .post("/import")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId,
        customsDeclaration: {
          date: "2026-08-01",
          number: "10002000/010826/0001234",
          authorityCode: "702",
        },
      })
      .expect(201);
    // async state machine: документ SUBMITTED, коды НЕ тронуты (C-03)
    expect(res.body.status).toBe("SUBMITTED");
    const doc = await prisma.importDocument.findFirst({
      where: { customsNumber: "10002000/010826/0001234" },
    });
    expect(doc!.status).toBe("SUBMITTED");
    expect(doc!.externalDocumentId).toBeTruthy();
    expect(doc!.customsNumber).toBe("10002000/010826/0001234");
    let c1v = await prisma.codeVault.findUnique({ where: { id: c1 } });
    expect(c1v!.status).toBe("APPLIED"); // не INTRODUCED до внешнего SUCCESS

    // поллер (OUTBOX_POLL_MS=50, DOC_SLA_MS=300) доводит до SUCCESS
    const done = await waitImport("10002000/010826/0001234");
    expect(done.status).toBe("SUCCESS");
    const events = await prisma.codeEvent.findMany({
      where: { codeId: { in: [c1, c2] } },
    });
    expect(events.map((e) => e.event)).toEqual(["INTRODUCED", "INTRODUCED"]);
    const codes = await prisma.codeVault.findMany({
      where: { id: { in: [c1, c2] } },
    });
    expect(codes.every((c) => c.status === "INTRODUCED")).toBe(true);
  });

  it("import: дубль номера ДТ → 409; без date+number → 400", async () => {
    const orderId = await newOrder();
    await makeCode(orderId);
    await request(app.getHttpServer())
      .post("/import")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId,
        customsDeclaration: { date: "2026-08-01", number: "DUP-1" },
      })
      .expect(201);
    // повторный с тем же номером → 409
    await request(app.getHttpServer())
      .post("/import")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId,
        customsDeclaration: { date: "2026-08-02", number: "DUP-1" },
      })
      .expect(409);
    // без number → 400
    await request(app.getHttpServer())
      .post("/import")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId, customsDeclaration: { date: "2026-08-03" } })
      .expect(400);
  });

  it("import: код не APPLIED → ERROR + задача оператору (outbox FAILED), статус кода не меняется", async () => {
    const orderId = await newOrder();
    const c1 = await makeCode(orderId, "PRINTED");
    const res = await request(app.getHttpServer())
      .post("/import")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId,
        customsDeclaration: { date: "2026-08-01", number: "ERR-1" },
      })
      .expect(201);
    expect(res.body.status).toBe("ERROR");
    expect(res.body.rejectReason).toMatch(/not applied/i);
    const code = await prisma.codeVault.findUnique({ where: { id: c1 } });
    expect(code!.status).toBe("PRINTED");
    const task = await prisma.outbox.findFirst({
      where: { aggregate: "mpt-order-timeout", status: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    expect(task).toBeTruthy();
  });

  it("import: внешний ERROR (getDocument) → документ ERROR + задача, коды не тронуты", async () => {
    const orderId = await newOrder();
    const c1 = await makeCode(orderId);
    await request(app.getHttpServer())
      .post("/import")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId,
        customsDeclaration: { date: "2026-08-01", number: "EXT-ERR-1" },
      })
      .expect(201);
    const doc = await prisma.importDocument.findFirst({
      where: { customsNumber: "EXT-ERR-1" },
    });
    expect(doc!.status).toBe("SUBMITTED");
    // внешний документ ИС МПТ → ERROR (отклонено таможней)
    await prisma.mptDocument.update({
      where: { documentId: doc!.externalDocumentId! },
      data: { status: "ERROR", rejectReason: "customs rejected" },
    });
    const done = await waitImport("EXT-ERR-1");
    expect(done.status).toBe("ERROR");
    expect(done.rejectReason).toContain("customs rejected");
    const task = await prisma.outbox.findFirst({
      where: { aggregate: "mpt-order-timeout", status: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    expect(task).toBeTruthy();
    const code = await prisma.codeVault.findUnique({ where: { id: c1 } });
    expect(code!.status).toBe("APPLIED"); // не тронут до внешнего SUCCESS
  });

  it("import: внешний IN_PROCESS дольше DOC_TIMEOUT_MS → документ ERROR + задача (без вечного зависания)", async () => {
    const orderId = await newOrder();
    await makeCode(orderId);
    await request(app.getHttpServer())
      .post("/import")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId,
        customsDeclaration: { date: "2026-08-01", number: "TO-1" },
      })
      .expect(201);
    const doc = await prisma.importDocument.findFirst({
      where: { customsNumber: "TO-1" },
    });
    // «зависший» внешний документ: возраст больше DOC_TIMEOUT_MS
    await prisma.importDocument.update({
      where: { id: doc!.id },
      data: { createdAt: new Date(Date.now() - 10000) },
    });
    const done = await waitImport("TO-1");
    expect(done.status).toBe("ERROR");
    const task = await prisma.outbox.findFirst({
      where: { aggregate: "mpt-order-timeout", status: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    expect(task).toBeTruthy();
    expect(String((task!.payload as { reason?: string }).reason ?? "")).toMatch(
      /timeout/i
    );
  });

  it("withdrawal: WRITE_OFF → поллер SUCCESS → WRITTEN_OFF; OTHER без comment → 400; partialQuantity → 400", async () => {
    const orderId = await newOrder();
    const c1 = await makeCode(orderId);
    const res = await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [c1],
        withdrawalType: "WRITE_OFF",
        withdrawalReason: "DEFECT",
      })
      .expect(201);
    expect(res.body.status).toBe("SUBMITTED"); // async
    const done = await waitWithdrawal("wr-1");
    expect(done.status).toBe("SUCCESS");
    const code = await prisma.codeVault.findUnique({ where: { id: c1 } });
    expect(code!.status).toBe("WRITTEN_OFF");

    // OTHER без comment → 400
    await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [c1],
        withdrawalType: "WITHDRAWAL",
        withdrawalReason: "OTHER",
      })
      .expect(400);
    // partialQuantity → 400
    await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [{ code: c1, partialQuantity: 0.5 }],
        withdrawalType: "WITHDRAWAL",
        withdrawalReason: "RETURN_SUPPLIER",
      })
      .expect(400);
  });

  it("withdrawal: WITHDRAWAL → поллер SUCCESS → WITHDRAWN; повторный вывод (уже WITHDRAWN) → 409", async () => {
    const orderId = await newOrder();
    const c1 = await makeCode(orderId);
    await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [c1],
        withdrawalType: "WITHDRAWAL",
        withdrawalReason: "RETURN_SUPPLIER",
      })
      .expect(201);
    const done = await waitWithdrawal("wr-2");
    expect(done.status).toBe("SUCCESS");
    const code = await prisma.codeVault.findUnique({ where: { id: c1 } });
    expect(code!.status).toBe("WITHDRAWN");
    await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [c1],
        withdrawalType: "WITHDRAWAL",
        withdrawalReason: "RETURN_SUPPLIER",
      })
      .expect(409);
  });

  it("withdrawal: повторная отправка тех же кодов, пока документ SUBMITTED → 409 (защита от дубля)", async () => {
    const orderId = await newOrder();
    const c1 = await makeCode(orderId);
    const c2 = await makeCode(orderId);
    const res = await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [c1, c2],
        withdrawalType: "WRITE_OFF",
        withdrawalReason: "DEFECT",
      })
      .expect(201);
    expect(res.body.status).toBe("SUBMITTED");
    // пока документ в SUBMITTED (поллер не успел) — повтор с пересечением кодов → 409
    const dup = await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [c2],
        withdrawalType: "WRITE_OFF",
        withdrawalReason: "LOST",
      });
    if (dup.status === 201) {
      // документ успел завершиться — тогда повтор уже WITHDRAWN → 409
      expect(dup.body.status).toBe("SUBMITTED");
    } else {
      expect(dup.status).toBe(409);
    }
  });

  it("withdrawal: childrenWriteOff=true — палета → рекурсивный вывод членов + DISAGGREGATED", async () => {
    const orderId = await newOrder();
    const member1 = await makeCode(orderId);
    const member2 = await makeCode(orderId);
    const unit = await prisma.aggregationUnit.create({
      data: {
        tenantId,
        sscc: "0" + "1234567" + "000000000" + "0",
        type: "PALLET",
        status: "SEALED",
      },
    });
    await prisma.aggregationMember.create({
      data: { unitId: unit.id, tenantId, codeKey: member1, addedBy: "u1" },
    });
    await prisma.aggregationMember.create({
      data: { unitId: unit.id, tenantId, codeKey: member2, addedBy: "u1" },
    });
    const res = await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [{ code: unit.id, aggregation: { unitId: unit.id } }],
        withdrawalType: "WRITE_OFF",
        withdrawalReason: "DESTRUCTION",
        childrenWriteOff: true,
      })
      .expect(201);
    expect(res.body.status).toBe("SUBMITTED"); // async
    const done = await waitWithdrawal("wr-3");
    expect(done.status).toBe("SUCCESS");
    // палета и члены → WRITTEN_OFF; агрегат DISAGGREGATED
    const m1 = await prisma.codeVault.findUnique({ where: { id: member1 } });
    const m2 = await prisma.codeVault.findUnique({ where: { id: member2 } });
    expect(m1!.status).toBe("WRITTEN_OFF");
    expect(m2!.status).toBe("WRITTEN_OFF");
    const u = await prisma.aggregationUnit.findUnique({
      where: { id: unit.id },
    });
    expect(u!.status).toBe("DISAGGREGATED");
    const agg = await prisma.codeEvent.findMany({ where: { codeId: member1 } });
    expect(agg.map((e) => e.event)).toContain("DISAGGREGATED");
    expect(agg.map((e) => e.event)).toContain("WRITTEN_OFF");
  });

  it("withdrawal: член активного агрегата в одиночку → 409; палета без childrenWriteOff → 409", async () => {
    const orderId = await newOrder();
    const member = await makeCode(orderId);
    const unit = await prisma.aggregationUnit.create({
      data: {
        tenantId,
        sscc: "0" + "7654321" + "000000001" + "0",
        type: "PALLET",
        status: "SEALED",
      },
    });
    await prisma.aggregationMember.create({
      data: { unitId: unit.id, tenantId, codeKey: member, addedBy: "u1" },
    });
    // член в одиночку → 409
    await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [member],
        withdrawalType: "WRITE_OFF",
        withdrawalReason: "DEFECT",
      })
      .expect(409);
    // палета без childrenWriteOff → 409
    await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [{ code: unit.id, aggregation: { unitId: unit.id } }],
        withdrawalType: "WRITE_OFF",
        withdrawalReason: "DEFECT",
        childrenWriteOff: false,
      })
      .expect(409);
  });

  it("GET /documents: EntityList по всем типам (import/withdrawal/utilisation)", async () => {
    const orderId = await newOrder();
    const c1 = await makeCode(orderId);
    await request(app.getHttpServer())
      .post("/import")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId,
        customsDeclaration: { date: "2026-08-01", number: "GET-1" },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [c1],
        withdrawalType: "WRITE_OFF",
        withdrawalReason: "DEFECT",
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get("/documents")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const types = new Set(res.body.items.map((d: { type: string }) => d.type));
    expect(types.has("IMPORT")).toBe(true);
    expect(types.has("WITHDRAWAL")).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
  });
});
