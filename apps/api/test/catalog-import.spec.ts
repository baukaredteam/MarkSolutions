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

describe("catalog import (T3)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let token: string;
  let tenantId: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "imp-"));
    const dbPath = join(dir, "test.db");
    process.env.DATABASE_URL = `file:${dbPath}`;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.DEMO_ENABLED = "true";
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
    const tenant = await prisma.tenant.create({
      data: { bin: "777000111222", name: "ИмпортТест", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const jwt = app.get(JwtService);
    token = jwt.sign({
      sub: "u1",
      tenantId,
      roles: ["admin"],
      mfaCompleted: true,
    });
  }, 30000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("POST /products/drafts/import returns jobId, then drafts appear in GET /products/drafts", async () => {
    const res = await request(app.getHttpServer())
      .post("/products/drafts/import")
      .set("Authorization", `Bearer ${token}`)
      .send({
        source: "invoice",
        rows: [{ name: "Nomad Novo 7000", tnved: "27101919" }],
      })
      .expect(201);
    expect(res.body.jobId).toBeTruthy();

    // поллинг: после завершения job строки в drafts
    let drafts: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      await sleep(200);
      const d = await request(app.getHttpServer())
        .get("/products/drafts")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      drafts = d.body.items;
      if (drafts.length > 0) break;
    }
    expect(drafts.length).toBeGreaterThan(0);
    const first = drafts[0] as { proposed: { tnved: string }; status: string };
    expect(first.proposed.tnved).toBe("27101919");
    expect(first.status).toBe("DOBOR");
  });

  it("POST /demo/seed-invoice seeds 38+2 drafts (DEMO_ENABLED=true)", async () => {
    // отдельный tenant — изоляция от импорт-теста
    const t = await prisma.tenant.create({
      data: { bin: "777000555666", name: "Сидинжойс", status: "ACTIVE" },
    });
    const tokenT = app.get(JwtService).sign({
      sub: "u3",
      tenantId: t.id,
      roles: ["admin"],
      mfaCompleted: true,
    });
    const res = await request(app.getHttpServer())
      .post("/demo/seed-invoice")
      .set("Authorization", `Bearer ${tokenT}`)
      .expect(201);
    expect(res.body.count).toBe(40);
    const drafts = await request(app.getHttpServer())
      .get("/products/drafts")
      .set("Authorization", `Bearer ${tokenT}`)
      .expect(200);
    const items = drafts.body.items as { proposed: { tnved: string } }[];
    const red = items.filter((i) => i.proposed.tnved === "27101919").length;
    const green = items.filter((i) =>
      ["2710198200", "3403191000"].includes(i.proposed.tnved)
    ).length;
    expect(red).toBe(38);
    expect(green).toBe(2);
  });

  it("AT-16: GET /products/drafts without JWT → 401", async () => {
    const res = await request(app.getHttpServer())
      .get("/products/drafts")
      .expect(401);
    expect(res.body.code).toBe(401);
  });

  it("card create: duplicate active gtin → 409, Archived → 201, other tenant → ok", async () => {
    const gtin = "04014835723399";
    const cardBody = {
      gtin,
      attributes: {
        schemaVersion: 1,
        gtin,
        name: "Castrol EDGE",
        brand: "Castrol",
        countryOfBrand: "Германия",
        composition: "синтетическое",
        shelfLifeMonths: 60,
        productType: "моторное масло",
        volumeL: 4,
        purpose: "легковые",
        sae: "0W-20",
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
      },
    };
    // создать карточку
    const created = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${token}`)
      .send(cardBody)
      .expect(201);
    expect(created.body.gtin).toBe(gtin);

    // дубль активной → 409 (Приложение B)
    const dup = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${token}`)
      .send(cardBody)
      .expect(409);
    expect(dup.body.code).toBe(409);

    // архивировать первую → повторное создание 201
    const cardId = created.body.id;
    await prisma.productCard.update({
      where: { id: cardId },
      data: { status: "ARCHIVED" },
    });
    const afterArchive = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${token}`)
      .send(cardBody)
      .expect(201);
    expect(afterArchive.body.gtin).toBe(gtin);

    // другой tenant с тем же gtin → не дубль (201)
    const t2 = await prisma.tenant.create({
      data: { bin: "777000333444", name: "ДрТенант", status: "ACTIVE" },
    });
    const token2 = app.get(JwtService).sign({
      sub: "u2",
      tenantId: t2.id,
      roles: ["admin"],
      mfaCompleted: true,
    });
    const other = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${token2}`)
      .send(cardBody)
      .expect(201);
    expect(other.body.gtin).toBe(gtin);
  });

  it("ADR-022: Submitted gate — TNVED вне перечня без решения не проходит; fix/out-of-scope работают", async () => {
    const t = await prisma.tenant.create({
      data: { bin: "777000777888", name: "ГейтТен", status: "ACTIVE" },
    });
    const tok = app.get(JwtService).sign({
      sub: "u4",
      tenantId: t.id,
      roles: ["admin"],
      mfaCompleted: true,
    });

    // черновик с TNVED 27101919 (вне перечня) → статус DOBOR
    await request(app.getHttpServer())
      .post("/products/drafts/import")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        rows: [{ name: "Nomad Novo 7000 SAE 15W40", tnved: "27101919" }],
      })
      .expect(201);
    const drafts = await request(app.getHttpServer())
      .get("/products/drafts")
      .set("Authorization", `Bearer ${tok}`)
      .expect(200);
    const d = drafts.body.items[0] as {
      id: string;
      status: string;
      proposed: { tnvedHint: string | null; strengthenFix: boolean };
    };
    expect(d.status).toBe("DOBOR");
    expect(d.proposed.tnvedHint).toBe("возможно 2710198200");
    expect(d.proposed.strengthenFix).toBe(true); // п.15: Nomad SAE → усиление

    // Submitted гейт: вне перечня без решения → 400
    await request(app.getHttpServer())
      .post(`/products/drafts/${d.id}/submit`)
      .set("Authorization", `Bearer ${tok}`)
      .expect(400);

    // «Исправить код» → 2710198200 → submit проходит
    await request(app.getHttpServer())
      .post(`/products/drafts/${d.id}/fix-tnved`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ tnved: "2710198200" })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/products/drafts/${d.id}/submit`)
      .set("Authorization", `Bearer ${tok}`)
      .expect(200);

    // новый черновик → «Не подлежит маркировке» → терминальный OUT_OF_SCOPE, submit 400
    await request(app.getHttpServer())
      .post("/products/drafts/import")
      .set("Authorization", `Bearer ${tok}`)
      .send({ rows: [{ name: "Канистра 4л", tnved: "27101919" }] })
      .expect(201);
    const d2 = (
      await request(app.getHttpServer())
        .get("/products/drafts")
        .set("Authorization", `Bearer ${tok}`)
        .expect(200)
    ).body.items.find((x: { proposed: { name?: string } }) =>
      (x.proposed.name ?? "").includes("Канистра")
    ) as { id: string };
    await request(app.getHttpServer())
      .post(`/products/drafts/${d2.id}/out-of-scope`)
      .set("Authorization", `Bearer ${tok}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/products/drafts/${d2.id}/submit`)
      .set("Authorization", `Bearer ${tok}`)
      .expect(400);

    // аудит записан
    const final = await request(app.getHttpServer())
      .get("/products/drafts")
      .set("Authorization", `Bearer ${tok}`)
      .expect(200);
    const fixed = final.body.items.find(
      (x: { id: string }) => x.id === d.id
    ) as { audit: { action: string }[] };
    expect(fixed.audit.map((a) => a.action)).toContain("fix_tnved:2710198200");
    expect(fixed.audit.map((a) => a.action)).toContain("submit");
  });

  it("AT-03: ярус A пусто → 400 с fieldErrors по полям", async () => {
    const res = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        gtin: "04014835723399",
        attributes: { schemaVersion: 1, name: "Only name" },
      })
      .expect(400);
    expect(res.body.code).toBe(400);
    const fe = res.body.fieldErrors as Record<string, string>;
    expect(fe.gtin).toBeTruthy(); // ярус A: gtin обязателен
    expect(fe.sae).toBeTruthy();
  });

  it("F2: OUT_OF_SCOPE скрыт по умолчанию, виден через ?status=OUT_OF_SCOPE", async () => {
    const t = await prisma.tenant.create({
      data: { bin: "777000888999", name: "Ф2Тен", status: "ACTIVE" },
    });
    const tok = app
      .get(JwtService)
      .sign({
        sub: "u5",
        tenantId: t.id,
        roles: ["admin"],
        mfaCompleted: true,
      });
    await request(app.getHttpServer())
      .post("/products/drafts/import")
      .set("Authorization", `Bearer ${tok}`)
      .send({ rows: [{ name: "Канистра", tnved: "27101919" }] })
      .expect(201);
    const d = (
      await request(app.getHttpServer())
        .get("/products/drafts")
        .set("Authorization", `Bearer ${tok}`)
        .expect(200)
    ).body.items[0] as { id: string };
    await request(app.getHttpServer())
      .post(`/products/drafts/${d.id}/out-of-scope`)
      .set("Authorization", `Bearer ${tok}`)
      .expect(200);
    // по умолчанию скрыт
    const def = (
      await request(app.getHttpServer())
        .get("/products/drafts")
        .set("Authorization", `Bearer ${tok}`)
        .expect(200)
    ).body.items;
    expect(def.some((x: { id: string }) => x.id === d.id)).toBe(false);
    // ?status=OUT_OF_SCOPE → виден
    const oos = (
      await request(app.getHttpServer())
        .get("/products/drafts?status=OUT_OF_SCOPE")
        .set("Authorization", `Bearer ${tok}`)
        .expect(200)
    ).body.items;
    expect(oos.some((x: { id: string }) => x.id === d.id)).toBe(true);
  });

  it("F3: fuzzy-дубль без confirm → 409 warning; с confirm → 201 + audit override", async () => {
    const t = await prisma.tenant.create({
      data: { bin: "777000999000", name: "Ф3Тен", status: "ACTIVE" },
    });
    const tok = app
      .get(JwtService)
      .sign({
        sub: "u6",
        tenantId: t.id,
        roles: ["admin"],
        mfaCompleted: true,
      });
    const attrs = {
      schemaVersion: 1,
      gtin: "04014835723399",
      name: "Castrol EDGE 0W-20",
      brand: "Castrol",
      model: "EDGE",
      volumeL: 4,
      sae: "0W-20",
      countryOfBrand: "Германия",
      composition: "syn",
      shelfLifeMonths: 60,
      productType: "моторное масло",
      purpose: "легковые",
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
    };
    // базовая карточка (другой gtin)
    await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${tok}`)
      .send({ gtin: "05000000000001", attributes: attrs })
      .expect(201);
    // fuzzy-дубль (другой gtin, тот же бренд/модель/объём/SAE) без confirm → 409 warning
    const warn = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        gtin: "05000000000002",
        attributes: { ...attrs, gtin: "05000000000002" },
      })
      .expect(409);
    expect(warn.body.details.warning).toBe("fuzzy_duplicate");
    // с confirm → 201
    await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        gtin: "05000000000002",
        attributes: { ...attrs, gtin: "05000000000002" },
        confirmDuplicate: true,
      })
      .expect(201);
    const auditRow = await prisma.outbox.findFirst({
      where: { aggregate: "product-card-audit" },
    });
    expect(auditRow).toBeTruthy();
    expect(String((auditRow!.payload as { action: string }).action)).toMatch(
      /duplicate_override/
    );
  });

  it("F4: seed-invoice при DEMO_ENABLED=false → 404", async () => {
    process.env.DEMO_ENABLED = "false";
    try {
      await request(app.getHttpServer())
        .post("/demo/seed-invoice")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    } finally {
      process.env.DEMO_ENABLED = "true";
    }
  });

  it("F1: конкурентные create с одним GTIN → ровно один 201 и один 409 (partial unique)", async () => {
    const t = await prisma.tenant.create({
      data: { bin: "777000111100", name: "Конкурент", status: "ACTIVE" },
    });
    const tok = app
      .get(JwtService)
      .sign({
        sub: "u7",
        tenantId: t.id,
        roles: ["admin"],
        mfaCompleted: true,
      });
    const gtin = "06001234567890";
    const attrs = {
      schemaVersion: 1,
      gtin,
      name: "Concurrent",
      brand: "X",
      model: "Y",
      volumeL: 1,
      sae: "5W-30",
      countryOfBrand: "DE",
      composition: "syn",
      shelfLifeMonths: 60,
      productType: "oil",
      purpose: "car",
      storage: "dry",
      conformityMark: "нет",
      eacMarks: "нет",
      grossWeightKg: 1,
      tnved: "2710198200",
      group: "g",
      category: "c",
      packageType: "p",
      kpved: "k",
      gpc: "g",
      ownerGcp: "g",
      ownerName: "n",
      ownerCountry: "c",
      ownerAddress: "a",
      platformName: "p",
      platformCountry: "c",
      platformAddress: "a",
      participantTaxNumber: "n",
      participantName: "n",
      participantCountry: "c",
      participantAddress: "a",
    };
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post("/products/cards")
        .set("Authorization", `Bearer ${tok}`)
        .send({ gtin, attributes: attrs }),
      request(app.getHttpServer())
        .post("/products/cards")
        .set("Authorization", `Bearer ${tok}`)
        .send({ gtin, attributes: attrs }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const count = await prisma.productCard.count({
      where: { tenantId: t.id, gtin },
    });
    expect(count).toBe(1);
  });
});
