// W0-02R: strict dependency audit policy.
// Fails CLOSED on any high/critical vulnerability that is NOT in the documented
// exception register (scripts/audit-exceptions.json). Never `|| true`.
//
// Usage: node scripts/audit-policy.mjs

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const exceptions = JSON.parse(
  fs.readFileSync(path.join(__dirname, "audit-exceptions.json"), "utf8")
);
const exemptNames = new Set(exceptions.map((e) => e.package));

let raw;
try {
  raw = execSync("npm audit --json", { encoding: "utf8" });
} catch (e) {
  // npm audit exits non-zero when vulnerabilities exist; the JSON is on stdout.
  raw = e.stdout || "";
}
if (!raw || !raw.trim()) {
  console.log("audit-policy: PASS (npm audit produced no report)");
  process.exit(0);
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error("audit-policy: could not parse npm audit JSON output");
  process.exit(1);
}

const vulns = report.vulnerabilities || {};
const nonExempt = [];
for (const [name, v] of Object.entries(vulns)) {
  const severity = v.severity;
  if (severity !== "high" && severity !== "critical") continue;
  if (exemptNames.has(name)) {
    console.log(`audit-policy: exempt ${name} (${severity}) — documented in register`);
    continue;
  }
  nonExempt.push({ name, severity });
}

if (nonExempt.length > 0) {
  console.error("audit-policy: FAILED — non-exempt high/critical vulnerabilities:");
  for (const n of nonExempt) {
    console.error(`  - ${n.name} (${n.severity})`);
  }
  console.error(
    "Add an owner+expiry exception to scripts/audit-exceptions.json, or upgrade the dependency."
  );
  process.exit(1);
}

console.log(
  "audit-policy: PASS — no non-exempt high/critical vulnerabilities"
);
process.exit(0);
