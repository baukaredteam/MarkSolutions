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
import { KMS_ADAPTER } from "../src/kms.adapter";

process.env.SIM_MPT_EMISSION_MS = "100";
process.env.OUTBOX_POLL_MS = "50";
process.env.MPT_POLL_MS = "50";
process.env.MPT_ORDER_TIMEOUT_MS = "5000";

// UI-03: POST /codes/lookup — tenant-scoped поиск КМ; IDOR → 404.
describe("code lookup (UI-03)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let tenantId: string;
  let otherTenantId: string;
  let tokenOf: (tenantId: string) => string;
  let codeId: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "lkp-"));
    const dbPath = join(dir, "test.db");
    process.env.DATABASE_URL = `file:${dbPath}`;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.KMS_PROFILE = "file";
    process.env.KMS_FILE_DIR = join(dir, "keys");
    process.env.STORAGE_DIR = join(dir, "storage");
    execSync(
      "npx prisma migrate deploy --schema packages/db/prisma/schema.prisma",
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
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
    tokenOf = (tid: string) =>
      jwt.sign({
        sub: "u1",
        tenantId: tid,
        roles: ["admin"],
        mfaCompleted: true,
      });

    const t1 = await prisma.tenant.create({
      data: { bin: "777000111222", name: "ЛукТен", status: "ACTIVE" },
    });
    tenantId = t1.id;
    const t2 = await prisma.tenant.create({
      data: { bin: "777000111333", name: "Чужой", status: "ACTIVE" },
    });
    otherTenantId = t2.id;

    const kms = app.get(KMS_ADAPTER);
    const { ciphertext } = await kms.encrypt(
      Buffer.from(JSON.stringify({ serial: "7771234", ai91: null, ai92: null }))
    );
    const code = await prisma.codeVault.create({
      data: {
        tenantId,
        orderId: "o-lkp",
        gtin: "04014835723399",
        mask: "04014835723399:77…34",
        status: "PRINTED",
        ciphertext: ciphertext.toString("base64"),
      },
    });
    codeId = code.id;
    // история: PRINTED + APPLIED
    await prisma.codeEvent.create({
      data: {
        tenantId,
        codeId: code.id,
        event: "PRINTED",
        at: new Date(),
        actor: "u1",
      },
    });
    await prisma.codeEvent.create({
      data: {
        tenantId,
        codeId: code.id,
        event: "APPLIED",
        at: new Date(),
        actor: "u1",
      },
    });
    // productName: карточка
    const card = await prisma.productCard.create({
      data: {
        tenantId,
        gtin: "04014835723399",
        status: "REGISTERED",
        attributes: { name: "Масло моторное MarkOil 5W-30" },
      },
    });
    await prisma.codeVault.update({
      where: { id: code.id },
      data: { cardId: card.id },
    });
  }, 30000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("lookup по codeKey: найден → codeKey/gtin/serialMask/status/productName/history", async () => {
    const res = await request(app.getHttpServer())
      .post("/codes/lookup")
      .set("Authorization", `Bearer ${tokenOf(tenantId)}`)
      .send({ code: codeId })
      .expect(200);
    expect(res.body.codeKey).toBe(codeId);
    expect(res.body.gtin).toBe("04014835723399");
    expect(res.body.serialMask).toContain("…");
    expect(res.body.status).toBe("PRINTED");
    expect(res.body.productName).toContain("MarkOil");
    const events = res.body.history.map((e: { event: string }) => e.event);
    expect(events).toEqual(["PRINTED", "APPLIED"]);
  });

  it("lookup по raw-КМ (01+gtin+21+serial): распарсить и найти", async () => {
    const raw = `0104014835723399217771234`;
    const res = await request(app.getHttpServer())
      .post("/codes/lookup")
      .set("Authorization", `Bearer ${tokenOf(tenantId)}`)
      .send({ code: raw })
      .expect(200);
    expect(res.body.codeKey).toBe(codeId);
    expect(res.body.serialMask).toContain("…");
  });

  it("ФИКС 2: raw-КМ с gtin, содержащим '21' внутри — позиционный парсинг находит", async () => {
    // gtin 04210197500019 (валидный mod10) содержит "21" в позиции 3-4
    const kms = app.get(KMS_ADAPTER);
    const { ciphertext } = await kms.encrypt(
      Buffer.from(JSON.stringify({ serial: "5550001", ai91: null, ai92: null }))
    );
    const code = await prisma.codeVault.create({
      data: {
        tenantId,
        orderId: "o-lkp2",
        gtin: "04210197500019",
        mask: "04210197500019:55…01",
        status: "ACTIVE",
        ciphertext: ciphertext.toString("base64"),
      },
    });
    const raw = `0104210197500019215550001`;
    const res = await request(app.getHttpServer())
      .post("/codes/lookup")
      .set("Authorization", `Bearer ${tokenOf(tenantId)}`)
      .send({ code: raw })
      .expect(200);
    expect(res.body.codeKey).toBe(code.id);
    expect(res.body.gtin).toBe("04210197500019");
    expect(res.body.serialMask).toContain("…");
  });

  it("lookup по 14-цифровому GTIN: вернуть первый код товара", async () => {
    const res = await request(app.getHttpServer())
      .post("/codes/lookup")
      .set("Authorization", `Bearer ${tokenOf(tenantId)}`)
      .send({ code: "04014835723399" })
      .expect(200);
    expect(res.body.gtin).toBe("04014835723399");
  });

  it("не найден → 404", async () => {
    await request(app.getHttpServer())
      .post("/codes/lookup")
      .set("Authorization", `Bearer ${tokenOf(tenantId)}`)
      .send({ code: "nonexistent-key" })
      .expect(404);
  });

  it("IDOR: чужой tenant → 404 (не 403)", async () => {
    await request(app.getHttpServer())
      .post("/codes/lookup")
      .set("Authorization", `Bearer ${tokenOf(otherTenantId)}`)
      .send({ code: codeId })
      .expect(404);
  });
});
