---
name: grinding-until-pass
description: Keep iterating on code changes until the tests pass, the build succeeds, or linting is clean. Runs in a tight loop of fix → run → check → repeat.
---

# Grind Until Pass

Goal command for this repo (when Node exists): `npm run verify` or targeted `npx vitest run <file>`.

Loop: run → if fail, minimal fix of first error → rerun. Max 10 iterations then stop for human.

- Do not delete tests. Do not `@ts-ignore` / eslint-disable to silence.
- If error count rises, stop and reassess.
- Do not grind by calling ИС МПТ mutating endpoints.
