import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TenantGuard } from "./guards";
import { Reflector } from "@nestjs/core";
import { ActiveScopeResolver, MembershipError } from "./active-scope.resolver";

// W0-03a part 2 diagnosing phase — red-capable reproductions. Each test names
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

// ── (a) JWT without activeLegalEntityId must not reach a protected route ──
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

// ── (b) user whose membership does not match tenant/LE ──
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

// ── (c) no caller may use tenantId as legalEntityId / backfill outside migration ──
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
  it("bootstrap strips root_token from persisted state", () => {
    const initPath = join(
      __dirname,
      "..",
      "..",
      "..",
      "infra",
      "openbao",
      "init.sh"
    );
    if (!existsSync(initPath)) return; // slice 4 removes docker-based bootstrap
    const text = readFileSync(initPath, "utf8");
    expect(
      /sed[^|]*root_token|root_token.*delete|jq\s+del\(.?root_token/.test(text)
    ).toBe(true);
    expect(/>\s*\$?ROOT_FILE|>\s*\/bao\/data\/root-token/.test(text)).toBe(
      false
    );
  });
});

// ── (f) bootstrap errors hidden by `|| true` / mutable tags / 0.0.0.0 ──
describe("red f: local-stack static policy", () => {
  const roots = [
    join(__dirname, "..", "..", "..", "scripts"),
    join(__dirname, "..", "..", "..", "infra"),
  ];
  const files = roots.flatMap((r) =>
    existsSync(r)
      ? readdirSync(r)
          .filter((n) => /\.(ps1|mjs|hcl|ya?ml|sh)$/.test(n))
          .map((n) => join(r, n))
      : []
  );

  it("no silently swallowed commands (`|| true`)", () => {
    const offenders = files.filter((f) =>
      /\|\|\s*true/.test(readFileSync(f, "utf8"))
    );
    expect(offenders.map((f) => f.split(/[\\/]/).pop())).toEqual([]);
  });

  it("no `latest` image tags in tracked infra", () => {
    const offenders = files.filter((f) =>
      /image:\s*\S+:latest\b/.test(readFileSync(f, "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("no committed default service credentials in infra compose", () => {
    const yml = join(__dirname, "..", "..", "..", "docker-compose.infra.yml");
    if (!existsSync(yml)) return; // removed by slice 4
    const t = readFileSync(yml, "utf8");
    expect(
      /DEFAULT_PASS|RABBITMQ_DEFAULT_USER|MINIO_ROOT_PASSWORD/.test(t)
    ).toBe(false);
  });
});
