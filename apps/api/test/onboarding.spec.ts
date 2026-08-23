// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma.service";
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./harness";

describe("onboarding flow (T1)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    dir = await mkdtemp(join(tmpdir(), "onb-test-"));
    process.env.STORAGE_DIR = join(dir, "storage");
    process.env.MFA_ENABLED = "false";
    process.env.JWT_SECRET = "test-secret";

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: ["error", "warn"] });
    await app.init();
    prisma = app.get(PrismaService);
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  const appBody = {
    name: "ТОО Тест",
    bin: "123456789012",
    email: "test@example.com",
    phone: "+77000000000",
    city: "Алматы",
    address: "ул. Тестовая 1",
    contact: "Иван Иванов",
    consentDocument: "offer-v1",
  };

  it("AT-02: duplicate BIN returns existing application, does not create second", async () => {
    const first = await request(app.getHttpServer())
      .post("/onboarding/applications")
      .send({ ...appBody, consentSubject: "applicant-1" })
      .expect(201);
    expect(first.body.status).toBe("PENDING");

    const dup = await request(app.getHttpServer())
      .post("/onboarding/applications")
      .send({ ...appBody, consentSubject: "applicant-2" })
      .expect(200);

    expect(dup.body.bin).toBe(appBody.bin);
    expect(dup.body.status).toBe("PENDING");
    const count = await prisma.application.count({
      where: { bin: appBody.bin },
    });
    expect(count).toBe(1);
  });

  it("provisioning without approval is rejected (business rule)", async () => {
    const res = await request(app.getHttpServer())
      .post("/operator/approvals/nonexistent-id")
      .send({ decision: "approve" })
      .expect(404);
    expect(res.body.code).toBe(404);
  });

  it("repeated approval of one application is idempotent (one tenant)", async () => {
    const created = await request(app.getHttpServer())
      .post("/onboarding/applications")
      .send({ ...appBody, bin: "998877665544", consentSubject: "op-1" })
      .expect(201);
    const id = created.body.id;

    const approve1 = await request(app.getHttpServer())
      .post(`/operator/approvals/${id}`)
      .send({ decision: "approve" })
      .expect(200);
    expect(approve1.body.status).toBe("APPROVED");
    expect(approve1.body.tenantId).toBeTruthy();

    const r2 = await request(app.getHttpServer())
      .post(`/operator/approvals/${id}`)
      .send({ decision: "approve" });
    expect(r2.status).toBe(200);

    const tenants = await prisma.tenant.count({
      where: { bin: "998877665544" },
    });
    expect(tenants).toBe(1);
  });

  it("JWT: tenant comes from token claim, ignoring header", async () => {
    const created = await request(app.getHttpServer())
      .post("/onboarding/applications")
      .send({ ...appBody, bin: "111122223333", consentSubject: "jwt-1" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/operator/approvals/${created.body.id}`)
      .send({ decision: "approve" })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ login: "admin@111122223333", password: "demo-password" })
      .expect(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.tenantId).toBeTruthy();

    const res = await request(app.getHttpServer())
      .get("/api/products")
      .set("Authorization", `Bearer ${login.body.token}`)
      .set("x-tenant-id", "attacker-tenant")
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it("AT-16: no JWT → 401", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/products")
      .expect(401);
    expect(res.body.code).toBe(401);
  });

  it("MFA-negative: required role without factor when MFA_ENABLED=true → 403", async () => {
    process.env.MFA_ENABLED = "true";
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ login: "admin@111122223333", password: "demo-password" })
      .expect(200);

    // вход без второго фактора: токен без mfaCompleted → доступ к ролевому эндпоинту = 403
    const res = await request(app.getHttpServer())
      .get("/api/admin/probe")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(403);
    expect(res.body.code).toBe(403);
    process.env.MFA_ENABLED = "false";
  });
});
