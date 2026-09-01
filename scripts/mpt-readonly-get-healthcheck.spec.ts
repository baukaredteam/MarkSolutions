import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const ORDERS = join(repoRoot, "scripts/mpt-get-orders-healthcheck.mjs");
const CODES = join(repoRoot, "scripts/mpt-get-codes-healthcheck.mjs");
const UTIL = join(repoRoot, "scripts/mpt-get-utilisation-healthcheck.mjs");

const TEST_LOGIN = "healthcheck-login";
const TEST_PASS = "healthcheck-password";
const MOCK_ACCESS_TOKEN = "mockAccessTokenValueShouldStayHidden";
const MOCK_REFRESH_TOKEN = "mockRefreshTokenValueShouldStayHidden";
const SAMPLE_KM = "0104870023002153215SAMPLEKMHIDDEN99";
const SAMPLE_REJECT = `reject has ${SAMPLE_KM}`;

type CapturedReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function assertLocalMockUrl(url: string): void {
  const { hostname } = new URL(url);
  if (hostname === "markirovka.kz" || hostname.endsWith(".markirovka.kz")) {
    throw new Error("tests must not call markirovka.kz");
  }
  expect(hostname).toBe("127.0.0.1");
}

function isolatedEnv(
  home: string,
  extra: Record<string, string | undefined> = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    PATH: process.env.PATH,
  };
  delete env.MPT_BASE_URL;
  delete env.MPT_LOGIN;
  delete env.MPT_PASSWORD;
  delete env.MPT_PRODUCT_GROUP;
  delete env.MPT_BUSINESS_PLACE_ID;
  delete env.MPT_PROBE_ORDER_ID;
  delete env.MPT_PROBE_REPORT_ID;
  delete env.MPT_ORDERS_BARE;
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function runScript(
  script: string,
  env: NodeJS.ProcessEnv
): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function startMock(handler: {
  authStatus: number;
  getStatus: number;
  getBody: string;
  /** GET response Content-Type. null = omit header. default application/json */
  getContentType?: string | null;
}): Promise<{
  port: number;
  close: () => Promise<void>;
  captured: CapturedReq[];
}> {
  const captured: CapturedReq[] = [];
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req: IncomingMessage, res) => {
      const rec: CapturedReq = { headers: { ...req.headers }, body: "" };
      rec.method = req.method;
      rec.url = req.url;
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        rec.body = Buffer.concat(chunks).toString("utf8");
        captured.push(rec);
        if (req.method === "POST" && req.url === "/api/users/authenticate") {
          res.writeHead(handler.authStatus, {
            "Content-Type": "application/json",
          });
          res.end(
            JSON.stringify({
              accessToken: MOCK_ACCESS_TOKEN,
              refreshToken: MOCK_REFRESH_TOKEN,
            })
          );
          return;
        }
        const getHeaders: Record<string, string> = {};
        if (handler.getContentType !== null) {
          getHeaders["Content-Type"] =
            handler.getContentType ?? "application/json";
        }
        res.writeHead(handler.getStatus, getHeaders);
        res.end(handler.getBody);
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("mock server has no port"));
        return;
      }
      resolve({
        port: addr.port,
        captured,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}

function assertSafeStdout(stdout: string): void {
  expect(stdout).not.toContain(TEST_PASS);
  expect(stdout).not.toContain(MOCK_ACCESS_TOKEN);
  expect(stdout).not.toContain(MOCK_REFRESH_TOKEN);
  expect(stdout).not.toContain(SAMPLE_KM);
  expect(stdout).not.toContain(SAMPLE_REJECT);
  expect(stdout).not.toMatch(/accessToken/i);
  expect(stdout).not.toMatch(/refreshToken/i);
  expect(stdout).not.toMatch(/rejectReason/i);
  expect(stdout).not.toMatch(/Bearer\s+\S+/);
}

function authEnv(
  home: string,
  baseUrl: string,
  extra: Record<string, string | undefined> = {}
) {
  return isolatedEnv(home, {
    MPT_BASE_URL: baseUrl,
    MPT_LOGIN: TEST_LOGIN,
    MPT_PASSWORD: TEST_PASS,
    ...extra,
  });
}

describe("mpt read-only GET healthchecks", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length) {
      const close = closers.pop();
      if (close) await close();
    }
  });

  it("orders mock 200 list → exit 0, GET /api/orders?productGroup=autofluids, no secrets", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 200,
      getBody: JSON.stringify({
        orderInfos: [{ orderId: "ord-1", orderStatus: "READY" }],
        accessToken: MOCK_ACCESS_TOKEN,
      }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(ORDERS, authEnv(home, baseUrl));

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("status=200\norders_count=1\n");
    expect(result.stderr).toBe("");
    assertSafeStdout(result.stdout);
    expect(mock.captured).toHaveLength(2);
    expect(mock.captured[0]?.method).toBe("POST");
    expect(mock.captured[0]?.url).toBe("/api/users/authenticate");
    expect(mock.captured[0]?.headers.accept).toBe("*/*");
    expect(JSON.parse(mock.captured[0]?.body ?? "")).toEqual({
      login: TEST_LOGIN,
      password: TEST_PASS,
    });
    expect(mock.captured[1]?.method).toBe("GET");
    expect(mock.captured[1]?.url).toBe("/api/orders?productGroup=autofluids");
    expect(mock.captured[1]?.headers.authorization).toBe(
      `Bearer ${MOCK_ACCESS_TOKEN}`
    );
    expect(mock.captured[1]?.headers.accept).toBe("*/*");
    expect(mock.captured[1]?.headers["content-type"]).toBe("application/json");
  });

  it("orders empty orderInfos → 200 and orders_count=0, never bodies", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 200,
      getBody: JSON.stringify({
        orderInfos: [],
        accessToken: MOCK_ACCESS_TOKEN,
      }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(ORDERS, authEnv(home, baseUrl));

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("status=200\norders_count=0\n");
    assertSafeStdout(result.stdout);
    expect(result.stdout).not.toContain("orderInfos");
    expect(mock.captured[1]?.url).toBe("/api/orders?productGroup=autofluids");
  });

  it("orders uses MPT_PRODUCT_GROUP from env", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 200,
      getBody: JSON.stringify({ orderInfos: [] }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(
      ORDERS,
      authEnv(home, baseUrl, { MPT_PRODUCT_GROUP: "from-env" })
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("status=200\norders_count=0\n");
    assertSafeStdout(result.stdout);
    expect(mock.captured[1]?.url).toBe("/api/orders?productGroup=from-env");
  });

  it("orders with MPT_PROBE_ORDER_ID → productGroup and orderId", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 200,
      getBody: JSON.stringify({ status: "READY", quantity: 2 }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(
      ORDERS,
      authEnv(home, baseUrl, { MPT_PROBE_ORDER_ID: "stage-order-1" })
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^status=200\n?$/);
    expect(result.stdout).not.toContain("orders_count");
    assertSafeStdout(result.stdout);
    expect(mock.captured[1]?.url).toBe(
      "/api/orders?productGroup=autofluids&orderId=stage-order-1"
    );
  });

  it("orders mock GET 401 → exit 1 and status=401", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 401,
      getBody: JSON.stringify({ error: "unauthorized" }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(ORDERS, authEnv(home, baseUrl));

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("status=401");
    expect(result.stdout).toMatch(/path=\/api\/orders\?productGroup=/);
    expect(result.stdout).toContain("error=unauthorized");
    expect(result.stdout).toMatch(/body_len=\d+/);
    expect(result.stdout).toContain("content_type=application/json");
    expect(result.stdout).not.toContain(MOCK_ACCESS_TOKEN);
    expect(result.stdout).not.toContain(SAMPLE_KM);
    expect(result.stdout).not.toContain(TEST_PASS);
    assertSafeStdout(result.stdout);
  });

  it("orders mock GET 400 → status/path/error, no secrets or raw JSON", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 400,
      getBody: JSON.stringify({
        message: "productGroup required",
        accessToken: MOCK_ACCESS_TOKEN,
        sampleKm: SAMPLE_KM,
      }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(ORDERS, authEnv(home, baseUrl));

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("status=400");
    expect(result.stdout).toMatch(/path=\/api\/orders\?productGroup=/);
    expect(result.stdout).toContain("productGroup");
    expect(result.stdout).toContain("error=productGroup required");
    expect(result.stdout).toMatch(/body_len=\d+/);
    expect(result.stdout).toContain("content_type=application/json");
    expect(result.stdout).not.toContain("{");
    expect(result.stdout).not.toContain(MOCK_ACCESS_TOKEN);
    expect(result.stdout).not.toContain(SAMPLE_KM);
    expect(result.stdout).not.toContain(TEST_PASS);
    assertSafeStdout(result.stdout);
  });

  it("orders GET 400 with token-like message → error=redacted", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 400,
      getBody: JSON.stringify({
        message: `Bearer ${MOCK_ACCESS_TOKEN} eyJhbGciOiJIUzI1NiJ9.payload`,
      }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(ORDERS, authEnv(home, baseUrl));

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("status=400");
    expect(result.stdout).toMatch(/path=\/api\/orders\?productGroup=/);
    expect(result.stdout).toContain("error=redacted");
    expect(result.stdout).not.toContain(MOCK_ACCESS_TOKEN);
    expect(result.stdout).not.toContain("eyJ");
    expect(result.stdout).not.toContain("Bearer ");
    expect(result.stdout).not.toContain(TEST_PASS);
    assertSafeStdout(result.stdout);
  });

  it("orders GET 400 empty body → error=empty_body, body_len=0, content_type=none", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 400,
      getBody: "",
      getContentType: null,
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(ORDERS, authEnv(home, baseUrl));

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("status=400");
    expect(result.stdout).toMatch(/path=\/api\/orders\?productGroup=/);
    expect(result.stdout).toContain("body_len=0");
    expect(result.stdout).toContain("content_type=none");
    expect(result.stdout).toContain("error=empty_body");
    expect(result.stdout).not.toContain(MOCK_ACCESS_TOKEN);
    expect(result.stdout).not.toContain(SAMPLE_KM);
    expect(result.stdout).not.toContain(TEST_PASS);
    assertSafeStdout(result.stdout);
  });

  it("orders GET 400 non-JSON → error=non_json, never dumps body", async () => {
    const html = `<html>oops ${SAMPLE_KM} ${MOCK_ACCESS_TOKEN}</html>`;
    const mock = await startMock({
      authStatus: 200,
      getStatus: 400,
      getBody: html,
      getContentType: "text/html; charset=utf-8",
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(ORDERS, authEnv(home, baseUrl));

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("status=400");
    expect(result.stdout).toContain(`body_len=${Buffer.byteLength(html)}`);
    expect(result.stdout).toContain("content_type=text/html");
    expect(result.stdout).toContain("error=non_json");
    expect(result.stdout).not.toContain("<html>");
    expect(result.stdout).not.toContain(MOCK_ACCESS_TOKEN);
    expect(result.stdout).not.toContain(SAMPLE_KM);
    expect(result.stdout).not.toContain(TEST_PASS);
    assertSafeStdout(result.stdout);
  });

  it("orders MPT_ORDERS_BARE=1 → GET /api/orders with no query", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 200,
      getBody: JSON.stringify({ orderInfos: [] }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(
      ORDERS,
      authEnv(home, baseUrl, { MPT_ORDERS_BARE: "1" })
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("status=200\norders_count=0\n");
    assertSafeStdout(result.stdout);
    expect(mock.captured[1]?.method).toBe("GET");
    expect(mock.captured[1]?.url).toBe("/api/orders");
    expect(mock.captured[1]?.headers.accept).toBe("*/*");
    expect(mock.captured[1]?.headers["content-type"]).toBe("application/json");
  });

  it("auth 401 → exit 1, no GET", async () => {
    const mock = await startMock({
      authStatus: 401,
      getStatus: 200,
      getBody: JSON.stringify({ leaked: SAMPLE_KM }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(ORDERS, authEnv(home, baseUrl));

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^status=401\n?$/);
    assertSafeStdout(result.stdout);
    expect(mock.captured).toHaveLength(1);
    expect(mock.captured[0]?.url).toBe("/api/users/authenticate");
  });

  it("missing env → exit 1 without which-key", async () => {
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));
    const result = await runScript(ORDERS, isolatedEnv(home));
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^missing env\n?$/);
    expect(result.stdout).not.toMatch(/MPT_/);
    assertSafeStdout(result.stdout);
  });

  it("codes 200 → codes_count only, never raw KM", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 200,
      getBody: JSON.stringify({
        codes: [
          {
            gtin: "04870023002153",
            serial: "SAMPLEKMHIDDEN99",
            raw: SAMPLE_KM,
          },
          { gtin: "04870023002153", serial: "XX" },
        ],
        accessToken: MOCK_ACCESS_TOKEN,
      }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(
      CODES,
      authEnv(home, baseUrl, { MPT_PROBE_ORDER_ID: "ready-order" })
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("status=200\ncodes_count=2\n");
    assertSafeStdout(result.stdout);
    expect(mock.captured[1]?.url).toBe("/api/codes?orderId=ready-order");
    expect(mock.captured[1]?.method).toBe("GET");
    expect(mock.captured[1]?.headers.accept).toBe("*/*");
    expect(mock.captured[1]?.headers["content-type"]).toBe("application/json");
  });

  it("codes missing probe order id → missing env, no HTTP", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 200,
      getBody: JSON.stringify({ codes: [SAMPLE_KM] }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(CODES, authEnv(home, baseUrl));

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^missing env\n?$/);
    expect(result.stdout).not.toMatch(/MPT_/);
    assertSafeStdout(result.stdout);
    expect(mock.captured).toHaveLength(0);
  });

  it("codes 401 → status=401, no codes_count", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 401,
      getBody: JSON.stringify({ codes: [SAMPLE_KM] }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(
      CODES,
      authEnv(home, baseUrl, { MPT_PROBE_ORDER_ID: "x" })
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^status=401\n?$/);
    expect(result.stdout).not.toContain("codes_count");
    assertSafeStdout(result.stdout);
  });

  it("utilisation 200 → report_status from CONTRACT, no rejectReason/KM", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 200,
      getBody: JSON.stringify({
        status: "SUCCESS",
        rejectReason: SAMPLE_REJECT,
        accessToken: MOCK_ACCESS_TOKEN,
      }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(
      UTIL,
      authEnv(home, baseUrl, { MPT_PROBE_REPORT_ID: "rep-1" })
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("status=200\nreport_status=SUCCESS\n");
    assertSafeStdout(result.stdout);
    expect(mock.captured[1]?.url).toBe("/api/utilisation/rep-1");
    expect(mock.captured[1]?.method).toBe("GET");
  });

  it("utilisation unknown status → report_status=other", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 200,
      getBody: JSON.stringify({ status: "WEIRD_STAGE_VALUE" }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));

    const result = await runScript(
      UTIL,
      authEnv(home, baseUrl, { MPT_PROBE_REPORT_ID: "rep-2" })
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("status=200\nreport_status=other\n");
    expect(result.stdout).not.toContain("WEIRD_STAGE_VALUE");
    assertSafeStdout(result.stdout);
  });

  it("utilisation missing report id → missing env", async () => {
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));
    const result = await runScript(
      UTIL,
      isolatedEnv(home, {
        MPT_BASE_URL: "http://127.0.0.1:1",
        MPT_LOGIN: TEST_LOGIN,
        MPT_PASSWORD: TEST_PASS,
      })
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^missing env\n?$/);
    expect(result.stdout).not.toMatch(/MPT_/);
    assertSafeStdout(result.stdout);
  });

  it("loads probe id from ~/.config/marksolutions/mpt.env", async () => {
    const mock = await startMock({
      authStatus: 200,
      getStatus: 200,
      getBody: JSON.stringify({ codes: [] }),
    });
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));
    const dir = join(home, ".config/marksolutions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "mpt.env"),
      [
        `MPT_BASE_URL=${baseUrl}`,
        `MPT_LOGIN=${TEST_LOGIN}`,
        `MPT_PASSWORD=${TEST_PASS}`,
        "MPT_PROBE_ORDER_ID=from-file",
        "",
      ].join("\n"),
      "utf8"
    );

    const result = await runScript(CODES, isolatedEnv(home));
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("status=200\ncodes_count=0\n");
    assertSafeStdout(result.stdout);
    expect(mock.captured[1]?.url).toBe("/api/codes?orderId=from-file");
  });

  it("network error → status=network", async () => {
    const baseUrl = "http://127.0.0.1:1";
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-ro-"));
    const result = await runScript(ORDERS, authEnv(home, baseUrl));
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^status=network\n?$/);
    assertSafeStdout(result.stdout);
  });

  it("fails the suite if a test URL hostname is markirovka.kz", () => {
    expect(() => assertLocalMockUrl("https://test.markirovka.kz")).toThrow(
      /must not call markirovka\.kz/
    );
    expect(() => assertLocalMockUrl("https://prod.markirovka.kz")).toThrow(
      /must not call markirovka\.kz/
    );
  });
});
