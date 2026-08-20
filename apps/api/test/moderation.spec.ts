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

// быстрая SLA НКТ для тестов (по умолчанию 3 сек)
process.env.NKT_SLA_MS = "300";
process.env.NKT_TIMEOUT_MS = "2000";
process.env.OUTBOX_POLL_MS = "100";

const fullAttrs = (gtin: string) => ({
  schemaVersion: 1,
  gtin,
  name: "RAVENOL 5W-30",
  brand: "RAVENOL",
  countryOfBrand: "Германия",
  composition: "синтетическое",
  shelfLifeMonths: 60,
  productType: "моторное масло",
  volumeL: 4,
  purpose: "легковые",
  sae: "5W-30",
  storage: "сухое",
  conformityMark: "нет",
  eacMarks: "нет",
  grossWeightKg: 3.8,
  tnved: "2710198200",
  group: "Смазочные материалы",
  category: "Моторные масла",
  packageType: "Единица товара",
  kpved: "19.20.29",
  gpc: "10005267",
  ownerGcp: "0401483",
  ownerName: "ТОО Автодеталь",
  ownerCountry: "Казахстан",
  ownerAddress: "г. Шымкент",
  platformName: "1ecom",
  platformCountry: "Казахстан",
  platformAddress: "г. Алматы",
  participantTaxNumber: "123456789012",
  participantName: "ТОО Автодеталь",
  participantCountry: "Казахстан",
  participantAddress: "г. Шымкент",
});

