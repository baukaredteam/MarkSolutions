# Factory setup — Cursor Ultra

## Factory PRs (2026-08-31)

- [x] PR #3 Architect — `docs/agents/module-gap-matrix.md` — **squash-merged** into `chore/cursor-agent-factory`.
- [x] PR #4 UI-Shell — `feature/ui-shell-16-modules` — **squash-merged** into `chore/cursor-agent-factory`.
- [x] PR #5 Catalog-Orders — `feature/catalog-orders-skeleton` — **squash-merged** into `chore/cursor-agent-factory`.
- [x] PR #6 MS-Reviewer docs close-out — **squash-merged** into `chore/cursor-agent-factory`.
- [x] PR #7 HOME-01 + dark navy sidebar — **squash-merged** into `chore/cursor-agent-factory`.
- [x] PR #8 TASK minimal — **squash-merged** into `chore/cursor-agent-factory` (sha 754970f).

## OPS journal slice (2026-08-31)

- [x] `/operations` — real journal (reuse `docs.tsx`), not StubPage; `/documents` same page (no second journal)
- [x] `GET /operations` alias of tenant-scoped `GET /documents` (import + withdrawal + utilisation)
- [x] `utilisation-form.tsx` routed at `/operations/utilisation`; link from journal
- [x] Honest tenant-isolation AT: `apps/api/test/ops-journal-tenant-isolation.spec.ts`
- [ ] Full OPS-01…29 (create wizard, DT, act of acceptance AT-14, bulk, aggregation-from-journal) — out of slice
- [x] Draft PR `feature/ops-journal-slice` → `chore/cursor-agent-factory` — https://github.com/baukaredteam/MarkSolutions/pull/9 opened, **do not merge**

## Статус: done (2026-08-31)

- [x] 1. Структура: `tasks/`, `.cursor/rules/`, `.cursor/skills/`, `docs/agents/`
- [x] 2. Переписать `AGENTS.md` (Cursor Ultra + Grok Bot, без OpenCode)
- [x] 3. Rules `00`–`04`
- [x] 4. Skills (project-local SKILL.md + `markirovka-integration`; npx отложен — нет Node)
- [x] 5. Память: `tasks/todo.md` + `tasks/lessons.md`
- [x] 6. `.cursorignore`
- [x] 7. Шапка `CONTEXT.md`
- [x] 8. Хендофф в чате: файлы, ручные команды, чеклист первой задачи

Не делалось (намеренно): docker/prod, commit, npx skills, Compound plugin install, agentmemory.
