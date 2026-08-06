import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppModule } from "../src/app.module";

describe("HTTP seams (health + tenant-guard)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "api-test-"));
    process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
    process.env.STORAGE_DIR = join(dir, "storage");

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("GET /health returns 200 with app and db info", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("ok");
  });

  it("AT-16: request without tenant_id is rejected", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/products")
      .expect(400);
    expect(res.body.message).toMatch(/tenant/i);
  });
});
