# Production Baseline

## Referenced baseline

Product owner requested that the historical reference point be commit [`30f182b554fe8380498f722b0afffa99a11cba42`](https://github.com/baukaredteam/MarkSolutions/commit/30f182b554fe8380498f722b0afffa99a11cba42):

```text
feat: UI-04 — Orders+Vault по UI-SPEC §4.6/4.7
2026-08-14T21:24:29+06:00
```

This commit is a **review baseline**, not the production target. It represents Orders/Vault UI work before later main-branch improvements and before the production roadmap in `docs/production/`.

## Current branch context at roadmap creation

The fetched `main` head was `d1d3aaa`, which includes later invoice, money-in-tiyn, 1ecom and integration changes. The working tree also contained uncommitted changes affecting MPT adapter, billing settlement, order payload, utilisation, Prisma schema/migration and smoke tooling.

Those uncommitted changes are deliberately excluded from this documentation package. They must be reviewed, tested and committed in a separate work package with an explicit migration plan. Do not mix them with the roadmap/documentation commit.

## Safe commit procedure

1. Review only `AGENTS.md` and `docs/production/**` for the documentation commit.
2. Run `git diff --check -- AGENTS.md docs/production`.
3. Stage only those files; never use `git add .` while unrelated MPT/billing worktree changes exist.
4. Commit with a message such as `docs: add production roadmap and OpenCode work-package prompts`.
5. Push only after an explicit review of `git status --short` and `git diff --cached --stat`.

## Baseline confirmation checklist

| Check | Expected result |
|---|---|
| Historical baseline resolves | `git show 30f182b...` returns UI-04 Orders/Vault commit |
| Main branch checked | Current `main` head recorded in work log |
| Local worktree isolated | No unrelated source files staged with production docs |
| Roadmap source of truth | `AGENTS.md` and `docs/production/ROADMAP.md` read before every work package |
| No secret material committed | `npm run secret-scan` passes before commit |
