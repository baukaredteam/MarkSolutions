import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(repoRoot, "scripts/mpt-auth-healthcheck.mjs");

const TEST_LOGIN = "healthcheck-login";
const TEST_PASS = "healthcheck-password";
const MOCK_ACCESS_TOKEN = "mockAccessTokenValueShouldStayHidden";
const MOCK_REFRESH_TOKEN = "mockRefreshTokenValueShouldStayHidden";

type Captured = {
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
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function runScript(env: NodeJS.ProcessEnv): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], {
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

function startMock(
  status: number,
  body: string
): Promise<{ port: number; close: () => Promise<void>; captured: Captured }> {
  const captured: Captured = { headers: {}, body: "" };
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req: IncomingMessage, res) => {
      captured.method = req.method;
      captured.url = req.url;
      captured.headers = { ...req.headers };
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        captured.body = Buffer.concat(chunks).toString("utf8");
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(body);
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
  expect(stdout).not.toMatch(/accessToken/i);
  expect(stdout).not.toMatch(/refreshToken/i);
  expect(stdout).not.toMatch(/Bearer\s+\S+/);
}

describe("mpt-auth-healthcheck", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length) {
      const close = closers.pop();
      if (close) await close();
    }
  });

  it("mock 200 → exit 0 and status=200 without tokens", async () => {
    const mock = await startMock(
      200,
      JSON.stringify({
        accessToken: MOCK_ACCESS_TOKEN,
        refreshToken: MOCK_REFRESH_TOKEN,
      })
    );
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);

    const home = mkdtempSync(join(tmpdir(), "mpt-hc-"));
    const result = await runScript(
      isolatedEnv(home, {
        MPT_BASE_URL: baseUrl,
        MPT_LOGIN: TEST_LOGIN,
        MPT_PASSWORD: TEST_PASS,
      })
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^status=200\n?$/);
    assertSafeStdout(result.stdout);
    expect(result.stderr).toBe("");
    expect(mock.captured.method).toBe("POST");
    expect(mock.captured.url).toBe("/api/users/authenticate");
    expect(mock.captured.headers.accept).toBe("*/*");
    expect(String(mock.captured.headers["content-type"])).toMatch(
      /application\/json/i
    );
    expect(JSON.parse(mock.captured.body)).toEqual({
      login: TEST_LOGIN,
      password: TEST_PASS,
    });
  });

  it("mock 401 → exit 1 and status=401", async () => {
    const mock = await startMock(
      401,
      JSON.stringify({ error: "unauthorized" })
    );
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);

    const home = mkdtempSync(join(tmpdir(), "mpt-hc-"));
    const result = await runScript(
      isolatedEnv(home, {
        MPT_BASE_URL: baseUrl,
        MPT_LOGIN: TEST_LOGIN,
        MPT_PASSWORD: TEST_PASS,
      })
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^status=401\n?$/);
    assertSafeStdout(result.stdout);
  });

  it("missing env → exit 1 and missing env (no which-value)", async () => {
    const home = mkdtempSync(join(tmpdir(), "mpt-hc-"));
    const result = await runScript(isolatedEnv(home));

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^missing env\n?$/);
    expect(result.stdout).not.toMatch(/MPT_/);
    assertSafeStdout(result.stdout);
  });

  it("network error → exit 1 and status=network", async () => {
    const baseUrl = "http://127.0.0.1:1";
    assertLocalMockUrl(baseUrl);
    const home = mkdtempSync(join(tmpdir(), "mpt-hc-"));
    const result = await runScript(
      isolatedEnv(home, {
        MPT_BASE_URL: baseUrl,
        MPT_LOGIN: TEST_LOGIN,
        MPT_PASSWORD: TEST_PASS,
      })
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^status=network\n?$/);
    assertSafeStdout(result.stdout);
  });

  it("loads ~/.config/marksolutions/mpt.env when process env is unset", async () => {
    const mock = await startMock(
      200,
      JSON.stringify({ accessToken: MOCK_ACCESS_TOKEN })
    );
    closers.push(mock.close);
    const baseUrl = `http://127.0.0.1:${mock.port}`;
    assertLocalMockUrl(baseUrl);

    const home = mkdtempSync(join(tmpdir(), "mpt-hc-"));
    const dir = join(home, ".config/marksolutions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "mpt.env"),
      [
        "# comment",
        `MPT_BASE_URL=${baseUrl}`,
        `MPT_LOGIN=${TEST_LOGIN}`,
        `MPT_PASSWORD=${TEST_PASS}`,
        "",
      ].join("\n"),
      "utf8"
    );

    const result = await runScript(isolatedEnv(home));
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^status=200\n?$/);
    assertSafeStdout(result.stdout);
  });

  it("fails the suite if a test URL hostname is markirovka.kz", () => {
    expect(() => assertLocalMockUrl("https://test.markirovka.kz")).toThrow(
      /must not call markirovka\.kz/
    );
  });
});
