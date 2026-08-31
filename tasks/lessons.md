# Lessons

Цикл: после любой правки пользователя — одна запись сюда. Коротко: что сломалось / что поправили / как не повторять.

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
