# Factory setup — Cursor Ultra

## Open factory PRs (2026-08-31, not merged)

- [ ] PR #3 Architect — `docs/agents/module-gap-matrix.md` — **open / not merged**. MS-Reviewer: ready to merge (docs-only). Harith merges.
- [ ] PR #4 UI-Shell — `feature/ui-shell-16-modules` — **open / not merged**. MS-Reviewer: ready to merge (web-only, no fake API). Harith merges.
- [ ] PR #5 Catalog-Orders — `feature/catalog-orders-skeleton` — **open / not merged**. MS-Reviewer: **not ready** — fix-tnved mutate AT is false-green (out-of-list ТНВЭД). Harith merges after AT fix.

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
