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

// быстрые интервалы для тестов
process.env.SIM_MPT_EMISSION_MS = "100";
process.env.OUTBOX_POLL_MS = "50";
process.env.MPT_POLL_MS = "50";
process.env.MPT_ORDER_TIMEOUT_MS = "5000";

describe("code vault (W3, CV-030..033)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let keyDir: string;
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "vault-"));
    const dbPath = join(dir, "test.db");
    keyDir = join(dir, "keys");
    process.env.DATABASE_URL = `file:${dbPath}`;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.DEMO_ENABLED = "true";
    process.env.KMS_PROFILE = "file";
    process.env.KMS_FILE_DIR = keyDir;
    process.env.KMS_EXTENDED_CODES = "true";
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
      data: { bin: "777000111222", name: "ВолтТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const account = await prisma.account.create({
      data: { tenantId, balance: BigInt(0) },
    });
    await prisma.ledgerEntry.create({
      data: {
        tenantId,
        accountId: account.id,
        kind: "TOPUP",
        amount: BigInt(1000000),
        reason: "seed",
      },
    });
    await prisma.account.update({
      where: { id: account.id },
      data: { balance: BigInt(1000000) },
    });
    await prisma.tariff.deleteMany();
    await prisma.tariff.create({
      data: {
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000),
        pricePerCodeKZT: BigInt(100),
      },
    });
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

  let gtinSeq = 0;
  function validGtin(): string {
    gtinSeq += 1;
    const body = `0401483572${String(gtinSeq).padStart(3, "0")}`;
    const digits = body.split("").map(Number);
    let sum = 0;
    for (let i = 0; i < 13; i++)
      sum += digits[i] * ((12 - i) % 2 === 0 ? 3 : 1);
    const check = (10 - (sum % 10)) % 10;
    return `${body}${check}`;
  }

  async function createCard(): Promise<{ id: string; gtin: string }> {
    const gtin = validGtin();
    const res = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        gtin,
        attributes: {
          schemaVersion: 1,
          gtin,
          name: "RAVENOL 5W-30",
          brand: `BR${gtinSeq}`,
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
        },
      })
      .expect(201);
    return { id: res.body.id, gtin };
  }

  // создать заказ и дождаться COMPLETED → коды в Vault (ACTIVE)
  async function completedOrder(
    key: string,
    places = 2,
    units = 2
  ): Promise<string> {
    const { id: cardId, gtin } = await createCard();
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ cardId, gtin, places, unitsPerPlace: units })
      .expect(201);
    const orderId = res.body.id;
    let status = "";
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      const o = await prisma.order.findUnique({ where: { id: orderId } });
      status = o!.status;
      if (status === "COMPLETED" || status === "PARTIALLY_COMPLETED") break;
    }
    expect(["COMPLETED", "PARTIALLY_COMPLETED"]).toContain(status);
    // дождаться инджеста в Vault (поллер асинхронный)
    const want = places * units;
    for (let i = 0; i < 40; i++) {
      await sleep(50);
      const n = await prisma.codeVault.count({ where: { orderId } });
      if (n >= want) break;
    }
    return orderId;
  }

  it("инджест: COMPLETED-заказ → коды в Vault (ACTIVE), gtin открыт, ciphertext ≠ plaintext serial", async () => {
    const orderId = await completedOrder("k-vault-1", 2, 3); // 6 КМ
    const vault = await prisma.codeVault.findMany({ where: { orderId } });
    expect(vault).toHaveLength(6);
    for (const v of vault) {
      expect(v.status).toBe("ACTIVE");
      expect(v.gtin).toBeTruthy();
      expect(v.mask).toBeTruthy();
      // CV-030: ciphertext не содержит plaintext serial
      expect(v.ciphertext).not.toContain("0000001");
      expect(v.ciphertext).not.toMatch(/^00000/);
      // маска = gtin + «первые2…последние2» (или скрыта для коротких)
      expect(v.mask).toContain(v.gtin);
    }
  });

  it("CV-030 негативный: дамп БД без ключей не даёт plaintext serial (ciphertext ≠ serial)", async () => {
    const orderId = await completedOrder("k-vault-2");
    const vault = await prisma.codeVault.findMany({ where: { orderId } });
    // в сыром дампе (без расшифровки) serial отсутствует
    const raw = JSON.stringify(vault);
    expect(raw).not.toContain('"serial"');
    // расшифровать без ключа невозможно: ciphertext не содержит serial-значений
    for (const v of vault) {
      expect(v.ciphertext).not.toContain("0000001");
    }
  });

  it("маска: serial 'первые2…последние2' при length>6; GET /api/codes не возвращает полные serial", async () => {
    const orderId = await completedOrder("k-vault-3", 2, 2); // 4 КМ
    const res = await request(app.getHttpServer())
      .get("/api/codes")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(
      res.body.items.some((c: { orderId: string }) => c.orderId === orderId)
    ).toBe(true);
    const found = res.body.items.filter(
      (c: { orderId: string }) => c.orderId === orderId
    );
    expect(found).toHaveLength(1); // одна строка на заказ (quantity=4)
    const row = found[0];
    expect(row.quantity).toBe(4);
    expect(row.serial).toBeUndefined(); // полный serial не отдаётся
    expect(row.gtin).toBeTruthy();
    expect(row.mask).toBeTruthy();
    // маска = gtin + ':' + «первые2…последние2» для 7-значного serial
    expect(row.mask).toMatch(new RegExp(`^${row.gtin}:\\d{2}…\\d{2}$`));
  });

  it("GET /api/codes: чужой tenant → 404", async () => {
    const orderId = await completedOrder("k-vault-4");
    const t2 = await prisma.tenant.create({
      data: { bin: "777000111333", name: "Чужой", status: "ACTIVE" },
    });
    const token2 = app
      .get(JwtService)
      .sign({
        sub: `u-${t2.id}`,
        tenantId: t2.id,
        roles: ["admin"],
        mfaCompleted: true,
      });
    await request(app.getHttpServer())
      .get("/api/codes")
      .set("Authorization", `Bearer ${token2}`)
      .expect(200); // список tenant-scoped: не видит чужие коды
    // доступ к чужому заказу через экспорт → 404
    await request(app.getHttpServer())
      .post("/codes/export")
      .set("Authorization", `Bearer ${token2}`)
      .send({ orderId })
      .expect(404);
  });

  it("POST /codes/export CSV: BOM, ';', <GS> литералом, колонки, аудит CV-032; повторный экспорт разрешён и аудируется", async () => {
    const orderId = await completedOrder("k-vault-5", 1, 2); // 2 КМ
    const res = await request(app.getHttpServer())
      .post("/codes/export")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId, reason: "клиент потерял файл" })
      .expect(201);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    const csv = res.text ?? res.body.toString();
    // UTF-8 BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    // разделитель «;»
    expect(csv.split("\n")[0]).toContain(";");
    // заголовок
    expect(csv.split("\n")[0]).toContain("gtin");
    expect(csv.split("\n")[0]).toContain("serial");
    expect(csv.split("\n")[0]).toContain("km_full");
    // km_full содержит <GS> литералом (не бинарный 0x1D)
    const body = csv.slice(1); // без BOM
    expect(body).not.toContain(String.fromCharCode(0x1d));
    expect(body).toContain("<GS>");
    // аудит
    const audit = await prisma.vaultExport.findMany({
      where: { orderId, kind: "export" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].actor).toBe("u1");
    expect(audit[0].count).toBe(2);

    // повторный экспорт разрешён и тоже аудируется
    await request(app.getHttpServer())
      .post("/codes/export")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId })
      .expect(201);
    const audit2 = await prisma.vaultExport.count({
      where: { orderId, kind: "export" },
    });
    expect(audit2).toBe(2);
  });

  it("экспорт не-READY/Completed заказа → 409", async () => {
    const { id: cardId, gtin } = await createCard();
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "k-vault-6")
      .send({ cardId, gtin, places: 1, unitsPerPlace: 1 })
      .expect(201);
    const orderId = res.body.id;
    // заказ ещё не Completed (только Queued/Sent) — но поллер быстрый; гарантируем статус ≠ Completed
    await sleep(50);
    await request(app.getHttpServer())
      .post("/codes/export")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId })
      .expect(409);
  });

  it("POST /codes/print: отдаёт полные КМ (расшифрованные) + аудит print", async () => {
    const orderId = await completedOrder("k-vault-7", 1, 1); // 1 КМ
    const res = await request(app.getHttpServer())
      .post("/codes/print")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId, count: 1 })
      .expect(200);
    expect(res.body.codes).toHaveLength(1);
    expect(res.body.codes[0].serial).toBeTruthy(); // полный serial (печать — привилегированная)
    const audit = await prisma.vaultExport.findFirst({
      where: { orderId, kind: "print" },
    });
    expect(audit).toBeTruthy();
    expect(audit!.count).toBe(1);
  });
});
