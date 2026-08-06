#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/ghp_[A-Za-z0-9]{36}/, "GitHub PAT"],
  [/sk-[A-Za-z0-9]{20,}/, "OpenAI key"],
  [/postgresql:\/\/[^:]+:[^@]+@/, "hardcoded DB creds"],
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
const ALLOWLIST = [".env.example"]; // example env file is committed by design
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
