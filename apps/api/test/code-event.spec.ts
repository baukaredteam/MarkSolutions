import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
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
import { CodeEventService } from "../src/code-event.service";

describe("code events + status machine (W4, ADR-025)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: CodeEventService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "evt-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.KMS_PROFILE = "file";
    process.env.KMS_FILE_DIR = join(dir, "keys");
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
    service = app.get(CodeEventService);
    const tenant = await prisma.tenant.create({
      data: { bin: "777000111222", name: "СобытТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const jwt = app.get(JwtService);
    jwt.sign({ sub: "u1", tenantId, roles: ["admin"], mfaCompleted: true });
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  async function makeCode(status = "ACTIVE"): Promise<string> {
    const code = await prisma.codeVault.create({
      data: {
        tenantId,
        orderId: "o-1",
        gtin: "04014835723399",
        mask: "04014835723399:00…99",
        status,
        ciphertext: "dGVzdA==",
      },
    });
    return code.id;
  }

  it("write-through: событие PRINTED → CodeVault.status = PRINTED + CodeEvent запись", async () => {
    const codeId = await makeCode();
    const evt = await service.recordEvent(tenantId, codeId, "u1", "PRINTED", {
      reasonCode: null,
    });
    expect(evt.event).toBe("PRINTED");
    const code = await prisma.codeVault.findUnique({ where: { id: codeId } });
    expect(code!.status).toBe("PRINTED"); // write-through
    const count = await prisma.codeEvent.count({ where: { codeId } });
    expect(count).toBe(1);
  });

  it("машина: ACTIVE→PRINTED→APPLIED→UTILISED цепочка валидна", async () => {
    const codeId = await makeCode();
    await service.recordEvent(tenantId, codeId, "u1", "PRINTED");
    await service.recordEvent(tenantId, codeId, "u1", "APPLIED");
    await service.recordEvent(tenantId, codeId, "u1", "UTILISED");
    const code = await prisma.codeVault.findUnique({ where: { id: codeId } });
    expect(code!.status).toBe("UTILISED");
    const events = await prisma.codeEvent.findMany({
      where: { codeId },
      orderBy: { at: "asc" },
    });
    expect(events.map((e) => e.event)).toEqual([
      "PRINTED",
      "APPLIED",
      "UTILISED",
    ]);
  });

  it("негативный: статус не прыгает мимо машины (ACTIVE → UTILISED без PRINTED/APPLIED) → 400", async () => {
    const codeId = await makeCode();
    await expect(
      service.recordEvent(tenantId, codeId, "u1", "UTILISED")
    ).rejects.toThrow(/недопустим|transition/i);
    const code = await prisma.codeVault.findUnique({ where: { id: codeId } });
    expect(code!.status).toBe("ACTIVE"); // не изменился
  });

  it("REPRINTED не меняет статус (только событие), APPLIED → WITHDRAWN допустим", async () => {
    const codeId = await makeCode();
    await service.recordEvent(tenantId, codeId, "u1", "PRINTED");
    await service.recordEvent(tenantId, codeId, "u1", "REPRINTED", {
      reasonCode: "PRINT_DEFECT",
      comment: null,
    });
    const code = await prisma.codeVault.findUnique({ where: { id: codeId } });
    expect(code!.status).toBe("PRINTED"); // REPRINTED не меняет
    await service.recordEvent(tenantId, codeId, "u1", "APPLIED");
    await service.recordEvent(tenantId, codeId, "u1", "WITHDRAWN", {
      reasonCode: "DEFECT",
    });
    const after = await prisma.codeVault.findUnique({ where: { id: codeId } });
    expect(after!.status).toBe("WITHDRAWN");
  });

  it("SsscCounter: tenant-scoped автоинкремент, SSCC уникальны, prefix детерминирован (ADR-025 Q4)", async () => {
    const s1 = await service.generateSssc(tenantId);
    const s2 = await service.generateSssc(tenantId);
    expect(s1).toMatch(/^\d{18}$/);
    expect(verifyGs1(s1)).toBe(true);
    expect(s2).toMatch(/^\d{18}$/);
    expect(verifyGs1(s2)).toBe(true);
    // автоинкремент: seq 1, 2 → разные SSCC, общий префикс
    expect(s1.slice(0, 8)).toBe(s2.slice(0, 8));
    expect(s1).not.toBe(s2);
    expect(Number(s1.slice(8, 17))).toBe(1);
    expect(Number(s2.slice(8, 17))).toBe(2);
    // счётчик сохранён в БД
    const counter = await prisma.ssscCounter.findUnique({
      where: { tenantId },
    });
    expect(counter!.nextSeq).toBe(3);
  });
});

function verifyGs1(sscc: string): boolean {
  // быстрый mod10-чек для теста (18 цифр)
  const digits = sscc.split("").map(Number);
  const base = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    const w = (base.length - 1 - i) % 2 === 0 ? 3 : 1;
    sum += base[i] * w;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === digits[17];
}
