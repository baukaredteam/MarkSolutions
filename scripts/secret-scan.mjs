#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// W0-01b: patterns shared with config-validation.spec.ts for consistency
const PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/ghp_[A-Za-z0-9]{36}/, "GitHub PAT"],
  [/sk-[A-Za-z0-9]{20,}/, "OpenAI key"],
  [/postgresql:\/\/[^:]+:[^@]+@/, "hardcoded DB creds"],
  // W0-01b: generic credential-like literals in non-test files
  [/_PASSWORD\s*=\s*"[^"]{8,}"/, "likely hardcoded password"],
  [/_SECRET_KEY\s*=\s*"[^"]{8,}"/, "likely hardcoded secret key"],
  [/Bearer\s+eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT token literal"],
];

let files;
try {
  files = execSync("git diff --cached --name-only --diff-filter=ACM", {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
} catch {
  process.exit(0);
}

const hits = [];
const ALLOWLIST = [
  ".env.example",
  "apps/api/src/config-validation.ts",
  "apps/api/src/config-validation.spec.ts",
  "apps/api/src/config-validation.b.spec.ts",
  ".github/workflows/ci.yml", // CI test fixtures (not real secrets)
  "apps/api/src/db-bootstrap.spec.ts", // test validation logic
  "apps/api/src/prisma.service.ts", // validates DB URL format
  "apps/api/test/harness.ts", // test harness: DB URL validation fixtures
  "packages/db/src/seed.ts", // seed guards reference production URL pattern
  "packages/db/src/test-harness.ts", // test harness: DB URL validation fixtures
  "scripts/db-validate.mjs", // DB URL validation fixtures
  "scripts/demo-reset.mjs", // dev script references DB URL format
  "scripts/test-pg-start.mjs", // dev helper: test DB URL fixture
  "docs/production/MIGRATION_OPERATIONS.md", // documentation references
  "docs/production/W0-02_IMPLEMENTATION_PLAN.md", // documentation references
  "docs/production/W0-02_PRECHECK.md", // documentation references
  "docs/production/W0-02R_GATES_EVIDENCE.md", // documentation references
  "docs/production/W0-02R_GATES_PLAN.md", // documentation references
  "docs/production/W0-02R_FINAL_EVIDENCE.md", // documentation references
  "docs/production/W0-02R_FINAL_PLAN.md", // documentation references
];
for (const file of files) {
  if (ALLOWLIST.includes(file)) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [re, name] of PATTERNS) {
    if (re.test(content)) hits.push(`  ${file}: ${name}`);
  }
}

if (hits.length) {
  console.error("SECRET SCAN: possible secrets found:\n" + hits.join("\n"));
  console.error("Blocked: remove the secret before committing.");
  process.exit(1);
}
