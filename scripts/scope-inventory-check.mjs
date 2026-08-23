#!/usr/bin/env node
// W0-03a pt3 (ADR-027) — CI gate: every Prisma model that carries `tenantId`
// MUST have a classification row in docs/production/W0-03A_SCOPE_INVENTORY.md.
import { readFileSync } from "node:fs";

const schema = readFileSync("packages/db/prisma/schema.prisma", "utf8");
const doc = readFileSync(
  "docs/production/W0-03A_SCOPE_INVENTORY.md",
  "utf8"
);

const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([^}]*)\}/gm)].map(
  (m) => ({ name: m[1], body: m[2] })
);
const tenantModels = models.filter((m) =>
  /(^|\n)\s*tenantId\s+String/.test(m.body)
).map((m) => m.name);

const rows = new Set(
  [...doc.matchAll(/^\|\s*`(\w+)`\s*\|/gm)].map((m) => m[1])
);

const missing = tenantModels.filter((t) => !rows.has(t));
if (missing.length > 0) {
  console.error(
    `scope-inventory CHECK FAILED: tenant-bearing models missing inventory rows:\n` +
      missing.map((m) => `  - ${m}`).join("\n")
  );
  process.exit(1);
}
console.log(
  `scope-inventory OK: ${tenantModels.length}/${models.length} tenant-bearing models classified`
);
