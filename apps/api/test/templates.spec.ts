import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { execSync } from "node:child_process";
import { AppModule } from "../src/app.module";
import { sheetModel, motorOilSchemaV1 } from "@markflow/shared";

describe("GET /templates/:productGroup (JWT-protected, F3)", () => {
  let app: INestApplication;
  let dir: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "tpl-"));
    const dbPath = join(dir, "test.db");
    process.env.DATABASE_URL = `file:${dbPath}`;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
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
    // подписать валидный JWT с tenant-клеймом (тот же секрет, что AppModule)
    const jwt = app.get(JwtService);
    token = jwt.sign({
      sub: "u1",
      tenantId: "t1",
      roles: ["admin"],
      mfaCompleted: true,
    });
  }, 30000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("AT-16: no JWT → 401 (template is not a public route)", async () => {
    const res = await request(app.getHttpServer())
      .get("/templates/motor-oils")
      .expect(401);
    expect(res.body.code).toBe(401);
  });

  it("sheetModel descriptor + headers feed the rendered xlsx", () => {
    const m = sheetModel(motorOilSchemaV1);
    expect(m.descriptor.productGroup).toBe("motor-oils");
    expect(m.descriptor.schemaVersion).toBe(1);
    expect(m.headers).toHaveLength(44);
    expect(m.headers[0].label).toBe("GTIN");
    expect(m.headers[0].required).toBe(true);
  });

  it("with JWT returns xlsx (zip magic) with header = attribute names", async () => {
    const res = await request(app.getHttpServer())
      .get("/templates/motor-oils")
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheet/);
    const buf = res.body as Buffer;
    expect(buf.length).toBeGreaterThan(100);
    // xlsx — zip magic PK\x03\x04
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
  });

  it("unknown productGroup → 404 (with JWT)", async () => {
    await request(app.getHttpServer())
      .get("/templates/unknown")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });
});
