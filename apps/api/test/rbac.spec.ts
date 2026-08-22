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

// T0-RBAC: @Roles-матрица (CONTEXT.md). 403 на каждый защищённый эндпоинт с чужой ролью.
describe("RBAC (T0-RBAC, ADR-020 апдейт)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let tokenOf: (roles: string[]) => string;
  let codeId: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "rbac-"));
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
      data: { bin: "777000111222", name: "РбакТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const jwt = app.get(JwtService);
    tokenOf = (roles: string[]) =>
      jwt.sign({
        sub: "u1",
        tenantId,
        roles,
        activeLegalEntityId: "le-" + tenantId,
        mfaCompleted: true,
      });
    // код для print/apply/export
    const kms = app.get(KMS_ADAPTER);
    const { ciphertext } = await kms.encrypt(
      Buffer.from(
        JSON.stringify({ serial: "0003001", ai91: null, ai92: null })
      ),
      {
        organizationId: tenantId,
        legalEntityId: tenantId,
        objectId: "rbac-code",
      }
    );
    const code = await prisma.codeVault.create({
      data: {
        tenantId,
        legalEntityId: "le-" + tenantId,
        orderId: "o-rbac",
        gtin: "04014835723399",
        mask: "04014835723399:00…01",
        status: "ACTIVE",
        ciphertext: ciphertext.toString("base64"),
      },
    });
    codeId = code.id;
    await prisma.order.create({
      data: {
        id: "o-rbac",
        number: 301,
        tenantId,
        status: "COMPLETED",
        idempotencyKey: "rbac-order",
      },
    });
    // account + tariff для billing/orders
    const acc = await prisma.account.create({
      data: { tenantId, balance: BigInt(1000000) },
    });
    await prisma.ledgerEntry.create({
      data: {
        tenantId,
        accountId: acc.id,
        kind: "TOPUP",
        amount: BigInt(1000000),
        reason: "seed",
      },
    });
    await prisma.tariff.create({
      data: {
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000),
        pricePerCodeKZT: BigInt(100),
      },
    });
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  function role(roles: string[]) {
    return { Authorization: `Bearer ${tokenOf(roles)}` };
  }

  it("403: viewer не может POST /orders; manager может (не 403)", async () => {
    await request(app.getHttpServer())
      .post("/orders")
      .set(role(["viewer"]))
      .send({
        cardId: "x",
        gtin: "04014835723399",
        places: 1,
        unitsPerPlace: 1,
      })
      .expect(403);
    // manager → роль прошла; падает на бизнес-логике (400/404/409), НО не 403
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set(role(["manager"]))
      .send({
        cardId: "x",
        gtin: "04014835723399",
        places: 1,
        unitsPerPlace: 1,
      });
    expect(res.status).not.toBe(403);
  });

  it("403: warehouse не может print/apply (доступ КМ); marking может", async () => {
    await request(app.getHttpServer())
      .post(`/labels/${codeId}/print`)
      .set(role(["warehouse"]))
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/codes/${codeId}/apply`)
      .set(role(["viewer"]))
      .send({ png: "x" })
      .expect(403);
    // marking → печать разрешена (ACTIVE)
    const res = await request(app.getHttpServer())
      .post(`/labels/${codeId}/print`)
      .set(role(["marking"]))
      .send({})
      .expect(200);
    expect(res.body.key).toBeTruthy();
  });

  it("403: accountant не может /import (нужен admin|manager|marking)", async () => {
    await request(app.getHttpServer())
      .post("/import")
      .set(role(["accountant"]))
      .send({
        orderId: "o-rbac",
        customsDeclaration: { date: "d", number: "n" },
      })
      .expect(403);
    const res = await request(app.getHttpServer())
      .post("/import")
      .set(role(["marking"]))
      .send({
        orderId: "o-rbac",
        customsDeclaration: { date: "d", number: "n-1" },
      })
      .expect(201);
    expect(res.body.status).toBe("ERROR"); // код не APPLIED — но роль прошла
  });

  it("403: viewer не может POST /withdrawal; marking может", async () => {
    await request(app.getHttpServer())
      .post("/withdrawal")
      .set(role(["viewer"]))
      .send({
        codes: [codeId],
        withdrawalType: "WRITE_OFF",
        withdrawalReason: "DEFECT",
      })
      .expect(403);
    await request(app.getHttpServer())
      .post("/withdrawal")
      .set(role(["marking"]))
      .send({
        codes: [codeId],
        withdrawalType: "WRITE_OFF",
        withdrawalReason: "DEFECT",
      })
      .expect(201);
  });

  it("403: manager не может /billing/payments/import (нужен admin|accountant)", async () => {
    await request(app.getHttpServer())
      .post("/billing/payments/import")
      .set(role(["manager"]))
      .send({ ref1c: "r1", amount: "100" })
      .expect(403);
    const res = await request(app.getHttpServer())
      .post("/billing/payments/import")
      .set(role(["accountant"]))
      .send({ ref1c: "r2", amount: "100" })
      .expect(201);
    expect(res.body.amount).toBe("100");
  });

  it("200: все клиентские роли читают GET /dashboard/summary и GET /orders", async () => {
    for (const r of ["admin", "manager", "accountant", "warehouse", "viewer"]) {
      await request(app.getHttpServer())
        .get("/dashboard/summary")
        .set(role([r]))
        .expect(200);
      await request(app.getHttpServer())
        .get("/orders")
        .set(role([r]))
        .expect(200);
    }
  });

  it("login возвращает roles[] для UI", async () => {
    const { AuthService } = await import("../src/auth.service");
    const u = await prisma.user.create({
      data: {
        login: "roles-check@demo",
        tenantId,
        passwordHash: AuthService.hashPassword("demo-password"),
        roles: JSON.stringify(["marking", "viewer"]),
      },
    });
    // ADR-027: без membership логин не выдаёт active scope (403)
    await prisma.userLegalEntityMembership.create({
      data: { userId: u.id, legalEntityId: "le-" + tenantId, scope: "member" },
    });
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ login: "roles-check@demo", password: "demo-password" })
      .expect(200);
    expect(res.body.roles).toEqual(["marking", "viewer"]);
    expect(res.body.token).toBeTruthy();
  });
});
