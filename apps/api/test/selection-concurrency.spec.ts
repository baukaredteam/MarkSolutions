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

// W0-03a — atomic selection-token concurrency test.
// 20 concurrent selectLegalEntity calls with the SAME purpose-limited token.
// Assert exactly one active-scope JWT is issued; all others are 401 Unauthorized.
// This is a REAL database integration test — no source-text regex assertions.

describe("W0-03a selection token atomicity (concurrent)", () => {
  let testDb: TestDb;
  let app: INestApplication;
  let prisma: PrismaService;

  let tenantId = "";
  let leA = "";
  let leB = "";

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
      data: { bin: `conc-bin-${Date.now()}`, name: "Conc Tenant" },
    });
    tenantId = t.id;
    const le1 = await prisma.legalEntity.create({
      data: { tenantId, bin: `conc-leA-${Date.now()}`, name: "Conc LE A" },
    });
    const le2 = await prisma.legalEntity.create({
      data: { tenantId, bin: `conc-leB-${Date.now()}`, name: "Conc LE B" },
    });
    leA = le1.id;
    leB = le2.id;
  });

  afterAll(async () => {
    await app.close().catch(() => {});
    await teardownTestDatabase(testDb).catch(() => {});
  });

  /** Create a fresh user with memberships to BOTH legal entities. */
  async function createUserWithTwoMemberships(suffix: string) {
    const login = `conc-u-${suffix}-${Date.now()}`;
    const u = await prisma.user.create({
      data: {
        tenantId,
        login,
        passwordHash: AuthService.hashPassword("conc-password"),
        roles: JSON.stringify(["admin"]),
      },
    });
    await prisma.userLegalEntityMembership.create({
      data: { userId: u.id, legalEntityId: leA },
    });
    await prisma.userLegalEntityMembership.create({
      data: { userId: u.id, legalEntityId: leB },
    });
    return { login };
  }

  it("20 concurrent selects with same token → exactly 1 success, 19 × 401", async () => {
    // Fresh user — no shared JTI/rate-limit state with other tests
    const { login } = await createUserWithTwoMemberships("conc1");
    const password = "conc-password";

    // Step 1: login to get purpose-limited selection token
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ login, password })
      .expect(200);
    // Purpose token: selectionRequired=true, activeLegalEntityId=null, empty roles
    expect(loginRes.body.selectionRequired).toBe(true);
    expect(loginRes.body.activeLegalEntityId).toBeNull();
    expect(loginRes.body.roles).toEqual([]);
    const selToken = loginRes.body.token;
    expect(selToken).toBeTruthy();

    // Step 2: fire 20 concurrent selectLegalEntity requests with the SAME token
    const CONCURRENCY = 20;
    const promises = Array.from({ length: CONCURRENCY }, () =>
      request(app.getHttpServer())
        .post("/auth/select-legal-entity")
        .set("Authorization", `Bearer ${selToken}`)
        .send({ legalEntityId: leA })
    );
    const results = await Promise.all(promises);

    // Step 3: assert exactly 1×200, 19×401, no hidden 429/500
    const statuses = results.map((r) => r.status);
    const successes = statuses.filter((s) => s === 200);
    const unauthorized = statuses.filter((s) => s === 401);
    const unexpected = statuses.filter((s) => s !== 200 && s !== 401);

    expect(successes.length).toBe(1);
    expect(unauthorized.length).toBe(CONCURRENCY - 1);
    expect(unexpected.length).toBe(0);

    // The successful response must contain an active-scope JWT
    const winner = results.find((r) => r.status === 200)!;
    expect(winner.body.activeLegalEntityId).toBe(leA);
    expect(winner.body.token).toBeTruthy();

    // Verify only ONE UsedSelectionToken row exists in DB for this tenant
    const usedCount = await prisma.usedSelectionToken.count({
      where: { tenantId },
    });
    expect(usedCount).toBe(1);
  });

  it("selection token cannot be reused even sequentially", async () => {
    // Fresh user — isolated from the concurrent test's JTI/rate-limit state
    const { login } = await createUserWithTwoMemberships("seq2");
    const password = "conc-password";

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ login, password })
      .expect(200);
    expect(loginRes.body.selectionRequired).toBe(true);
    const selToken = loginRes.body.token;

    const first = await request(app.getHttpServer())
      .post("/auth/select-legal-entity")
      .set("Authorization", `Bearer ${selToken}`)
      .send({ legalEntityId: leA })
      .expect(200);
    expect(first.body.activeLegalEntityId).toBe(leA);

    // Sequential replay must fail
    await request(app.getHttpServer())
      .post("/auth/select-legal-entity")
      .set("Authorization", `Bearer ${selToken}`)
      .send({ legalEntityId: leB })
      .expect(401);
  });
});
