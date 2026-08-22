import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TenantGuard } from "./guards";
import { Reflector } from "@nestjs/core";
import { ActiveScopeResolver, MembershipError } from "./active-scope.resolver";

// W0-03a part 2 diagnosing phase вЂ” red-capable reproductions. Each test names
// an exact defect; they must be red before the corresponding slice fixes them.

const SRC = join(__dirname);

function jwtOf(claims: Record<string, unknown>) {
  return { verify: (_t: string) => claims } as never;
}
function reflector() {
  const r = new Reflector();
  return Object.assign(r, {
    getAllAndOverride: () => false,
  }) as unknown as Reflector;
}

function fakePrisma(membership: unknown) {
  return {
    userLegalEntityMembership: {
      findFirst: async () => membership,
    },
  } as never;
}

const membershipRow = {
  legalEntityId: "le-1",
  legalEntity: { id: "le-1", tenantId: "t1" },
};

// в”Ђв”Ђ (a) JWT without activeLegalEntityId must not reach a protected route в”Ђв”Ђ
describe("red a: JWT without activeLegalEntityId", () => {
  it("is rejected on every protected request", async () => {
    const guard = new TenantGuard(
      jwtOf({
        sub: "u1",
        tenantId: "t1",
        roles: ["admin"],
        mfaCompleted: true,
      }),
      reflector(),
      new ActiveScopeResolver(fakePrisma(null))
    );
    await expect(
      Promise.resolve(
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({ headers: { authorization: "Bearer x" } }),
          }),
          getHandler: () => undefined,
          getClass: () => undefined,
        } as never)
      )
    ).rejects.toThrow(/legal entity|membership/i);
  });
});

// в”Ђв”Ђ (b) user whose membership does not match tenant/LE в”Ђв”Ђ
describe("red b: membership mismatch", () => {
  it("rejects active LE belonging to another tenant", async () => {
    const otherTenant = {
      legalEntityId: "le-other",
      legalEntity: { id: "le-other", tenantId: "t2" },
    };
    const guard = new TenantGuard(
      jwtOf({
        sub: "u1",
        tenantId: "t1",
        roles: ["admin"],
        mfaCompleted: true,
        activeLegalEntityId: "le-other",
      }),
      reflector(),
      new ActiveScopeResolver(fakePrisma(otherTenant))
    );
    await expect(
      Promise.resolve(
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({ headers: { authorization: "Bearer x" } }),
          }),
          getHandler: () => undefined,
          getClass: () => undefined,
        } as never)
      )
    ).rejects.toThrow(/membership|mismatch/i);
  });

  it("resolver throws selection-required when more than one membership", async () => {
    const prisma = {
      userLegalEntityMembership: {
        findFirst: async () => membershipRow,
        findMany: async () => [
          { legalEntityId: "le-1" },
          { legalEntityId: "le-9" },
        ],
      },
    } as never;
    await expect(
      new ActiveScopeResolver(prisma).membershipForLogin("t1", "u1")
    ).rejects.toThrow(MembershipError);
  });
});

// в”Ђв”Ђ (c) no caller may use tenantId as legalEntityId / backfill outside migration в”Ђв”Ђ
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}
describe("red c: duplicated scope ids in production code", () => {
  it("no backfillLegalEntityId() usage outside migration-only helpers", () => {
    const offenders = walk(SRC)
      .filter((f) => !f.includes(".spec.ts"))
      .filter((f) => !f.endsWith("scope.ts")) // definition site
      .filter((f) =>
        readFileSync(f, "utf8").includes("backfillLegalEntityId(")
      );
    expect(offenders).toEqual([]);
  });

  it("no `legalEntityId: tenantId` duplication in src", () => {
    const offenders = walk(SRC)
      .filter((f) => !f.includes(".spec.ts"))
      .filter((f) =>
        /legalEntityId:\s*(tenantId|order\.tenantId|r\.tenantId)\b/.test(
          readFileSync(f, "utf8")
        )
      );
    expect(offenders).toEqual([]);
  });
});
// ── (e) root token must not persist to any volume/file by bootstrap ──
describe("red e: root token persistence", () => {
  const repoRoot = join(__dirname, "..", "..", "..");
  it("sh-based OpenBao bootstrap removed — PowerShell-only lifecycle", () => {
    expect(existsSync(join(repoRoot, "infra", "openbao", "init.sh"))).toBe(
      false
    );
    expect(existsSync(join(repoRoot, "docker-compose.infra.yml"))).toBe(false);
  });

  it("local OpenBao is in-memory dev mode — no durable token volume", () => {
    const compose = readFileSync(join(repoRoot, "compose.local.yml"), "utf8");
    expect(compose).toMatch(/-dev/);
    // openbao service block must mount no volume (in-memory state only)
    const block = compose.slice(compose.indexOf("openbao:"));
    const svc = block.slice(
      0,
      block.search(/\n[a-z]/) === -1 ? block.length : block.search(/\n[a-z]/)
    );
    expect(svc).not.toMatch(/volumes:/);
  });
});

// ── (f) bootstrap errors hidden / unsafe local-stack artifacts ──
describe("red f: local-stack static policy", () => {
  const repoRoot = join(__dirname, "..", "..", "..");
  const files = [
    join(repoRoot, "compose.local.yml"),
    ...["up", "down", "status", "reset", "checks"].map((n) =>
      join(repoRoot, "scripts", `local-stack-${n}.ps1`)
    ),
    join(repoRoot, "scripts", "local-smoke.ps1"),
  ].filter((f) => existsSync(f));

  it("covers the accepted PowerShell stack artifacts", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it("no silently swallowed commands (`|| true`)", () => {
    const offenders = files
      .filter((f) => !f.endsWith("local-stack-checks.ps1")) // the checker references the pattern as a literal
      .filter((f) => /\|\|\s*true/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.split(/[\\/]/).pop())).toEqual([]);
  });

  it("no `latest` tags — images pinned by digest", () => {
    for (const f of files.filter((x) => x.endsWith(".yml"))) {
      const images = [
        ...readFileSync(f, "utf8").matchAll(/image:\s*(\S+)/g),
      ].map((m) => m[1]);
      expect(images.length).toBeGreaterThan(0);
      for (const img of images) expect(img).toMatch(/@sha256:[0-9a-f]{64}/);
    }
  });

  it("all host port bindings are loopback-only", () => {
    for (const f of files.filter((x) => x.endsWith(".yml"))) {
      const ports = [
        ...readFileSync(f, "utf8").matchAll(/-\s+"([^"]*\d+:\d+)"/g),
      ];
      for (const p of ports) {
        expect(p[1].startsWith("127.0.0.1:")).toBe(true);
      }
    }
  });

  it("no committed default service credentials", () => {
    for (const f of files) {
      const t = readFileSync(f, "utf8");
      expect(t).not.toMatch(/markflow123|RABBITMQ_DEFAULT_PASS/);
      expect(t).not.toMatch(/MINIO_ROOT_PASSWORD:\s*[A-Za-z0-9]/);
    }
  });
});
