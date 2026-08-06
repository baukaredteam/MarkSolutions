#!/usr/bin/env node
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
for (let i = 0; i + 3 < args.length; i += 4) {
  const [, , remoteRef] = args.slice(i, i + 4);
  if (remoteRef === "refs/heads/main" || remoteRef === "refs/heads/master") {
    console.error(
      `BLOCKED: direct push to ${remoteRef} is not allowed. Open a pull request instead.`
    );
    process.exit(1);
  }
}
process.exit(0);
