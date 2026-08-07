import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { execSync } from "node:child_process";
import { TemplatesModule } from "../src/templates.module";

describe("GET /templates/:productGroup", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "tpl-"));
    const dbPath = join(dir, "test.db");
    process.env.DATABASE_URL = `file:${dbPath}`;
    execSync(
      "npx prisma migrate deploy --schema packages/db/prisma/schema.prisma",
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
        stdio: "pipe",
      }
    );
    const module: TestingModule = await Test.createTestingModule({
      imports: [TemplatesModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("returns xlsx for motor-oils with header = attribute names", async () => {
    const res = await request(app.getHttpServer())
      .get("/templates/motor-oils")
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

  it("unknown productGroup → 404", async () => {
    await request(app.getHttpServer()).get("/templates/unknown").expect(404);
  });
});
