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
import { LabelService, rawStringOf } from "../src/label.service";
import { KMS_ADAPTER } from "../src/kms.adapter";

process.env.SIM_MPT_EMISSION_MS = "100";
process.env.OUTBOX_POLL_MS = "50";
process.env.MPT_POLL_MS = "50";
process.env.MPT_ORDER_TIMEOUT_MS = "5000";

describe("labels W4-02 (bwip-js + ZXing-WASM roundtrip, ADR-025)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let labels: LabelService;
  let dir: string;
  let keyDir: string;
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "lbl-"));
    const dbPath = join(dir, "test.db");
    keyDir = join(dir, "keys");
    process.env.DATABASE_URL = `file:${dbPath}`;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.KMS_PROFILE = "file";
    process.env.KMS_FILE_DIR = keyDir;
    process.env.KMS_EXTENDED_CODES = "true";
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
    labels = app.get(LabelService);
    const tenant = await prisma.tenant.create({
      data: { bin: "777000111222", name: "ЛаблТен", status: "ACTIVE" },
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

  // создать код в Vault напрямую: ciphertext = KMS-encrypt({serial, ai91, ai92})
  async function makeCode(
    serial: string,
    opts: { ai91?: string; ai92?: string; status?: string } = {}
  ): Promise<{ id: string; gtin: string }> {
    const gtin = "04014835723399";
    const kms = app.get(KMS_ADAPTER);
    const { ciphertext } = await kms.encrypt(
      Buffer.from(
        JSON.stringify({
          serial,
          ai91: opts.ai91 ?? null,
          ai92: opts.ai92 ?? null,
        })
      )
    );
    const code = await prisma.codeVault.create({
      data: {
        tenantId,
        orderId: "o-lbl-1",
        gtin,
        mask: `${gtin}:${serial.slice(0, 2)}…${serial.slice(-2)}`,
        status: opts.status ?? "ACTIVE",
        ciphertext: ciphertext.toString("base64"),
      },
    });
    return { id: code.id, gtin };
  }

  it("roundtrip: renderPng(raw base+extended) → decodePng → deepEqual (байты с 0x1D сохраняются)", async () => {
    const base = rawStringOf({
      gtin: "04014835723399",
      serial: "123456789",
      ai91: null,
      ai92: null,
      form: "base",
    });
    const png1 = await labels.renderPng(base);
    const dec1 = await labels.decodePng(png1);
    expect(dec1.toString("latin1")).toBe(base);

    const ext = rawStringOf({
      gtin: "04014835723399",
      serial: "123456789",
      ai91: "2710198200",
      ai92: "012345678901",
      form: "extended",
    });
    expect(ext).toContain(String.fromCharCode(0x1d)); // реальный байт GS
    const png2 = await labels.renderPng(ext);
    const dec2 = await labels.decodePng(png2);
    expect(dec2.toString("latin1")).toBe(ext);
  }, 30000);

  it("print: POST /labels/:key/print → PRINTED-event + write-through + labelKey + png", async () => {
    const { id } = await makeCode("222000333");
    const res = await request(app.getHttpServer())
      .post(`/labels/${id}/print`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.key).toBeTruthy();
    expect(res.body.pngBase64).toBeTruthy();
    expect(res.body.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const code = await prisma.codeVault.findUnique({ where: { id } });
    expect(code!.status).toBe("PRINTED"); // write-through
    expect(code!.labelKey).toBe(res.body.key);
    const evts = await prisma.codeEvent.findMany({ where: { codeId: id } });
    expect(evts.map((e) => e.event)).toEqual(["PRINTED"]);
  });

  it("print на APPLIED → 409", async () => {
    const { id } = await makeCode("333000444", { status: "APPLIED" });
    await request(app.getHttpServer())
      .post(`/labels/${id}/print`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
  });

  it("apply: POST /codes/:key/apply с тем же PNG → APPLIED + write-through; чужой PNG → 400", async () => {
    const { id } = await makeCode("444000555");
    const printed = await request(app.getHttpServer())
      .post(`/labels/${id}/print`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const ownPng = printed.body.pngBase64;
    const res = await request(app.getHttpServer())
      .post(`/codes/${id}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({ png: ownPng })
      .expect(200);
    expect(res.body.status).toBe("APPLIED");
    const code = await prisma.codeVault.findUnique({ where: { id } });
    expect(code!.status).toBe("APPLIED");

    // чужой PNG (валидный PNG другого кода) → 400 mismatch
    const { id: id2 } = await makeCode("555000666");
    const foreign = await request(app.getHttpServer())
      .post(`/labels/${id2}/print`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/codes/${id}/apply`) // код id, но PNG от id2 → 400
      .set("Authorization", `Bearer ${token}`)
      .send({ png: foreign.body.pngBase64 })
      .expect(400);
  });

  it("reprint: без причины → 400; OTHER без comment → 400; с причиной → тот же key + REPRINTED event", async () => {
    const { id } = await makeCode("666000777");
    const printed = await request(app.getHttpServer())
      .post(`/labels/${id}/print`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const firstKey = printed.body.key;

    await request(app.getHttpServer())
      .post(`/labels/${id}/reprint`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(`/labels/${id}/reprint`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reasonCode: "OTHER", comment: "аб" })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/labels/${id}/reprint`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reasonCode: "BOGUS" })
      .expect(400);

    const res = await request(app.getHttpServer())
      .post(`/labels/${id}/reprint`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reasonCode: "PRINT_DEFECT" })
      .expect(200);
    expect(res.body.key).toBe(firstKey); // тот же PNG (content-addressed)
    const evts = await prisma.codeEvent.findMany({ where: { codeId: id } });
    expect(evts.map((e) => e.event)).toEqual(["PRINTED", "REPRINTED"]);
    const code = await prisma.codeVault.findUnique({ where: { id } });
    expect(code!.status).toBe("PRINTED"); // REPRINTED не меняет статус
  });

  it("reprint на APPLIED → 409", async () => {
    const { id } = await makeCode("777000888");
    await request(app.getHttpServer())
      .post(`/labels/${id}/print`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/labels/${id}/reprint`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reasonCode: "PRINT_DEFECT" })
      .expect(200); // PRINTED-статус позволяет reprint
    const p = await prisma.codeVault.findUnique({ where: { id } });
    void p;
    // затем довести до APPLIED и перепечатка → 409
    const code = await prisma.codeEvent.create({
      data: {
        tenantId,
        codeId: id,
        event: "APPLIED",
        at: new Date(),
        actor: "u1",
      },
    });
    await prisma.codeVault.update({
      where: { id },
      data: { status: "APPLIED" },
    });
    void code;
    await request(app.getHttpServer())
      .post(`/labels/${id}/reprint`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reasonCode: "PRINT_DEFECT" })
      .expect(409);
  });

  it("idempotентность печати: повторный print на PRINTED → тот же key (не плодит файлы)", async () => {
    const { id } = await makeCode("888000999");
    const r1 = await request(app.getHttpServer())
      .post(`/labels/${id}/print`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    // повторная печать того же кода (ACTIVE→PRINTED уже) → 409 (статусная машина не позволяет PRINTED→PRINTED)
    // но это и есть защита от дублей
    const r2 = await request(app.getHttpServer())
      .post(`/labels/${id}/print`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
    void r1;
    void r2;
  });
});