describe("catalog moderation (T3, CAT-013)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let token: string;
  let operatorToken: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "mod-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.DEMO_ENABLED = "true";
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
      data: { bin: "777000111222", name: "МодТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const jwt = app.get(JwtService);
    token = jwt.sign({
      sub: "u1",
      tenantId,
      roles: ["admin"],
      mfaCompleted: true,
    });
    operatorToken = jwt.sign({
      sub: "operator-seeded",
      tenantId: null,
      roles: ["operator"],
      mfaCompleted: true,
    });
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  // уникальный tenant + gtin + brand на карточку (изоляция от partial unique и fuzzy-дублей)
  async function createCard(
    gtin: string,
    extra: Record<string, unknown> = {}
  ): Promise<{ cardId: string; token: string; tenantId: string }> {
    const tenant = await prisma.tenant.create({
      data: {
        bin: `777${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
        name: "МодТен",
        status: "ACTIVE",
      },
    });
    const jwt = app.get(JwtService);
    const tenantToken = jwt.sign({
      sub: `u-${tenant.id}`,
      tenantId: tenant.id,
      roles: ["admin"],
      mfaCompleted: true,
    });
    const brand = `RAVENOL${tenant.id.slice(-4)}`;
    const res = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({
        gtin,
        attributes: { ...fullAttrs(gtin), brand, ...extra },
      })
      .expect(201);
    return { cardId: res.body.id, token: tenantToken, tenantId: tenant.id };
  }

  it("AT-03: submit с ошибкой яруса A → Needs Correction с fieldErrors, не In Review; после исправления → Submitted", async () => {
    // карточка с пустым tier A (только имя) — создаём напрямую через prisma
    const card = await prisma.productCard.create({
      data: {
        tenantId,
        gtin: "04014835723399",
        status: "DRAFT",
        attributes: { schemaVersion: 1, name: "Только имя" },
      },
    });
    const res = await request(app.getHttpServer())
      .post(`/products/cards/${card.id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.status).toBe("NEEDS_CORRECTION");
    expect(res.body.fieldErrors.sae).toBeTruthy();
    const updated = await prisma.productCard.findUnique({
      where: { id: card.id },
    });
    expect(updated!.status).toBe("NEEDS_CORRECTION");

    // исправляем атрибуты (полный ярус A) → повторная отправка проходит
    await prisma.productCard.update({
      where: { id: card.id },
      data: { attributes: fullAttrs("04014835723399") },
    });
    const resub = await request(app.getHttpServer())
      .post(`/products/cards/${card.id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(resub.body.status).toBe("SUBMITTED");
  });

  it("полный путь: Draft → Validating → Submitted → In Review → Approved → Registering → Registered (RAVENOL)", async () => {
    const gtin = "04014835723399"; // seed VERIFIED RAVENOL
    const { cardId, token: tenantTok } = await createCard(gtin);

    // tenant: submit → Validating → Submitted
    const sub = await request(app.getHttpServer())
      .post(`/products/cards/${cardId}/submit`)
      .set("Authorization", `Bearer ${tenantTok}`)
      .expect(200);
    expect(sub.body.status).toBe("SUBMITTED");

    // очередь модерации видит карточку
    const queue = await request(app.getHttpServer())
      .get("/moderation/queue")
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(200);
    expect(queue.body.items.some((i: { id: string }) => i.id === cardId)).toBe(
      true
    );

    // оператор approve → Approved; повторный approve идемпотентен (без дубля регистрации)
    const apr = await request(app.getHttpServer())
      .post(`/moderation/${cardId}/approve`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(200);
    expect(apr.body.status).toBe("APPROVED");
    await request(app.getHttpServer())
      .post(`/moderation/${cardId}/approve`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(200);
    await sleep(300);
    const nktRows = (
      await prisma.outbox.findMany({ where: { aggregate: "nkt-register" } })
    ).filter((r) => (r.payload as { cardId: string }).cardId === cardId);
    expect(nktRows).toHaveLength(1); // идемпотентность: одна регистрация

    // аудит переходов {author, at, from, to, comment} без «прыжков»
    await sleep(200);
    const card = await prisma.productCard.findUnique({ where: { id: cardId } });
    const audit = card!.audit as {
      author: string;
      at: string;
      from: string;
      to: string;
      comment?: string;
    }[];
    for (const e of audit) {
      expect(e.author).toBeTruthy();
      expect(e.at).toBeTruthy();
      expect(e.from).toBeTruthy();
      expect(e.to).toBeTruthy();
    }
    const path = audit.map((e) => `${e.from}->${e.to}`);
    expect(path).toContain("DRAFT->VALIDATING");
    expect(path).toContain("VALIDATING->SUBMITTED");
    expect(path).toContain("SUBMITTED->IN_REVIEW");
    expect(path).toContain("IN_REVIEW->APPROVED");

    // OutboxPoller: Registering → Registered (SLA 300ms)
    let status = "";
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      const c = await prisma.productCard.findUnique({ where: { id: cardId } });
      status = c!.status;
      if (status === "REGISTERED") break;
    }
    expect(status).toBe("REGISTERED");
    const reg = await prisma.productCard.findUnique({ where: { id: cardId } });
    expect(reg!.ntin).toBeTruthy(); // НТИН привязан к версии карточки (AT-04)
    expect(reg!.version).toBe(0);
  });

  it("AT-04: GTIN/НТИН привязаны к версии карточки", async () => {
    const gtin = "04014835723399";
    const { cardId, token: tenantTok } = await createCard(gtin);
    // bump version на карточке как "новая версия"
    await prisma.productCard.update({
      where: { id: cardId },
      data: { version: { increment: 1 } },
    });
    const before = await prisma.productCard.findUnique({
      where: { id: cardId },
    });
    expect(before!.version).toBe(1);
    expect(before!.gtin).toBe(gtin);
    expect(before!.ntin).toBeNull();

    await request(app.getHttpServer())
      .post(`/products/cards/${cardId}/submit`)
      .set("Authorization", `Bearer ${tenantTok}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/moderation/${cardId}/approve`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(200);

    let status = "";
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      const c = await prisma.productCard.findUnique({ where: { id: cardId } });
      status = c!.status;
      if (status === "REGISTERED") break;
    }
    expect(status).toBe("REGISTERED");
    const reg = await prisma.productCard.findUnique({ where: { id: cardId } });
    expect(reg!.ntin).toBeTruthy();
    // GTIN и НТИН хранятся на карточке текущей версии
    expect(reg!.version).toBe(1);
    expect(reg!.gtin).toBe(gtin);
    expect(reg!.ntin).toContain(gtin);
  });

  it("reject требует fieldReasons; карточка → Needs Correction; повторная отправка без исправления → 400", async () => {
    const { cardId, token: tenantTok } = await createCard("04014835723399");
    await request(app.getHttpServer())
      .post(`/products/cards/${cardId}/submit`)
      .set("Authorization", `Bearer ${tenantTok}`)
      .expect(200);

    // reject без fieldReasons → 400
    await request(app.getHttpServer())
      .post(`/moderation/${cardId}/reject`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ fieldReasons: {} })
      .expect(400);

    // reject с причиной → Needs Correction
    const rej = await request(app.getHttpServer())
      .post(`/moderation/${cardId}/reject`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ fieldReasons: { brand: "бренд не подтверждён" } })
      .expect(200);
    expect(rej.body.status).toBe("NEEDS_CORRECTION");

    // повторная отправка без исправления поля brand → 400
    await request(app.getHttpServer())
      .post(`/products/cards/${cardId}/submit`)
      .set("Authorization", `Bearer ${tenantTok}`)
      .expect(400);

    // исправляем brand → повторная отправка проходит
    await prisma.productCard.update({
      where: { id: cardId },
      data: {
        attributes: { ...fullAttrs("04014835723399"), brand: "CASTROL" },
      },
    });
    const resub = await request(app.getHttpServer())
      .post(`/products/cards/${cardId}/submit`)
      .set("Authorization", `Bearer ${tenantTok}`)
      .expect(200);
    expect(resub.body.status).toBe("SUBMITTED");
  });

  it("GtinResolver: невалидный mod10 GTIN → submit не проходит (REJECTED)", async () => {
    const { cardId, token: tenantTok } = await createCard("04014835723398", {});
    const res = await request(app.getHttpServer())
      .post(`/products/cards/${cardId}/submit`)
      .set("Authorization", `Bearer ${tenantTok}`)
      .expect(200);
    expect(res.body.status).toBe("NEEDS_CORRECTION");
    expect(res.body.fieldErrors.gtin).toBeTruthy();
  });

  it("NKT отказ (Registration Failed) → карточка в Needs Correction с field-level ошибками", async () => {
    const { cardId, token: tenantTok } = await createCard("04014835723399", {
      nktResult: "reject",
    });
    await request(app.getHttpServer())
      .post(`/products/cards/${cardId}/submit`)
      .set("Authorization", `Bearer ${tenantTok}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/moderation/${cardId}/approve`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(200);

    let status = "";
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      const c = await prisma.productCard.findUnique({ where: { id: cardId } });
      status = c!.status;
      if (status === "NEEDS_CORRECTION") break;
    }
    expect(status).toBe("NEEDS_CORRECTION");
    const card = await prisma.productCard.findUnique({ where: { id: cardId } });
    const reasons = card!.fieldReasons as Record<string, string>;
    expect(reasons.brand).toBeTruthy(); // field-level ошибка от НКТ
  });

  it("оператор не имеет доступа к tenant-данным (кроме модерации)", async () => {
    await request(app.getHttpServer())
      .get("/products/drafts")
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ gtin: "04014835723399", attributes: fullAttrs("04014835723399") })
      .expect(403);
  });

  it("seed operator@markflow: логин оператора работает (без tenant)", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ login: "operator@markflow", password: "demo-password" })
      .expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.tenantId).toBeNull();
    // оператор может смотреть очередь
    await request(app.getHttpServer())
      .get("/moderation/queue")
      .set("Authorization", `Bearer ${res.body.token}`)
      .expect(200);
  });

  it("GtinResolver слой 1: seed VERIFIED GTIN (RAVENOL) — в gtin_cache со source=seed", async () => {
    const cached = await prisma.gtinCache.findUnique({
      where: { gtin: "04014835723399" },
    });
    expect(cached).toBeTruthy();
    expect(cached!.status).toBe("VERIFIED");
    expect(cached!.source).toBe("seed");
    expect(cached!.brand).toBe("RAVENOL");
    const codes = await prisma.gtinCache.findUnique({
      where: { gtin: "04870267100135" },
    });
    expect(codes).toBeTruthy();
    expect(codes!.status).toBe("VERIFIED");
  });

  it("REQUIRE_GS1_VERIFIED_FOR_REGISTERING=true: GTIN PENDING_REAL не регистрируется (FAILED → /moderation/exceptions)", async () => {
    process.env.REQUIRE_GS1_VERIFIED_FOR_REGISTERING = "true";
    try {
      // валидный mod10, но НЕ из seed → после IG-проверки PENDING_REAL, не VERIFIED
      const { cardId, token: tenantTok } = await createCard("04014835723399");
      // сбросим кэш в PENDING_REAL (не VERIFIED)
      await prisma.gtinCache.update({
        where: { gtin: "04014835723399" },
        data: { status: "PENDING_REAL", source: "ig" },
      });
      await request(app.getHttpServer())
        .post(`/products/cards/${cardId}/submit`)
        .set("Authorization", `Bearer ${tenantTok}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/moderation/${cardId}/approve`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .expect(200);

      // OutboxPoller: из-за REQUIRE_GS1_VERIFIED → FAILED именно этой карточки
      await sleep(800);
      const rows = await prisma.outbox.findMany({
        where: { aggregate: "nkt-register" },
      });
      const failed = rows.find((r) => {
        const p = r.payload as { cardId: string };
        return p.cardId === cardId;
      });
      expect(failed).toBeTruthy();
      expect(failed!.status).toBe("FAILED");
      const card = await prisma.productCard.findUnique({
        where: { id: cardId },
      });
      expect(card!.status).not.toBe("REGISTERED");
      // дашборд исключений (ID-017) показывает FAILED
      const exc = await request(app.getHttpServer())
        .get("/moderation/exceptions")
        .set("Authorization", `Bearer ${operatorToken}`)
        .expect(200);
      expect(
        exc.body.items.some((i: { id: string }) => i.id === failed!.id)
      ).toBe(true);
    } finally {
      process.env.REQUIRE_GS1_VERIFIED_FOR_REGISTERING = "false";
    }
  });

  it("NKT timeout (SLA) → задача на дашборд исключений оператора (ID-017)", async () => {
    process.env.NKT_TIMEOUT_MS = "400"; // короче SLA (300ms) — но hang не завершится никогда
    try {
      const { cardId, token: tenantTok } = await createCard("04014835723399", {
        nktResult: "hang", // НКТ никогда не завершает → timeout
      });
      await request(app.getHttpServer())
        .post(`/products/cards/${cardId}/submit`)
        .set("Authorization", `Bearer ${tenantTok}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/moderation/${cardId}/approve`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .expect(200);
      await sleep(900);
      const rows = await prisma.outbox.findMany({
        where: { aggregate: "nkt-register" },
      });
      const failed = rows.find((r) => {
        const p = r.payload as { cardId: string };
        return p.cardId === cardId;
      });
      expect(failed).toBeTruthy();
      expect(failed!.status).toBe("FAILED");
      const exc = await request(app.getHttpServer())
        .get("/moderation/exceptions")
        .set("Authorization", `Bearer ${operatorToken}`)
        .expect(200);
      expect(
        exc.body.items.some((i: { id: string }) => i.id === failed!.id)
      ).toBe(true);
    } finally {
      process.env.NKT_TIMEOUT_MS = "2000";
    }
  });
});
