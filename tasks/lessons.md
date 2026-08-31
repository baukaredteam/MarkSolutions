# Lessons

## 2026-08-31 — MPT auth healthcheck is human-on-VPS, not agent-on-STAGE

- Script may target STAGE when a human sources `~/.config/marksolutions/mpt.env`. Agents/CI must not HTTP-call markirovka; tests bind `127.0.0.1` and fail if a test URL hostname is `markirovka.kz`.
- Stdout is one line (`status=200|401|network` or `missing env`). Never print body, tokens, password, or which env key is missing.
- Do not wire `mpt:auth-healthcheck` into `npm test` / `verify` — CI has no credentials. Auth-only: no GET codes, utilisation, refresh, doc/*.

Цикл: после любой правки пользователя — одна запись сюда. Коротко: что сломалось / что поправили / как не повторять.

## 2026-08-31 — OPS journal already existed under /documents

- Gap matrix row 8 said `/operations` = StubPage. On factory after UI-shell/HOME it was a **redirect** to `/documents`; `docs.tsx` already listed import + withdrawal + utilisation via `GET /documents`. Fold into `/operations` (same component), do not duplicate two journals.
- Isolation AT must seed Prisma rows for **all three** types and assert tenant B list does not contain tenant A ids. Existing `documents.spec.ts` GET only checks types for one tenant.
- Do not add mutating ИС МПТ/STAGE for a journal slice: reuse `document.service.list` + existing utilisation POST. Wire `utilisation-form.tsx` as a route wrapper, do not rebuild the form.

## 2026-08-31 — TASK minimal: KPI source ≠ HOME-01 composite

- HOME-01 KPI «Требуют внимания» был суммой exceptions+ДТ+дедлайн+карточки без GTIN. TASK slice меняет **только число KPI** на `openTasks` (проекция Outbox FAILED + UtilisationAlert). Коды без нанесения остаются на карточке «Кодов в работе».
- Tenant AT для задач должен бить в HTTP list/create и `openTasks` другого tenant, не в отсутствие маршрута (404) и не в soft `toBeDefined()`. PR #5: false-green isolation недопустима.
- Materialize на GET/POST `/tasks` и на `dashboard.summary` — иначе KPI=0, пока никто не открыл Центр задач.

## 2026-08-31 — UI canon is the 16-module MARK FLOW mockup

- Visual contract = **manager 16-module MARK FLOW**, не старый v4-прототип (23 экрана, grouped nav).
- Канон: `docs/source/MARK_FLOW_16_modules_exact_layout_v2.html` (`openM(0)`…`openM(15)`, HOME-01), `docs/source/MarkSolutions_Detailed_Mockups_Final (1).md`, `docs/source/MarkSolutions_Detailed_Mockups_v2.html`, `docs/source/MARK_FLOW_Главная_финальная_v3.md`.
- Архив (не вести новый UI): `docs/ui-reference.html` + `docs/UI-SPEC.md` (v4, 2026-08-11).
- PR #4 уже выровнял `apps/web` nav на 16-модульный канон.

## 2026-08-31 — Factory review round (A → B+C → D)

- Оркестрация: **A** (Architect, docs-only gap matrix) → **B+C** параллельно (UI-Shell vs Catalog-Orders, без пересечения `apps/`) → **D** (MS-Reviewer: комментарии, без merge). Harith мержит, не ревьюер.
- Ревьюер не «чинит» чужие PR. Findings — только GitHub-комментарий. Свой PR — только `tasks/*`.
- `volumeL?: number` в CAT DTO — литры (физический объём), не деньги. Float-money stop-rule не применять, пока поле не идёт в биллинг/резерв.
- Tenant-isolation AT должен бить в tenant-check, не в более раннюю валидацию. `fixTnved` режет out-of-list ТНВЭД (`2710198100`) до `findFirst({ tenantId })` — тест зелёный даже без изоляции. Для mutate-AT слать in-list код (`2710198200`) и проверять, что чужой draft не изменился.
- Два Nest-инстанса `ModerationService`/`GtinResolver` (CatalogModule vs AppModule) — follow-up на `ModerationModule`, не stop-rule, пока оба ходят в Prisma с `tenantId`.
- Gap-matrix пути стареют в тот же час, когда UI-Shell меняет маршруты (`/codecheck` → `/search`, `/operations` → `/documents`). Снимок = SHA factory; после merge B матрицу A надо ребейзить или пометить superseded.

## 2026-08-31 — Cursor factory bootstrap

- На этом VPS нет Node/npm: `npx skills add …` и полный Archify renderer недоступны. Skills вендорены как `SKILL.md`; полный Archify/compound — ручная установка человеком после Node.
- Не ставить agentmemory/ai-memory без спроса. Файловая память = `tasks/todo.md` + этот файл.
- Windows-путь `C:\Users\Бауыржан\Desktop\MarkFlow` агенту недоступен: человек кладёт ТЗ/мокапы в `docs/source` или `fixtures`.
