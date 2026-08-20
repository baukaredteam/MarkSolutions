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

describe("W5-07: invoices (счета, НДС, оплата)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "inv-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.KMS_PROFILE = "file";
    process.env.KMS_FILE_DIR = join(dir, "keys");
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
      data: { bin: "777000111222", name: "ИнвТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const account = await prisma.account.create({
      data: { tenantId, balance: BigInt(0) },
    });
    void account;
    await prisma.tariff.create({
      data: {
        productGroup: "motor-oils",
        pricePerCodeKZT: BigInt(4700), // 47,00 ₸ за КМ
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000),
        vatIncluded: true,
      },
    });
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

  it("create: счёт нумеруется последовательно (MF-2026-0001), суммы с/без НДС сходятся", async () => {
    const a = await request(app.getHttpServer())
      .post("/billing/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ productGroup: "motor-oils", quantity: 1000 })
      .expect(201);
    expect(a.body.number).toBe("MF-2026-0001");
    expect(a.body.sumWithVat).toBe((BigInt(4700) * BigInt(1000)).toString());
    // vat = 16/116 суммы; без+ндс = сумма
    const vat = BigInt(a.body.vat);
    const without = BigInt(a.body.sumWithoutVat);
    const withVat = BigInt(a.body.sumWithVat);
    expect(without + vat).toBe(withVat);
    expect(vat).toBeGreaterThan(BigInt(0));
    // последовательный номер
    const b = await request(app.getHttpServer())
      .post("/billing/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ productGroup: "motor-oils", quantity: 5 })
      .expect(201);
    expect(b.body.number).toBe("MF-2026-0002");
  });

  it("confirm: TOPUP(ref1c=номер) → баланс вырос ровно на итог; повторный идемпотентен", async () => {
    const inv = await request(app.getHttpServer())
      .post("/billing/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ productGroup: "motor-oils", quantity: 10 })
      .expect(201);
    const before = await request(app.getHttpServer())
      .get("/billing/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const res = await request(app.getHttpServer())
      .post(`/billing/invoices/${inv.body.id}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentRef: "PAY-INV-1" })
      .expect(200);
    expect(res.body.status).toBe("PAID");
    const after = await request(app.getHttpServer())
      .get("/billing/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const grew = BigInt(after.body.balance) - BigInt(before.body.balance);
    expect(grew).toBe(BigInt(inv.body.sumWithVat));
    // повторный confirm идемпотентен (не создаёт второй TOPUP)
    const again = await request(app.getHttpServer())
      .post(`/billing/invoices/${inv.body.id}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentRef: "PAY-INV-1" })
      .expect(200);
    expect(again.body.status).toBe("PAID");
    const topups = await prisma.ledgerEntry.count({
      where: { tenantId, kind: "TOPUP", ref1c: inv.body.number },
    });
    expect(topups).toBe(1);
  });

  it("Kaspi-вебхук идемпотентен: авто-PAID без дубля TOPUP", async () => {
    const inv = await request(app.getHttpServer())
      .post("/billing/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ productGroup: "motor-oils", quantity: 3 })
      .expect(201);
    const w1 = await request(app.getHttpServer())
      .post("/billing/providers/kaspi/webhook")
      .send({ invoiceId: inv.body.id, paymentRef: "KASPI-1" })
      .expect(200);
    expect(w1.body.status).toBe("PAID");
    const w2 = await request(app.getHttpServer())
      .post("/billing/providers/kaspi/webhook")
      .send({ invoiceId: inv.body.id, paymentRef: "KASPI-1" })
      .expect(200);
    expect(w2.body.status).toBe("PAID");
    const topups = await prisma.ledgerEntry.count({
      where: { tenantId, kind: "TOPUP", ref1c: inv.body.number },
    });
    expect(topups).toBe(1);
  });
});
