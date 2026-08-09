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

describe("catalog files (T3, ADR-015)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let storageDir: string;
  let token: string;
  let tenantId: string;
  let token2: string;
  let tenantId2: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "files-"));
    const dbPath = join(dir, "test.db");
    storageDir = join(dir, "storage");
    process.env.DATABASE_URL = `file:${dbPath}`;
    process.env.STORAGE_DIR = storageDir;
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

    const t1 = await prisma.tenant.create({
      data: { bin: "777000111222", name: "ФайлТен", status: "ACTIVE" },
    });
    tenantId = t1.id;
    const t2 = await prisma.tenant.create({
      data: { bin: "777000111333", name: "Чужой", status: "ACTIVE" },
    });
    tenantId2 = t2.id;
    const jwt = app.get(JwtService);
    token = jwt.sign({
      sub: "u1",
      tenantId,
      roles: ["admin"],
      mfaCompleted: true,
    });
    token2 = jwt.sign({
      sub: "u2",
      tenantId: tenantId2,
      roles: ["admin"],
      mfaCompleted: true,
    });
  }, 30000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  let seq = 0;
  let gtinSeq = 0;
  // валидный GTIN-14 с правильной контрольной цифрой (mod10) — иначе GtinResolver режектит при submit
  function validGtin(): string {
    gtinSeq += 1;
    const body = `0401483572${String(gtinSeq).padStart(3, "0")}`; // 13 цифр (10+3)
    const digits = body.split("").map(Number);
    let sum = 0;
    for (let i = 0; i < 13; i++)
      sum += digits[i] * ((12 - i) % 2 === 0 ? 3 : 1);
    const check = (10 - (sum % 10)) % 10;
    return `${body}${check}`;
  }
  async function createCard(): Promise<string> {
    // чтобы избежать partial unique (gtin per tenant) и fuzzy-дублей (brand/model/volume/sae),
    // каждому тесту свой gtin и бренд
    seq += 1;
    const uniqueGtin = validGtin();
    const res = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        gtin: uniqueGtin,
        attributes: { ...fullAttrs(uniqueGtin), brand: `BR${seq}` },
      });
    if (res.status !== 201) {
      console.log(
        "CREATE DEBUG",
        res.status,
        JSON.stringify(res.body).slice(0, 400)
      );
    }
    expect(res.status).toBe(201);
    return res.body.id;
  }

  function upload(
    cardId: string,
    label: string,
    buf: Buffer,
    name = "photo.jpg",
    mime = "image/jpeg"
  ) {
    return request(app.getHttpServer())
      .post(`/products/cards/${cardId}/files`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", buf, { filename: name, contentType: mime })
      .field("label", label);
  }

  async function uploadExpect(
    cardId: string,
    label: string,
    buf: Buffer,
    name = "photo.jpg",
    mime = "image/jpeg",
    expectStatus = 201
  ) {
    const r = await upload(cardId, label, buf, name, mime);
    if (r.status !== expectStatus) {
      console.log(
        "UPLOAD DEBUG",
        label,
        r.status,
        JSON.stringify(r.body).slice(0, 400)
      );
    }
    expect(r.status).toBe(expectStatus);
  }

  it("upload → write → карточка хранит дескриптор {key,originalName,mimeType,contentHash,uploadedAt,label}", async () => {
    const cardId = await createCard();
    await uploadExpect(cardId, "front", Buffer.from("photo-front-bytes"));
    await uploadExpect(cardId, "back", Buffer.from("photo-back-bytes"));
    await uploadExpect(
      cardId,
      "declaration",
      Buffer.from("declaration-pdf"),
      "decl.pdf",
      "application/pdf"
    );

    const card = await prisma.productCard.findUnique({ where: { id: cardId } });
    const files = (card!.attributes as { files?: unknown[] }).files ?? [];
    expect(files).toHaveLength(3);
    const front = files.find(
      (f) => (f as { label: string }).label === "front"
    ) as Record<string, unknown>;
    expect(front.key).toBeTruthy();
    expect(front.originalName).toBe("photo.jpg");
    expect(front.mimeType).toBe("image/jpeg");
    expect(front.contentHash).toMatch(/^[a-f0-9]{64}$/); // sha256
    // точное значение на известном содержимом (стабильность/дедуп-инвариант)
    expect(front.contentHash).toBe(
      "a5802267e3d4391063291d64f63ad6f8cdc09702685aee977b7e928ac1f1b244"
    );
    expect(front.uploadedAt).toBeTruthy();
    expect(front.label).toBe("front");

    // файл физически записан в storage
    const stored = await import("node:fs/promises");
    const bytes = await stored.readFile(join(storageDir, String(front.key)));
    expect(bytes.toString()).toBe("photo-front-bytes");
  });

  it("загрузка с существующим label → замена (тот же label, новый ключ)", async () => {
    const cardId = await createCard();
    await uploadExpect(cardId, "front", Buffer.from("a"));
    await uploadExpect(cardId, "front", Buffer.from("b")); // замена, не дубль
    const card = await prisma.productCard.findUnique({ where: { id: cardId } });
    const fronts = (
      card!.attributes as { files: { label: string }[] }
    ).files.filter((f) => f.label === "front");
    expect(fronts).toHaveLength(1); // одна запись, заменили
  });

  it("clone → те же ключи (CAT-011); замена файла → новый ключ", async () => {
    const cardId = await createCard();
    await uploadExpect(cardId, "front", Buffer.from("front-x"));
    await uploadExpect(cardId, "back", Buffer.from("back-x"));
    const card = await prisma.productCard.findUnique({ where: { id: cardId } });
    const origKeys = (
      card!.attributes as { files: { label: string; key: string }[] }
    ).files
      .map((f) => `${f.label}:${f.key}`)
      .sort();

    // clone
    const clone = await request(app.getHttpServer())
      .post(`/products/cards/${cardId}/clone`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(clone.body.id).not.toBe(cardId);
    const cloneCard = await prisma.productCard.findUnique({
      where: { id: clone.body.id },
    });
    const cloneKeys = (
      cloneCard!.attributes as { files: { label: string; key: string }[] }
    ).files
      .map((f) => `${f.label}:${f.key}`)
      .sort();
    expect(cloneKeys).toEqual(origKeys); // те же ключи

    // замена front → новый ключ
    await uploadExpect(cardId, "front", Buffer.from("front-replaced"));
    const after = await prisma.productCard.findUnique({
      where: { id: cardId },
    });
    const afterKeys = (
      after!.attributes as { files: { label: string; key: string }[] }
    ).files
      .map((f) => `${f.label}:${f.key}`)
      .sort();
    const frontKey = origKeys.find((k) => k.startsWith("front:"));
    expect(afterKeys).not.toContain(frontKey);
    expect(afterKeys).toHaveLength(origKeys.length); // замена, не добавление
  });

  it("GET файла: чужой tenant → 403 (IDOR); свой tenant → 200 с байтами", async () => {
    const cardId = await createCard();
    await uploadExpect(cardId, "front", Buffer.from("secret-photo"));
    const card = await prisma.productCard.findUnique({ where: { id: cardId } });
    const front = (
      card!.attributes as { files: { label: string; key: string }[] }
    ).files.find((f) => f.label === "front")!;

    // свой tenant → 200
    const ok = await request(app.getHttpServer())
      .get(`/products/cards/${cardId}/files/${front.key}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(ok.body.toString?.()).toBe("secret-photo");

    // чужой tenant → 403
    await request(app.getHttpServer())
      .get(`/products/cards/${cardId}/files/${front.key}`)
      .set("Authorization", `Bearer ${token2}`)
      .expect(403);

    // без JWT → 401
    await request(app.getHttpServer())
      .get(`/products/cards/${cardId}/files/${front.key}`)
      .expect(401);
  });

  it("ярус B: загружено 1 фото (front) → submit блокируется (нужно ≥2 фото)", async () => {
    const cardId = await createCard();
    await uploadExpect(cardId, "front", Buffer.from("single-photo"));
    const sub = await request(app.getHttpServer())
      .post(`/products/cards/${cardId}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(sub.body.status).toBe("NEEDS_CORRECTION");
    expect(sub.body.fieldErrors.photos).toMatch(/минимум 2 фото/);

    // добавляем back → submit проходит
    await uploadExpect(cardId, "back", Buffer.from("second-photo"));
    const sub2res = await request(app.getHttpServer())
      .post(`/products/cards/${cardId}/submit`)
      .set("Authorization", `Bearer ${token}`);
    if (sub2res.status !== 200) {
      console.log(
        "SUBMIT2 DEBUG",
        sub2res.status,
        JSON.stringify(sub2res.body).slice(0, 400)
      );
    }
    expect(sub2res.status).toBe(200);
    expect(sub2res.body.status).toBe("SUBMITTED");
  });

  it("ярус B: декларация без согласованных дат → submit блокируется", async () => {
    const cardId = await createCard();
    await uploadExpect(cardId, "front", Buffer.from("d-front"));
    await uploadExpect(cardId, "back", Buffer.from("d-back"));
    // атрибуты с декларацией: perpetual=false, дата есть, expiry нет → несогласовано
    await prisma.productCard.update({
      where: { id: cardId },
      data: {
        attributes: {
          ...fullAttrs("04014835723399"),
          brand: "DCL",
          declarationDate: "2026-08-01",
          declarationPerpetual: false,
        },
      },
    });
    await uploadExpect(
      cardId,
      "declaration",
      Buffer.from("d-pdf"),
      "decl.pdf",
      "application/pdf"
    );
    const sub = await request(app.getHttpServer())
      .post(`/products/cards/${cardId}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(sub.body.status).toBe("NEEDS_CORRECTION");
    expect(sub.body.fieldErrors.declaration).toBeTruthy();
  });
});
