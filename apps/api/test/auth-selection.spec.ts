import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma.service";
import { AuthService } from "../src/auth.service";
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./harness";

// W0-03a pt3 (ADR-027) — multi-membership legal-entity selection flow:
// login (>1 membership) → purpose-limited selection token →
// POST /auth/select-legal-entity → active-scope token. Replay/expired/foreign
// LE rejected; selection token cannot reach protected routes.

describe("auth: legal-entity selection flow", () => {
  let testDb: TestDb;
  let app: INestApplication;
  let prisma: PrismaService;
  const password = "sel-password";

  let tenantId = "";
  const leIds: string[] = [];
  let login = "";

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const t = await prisma.tenant.create({
      data: { bin: `sel-bin-${Date.now()}`, name: "Sel Tenant" },
    });
    tenantId = t.id;
    for (let i = 0; i < 2; i++) {
      const le = await prisma.legalEntity.create({
        data: {
          tenantId,
          bin: `sel-le-${i}-${Date.now()}`,
          name: `LE ${i}`,
        },
      });
      leIds.push(le.id);
    }
    login = `sel-u-${Date.now()}`;
    await prisma.user.create({
      data: {
        tenantId,
        login,
        passwordHash: AuthService.hashPassword(password),
        roles: JSON.stringify(["admin", "manager"]),
      },
    });
    for (const le of leIds) {
      await prisma.userLegalEntityMembership.create({
        data: { userId: (await userByLogin()).id, legalEntityId: le },
      });
    }
  });

  async function userByLogin() {
    return prisma.user.findUniqueOrThrow({ where: { login } });
  }

  afterAll(async () => {
    await app.close().catch(() => {});
    await teardownTestDatabase(testDb).catch(() => {});
  });

  function doLogin() {
    return request(app.getHttpServer())
      .post("/auth/login")
      .send({ login, password });
  }

  it("multi-membership login returns selectionRequired + purpose-limited token", async () => {
    const res = await doLogin().expect(200);
    expect(res.body.selectionRequired).toBe(true);
    expect(res.body.activeLegalEntityId).toBeNull();
    expect(res.body.roles).toEqual([]);
    // selection token cannot access protected routes
    await request(app.getHttpServer())
      .get("/orders")
      .set("Authorization", `Bearer ${res.body.token}`)
      .expect(403);
  });

  it("select-legal-entity issues active-scope token for own membership", async () => {
    const l = await doLogin().expect(200);
    const res = await request(app.getHttpServer())
      .post("/auth/select-legal-entity")
      .set("Authorization", `Bearer ${l.body.token}`)
      .send({ legalEntityId: leIds[1] })
      .expect(200);
    expect(res.body.activeLegalEntityId).toBe(leIds[1]);
    expect(res.body.roles).toEqual(["admin", "manager"]);
    // активный токен проходит защищённый маршрут
    await request(app.getHttpServer())
      .get("/orders")
      .set("Authorization", `Bearer ${res.body.token}`)
      .expect(200);
  });

  it("rejects foreign legal entity and replays the same selection token", async () => {
    const l = await doLogin().expect(200);
    await request(app.getHttpServer())
      .post("/auth/select-legal-entity")
      .set("Authorization", `Bearer ${l.body.token}`)
      .send({ legalEntityId: "le-of-another-tenant" })
      .expect(403);
    // atomic consumption: the token was already burned when the insert happened
    // before the membership check, so replaying the same token returns 401
    await request(app.getHttpServer())
      .post("/auth/select-legal-entity")
      .set("Authorization", `Bearer ${l.body.token}`)
      .send({ legalEntityId: leIds[0] })
      .expect(401);
  });

  it("expired/garbage selection tokens are rejected as unauthorized", async () => {
    await request(app.getHttpServer())
      .post("/auth/select-legal-entity")
      .set("Authorization", "Bearer not-a-jwt")
      .send({ legalEntityId: leIds[0] })
      .expect(401);
  });

  it("zero-membership user still gets 403 on login", async () => {
    const zLogin = `sel-zero-${Date.now()}`;
    await prisma.user.create({
      data: {
        tenantId,
        login: zLogin,
        passwordHash: AuthService.hashPassword(password),
        roles: JSON.stringify(["viewer"]),
      },
    });
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ login: zLogin, password })
      .expect(403);
    expect(res.body.message).toMatch(/membership/i);
  });
});
