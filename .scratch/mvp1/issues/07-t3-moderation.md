# 07 — T3-catalog-moderation: состояние после сессии (STOP)

**What to build:** машина состояний карточки (CAT-013, §8.2 ТЗ), трёхслойный GtinResolver (Q6), NktAdapter (мок, Q5) с асинхронной регистрацией, очередь/решения оператора.

**Blocked by:** 02 (T3-catalog-import) — ЗАКРЫТ, влит в main (`00fceb3`+`3749601`+`cc2d702`)

**Status:** реализация ЗАКОММИЧЕНА в worktree `feat/t3-moderation` (`b1fdd52`), НЕ слита в main. Ветка готова к ревью/мержу.

**Ветка:** `.worktrees/t3-moderation` @ `b1fdd52` на базе `bd7ab0c` (main). Рабочее дерево чистое.

---

## Что спроектировано и РЕАЛИЗОВАНО (закоммичено)

- **Схема/миграция** `20260807170000_t3_moderation`:
  - `GtinCache` (gtin unique, gcp, status VERIFIED|REJECTED|PENDING_REAL, brand, source seed|ig|manual).
  - `ProductCard` + `audit` (Json `[]`), `fieldReasons` (Json `{}`), `rejectedAttributes` (снапшот для resubmit-400), `ordersBlocked` (bool).
  - Partial unique index пересоздан после RedefineTables.
- **`shared/catalog-rules.ts`**: `verifyGtinMod10(gtin)` — контрольная цифра GTIN-14 (веса 3/1 справа налево). Юниты: RAVENOL/codes_success валидны, порча check digit → false, ≠14 цифр → false.
- **`integrations.ts`**: `IGs1Adapter`/`MockGs1Adapter` (mod10 → PENDING_REAL/REJECTED), `INktAdapter`/`MockNktAdapter` (submitProduct/getStatus, SLA `NKT_SLA_MS` default 3000, тест-хуки `nktResult: reject|hang`).
- **`gtin-resolver.ts`**: трёхслойный — слой 1 кэш (VERIFIED→OK, REJECTED→отказ), слой 2 IG (upsert в кэш, source=ig), слой 3 manual (source=manual, VERIFIED).
- **`moderation.service.ts`** — машина CAT-013:
  - Статусы: DRAFT→VALIDATING→SUBMITTED→IN_REVIEW→APPROVED/NEEDS_CORRECTION/REJECTED→REGISTERING→REGISTERED.
  - Каждый переход пишет `{at, actor, action, comment}` в `card.audit`.
  - `submitCard` (tenant): Draft/Needs Correction → Validating → авто-валидация (ярус A + ТНВЭД-гейт ADR-022 + GtinResolver) → Submitted / Needs Correction. Resubmit без исправления помеченных полей → **400** (сверка с `rejectedAttributes`).
  - `queue(status?, tenantId?)`: Submitted/In Review across all tenants.
  - `approve` (оператор): → In Review → Approved + outbox `nkt-register`.
  - `reject` (оператор): обязательные `fieldReasons` → Needs Correction + снапшот.
- **`outbox-poller.ts`**: Approved→Registering→Registered асинхронно; `REQUIRE_GS1_VERIFIED_FOR_REGISTERING` (default false); timeout→outbox FAILED→`/moderation/exceptions` (ID-017); отказ НКТ→Needs Correction с field-level ошибками.
- **`moderation.controller.ts`**: `GET /moderation/queue?tenantId=`, `GET /moderation/exceptions`, `POST /moderation/:id/approve|reject` — все `@Roles("operator")`.
- **`seed.service.ts`**: идемпотентный seed — оператор `operator@markflow` (tenantId null, roles ["operator"]), gtin_cache RAVENOL 04014835723399 + codes_success 04870267100135 (VERIFIED, source=seed). try/catch: пустая БД (seam-тесты) → warn+skip.
- **Auth/guard**: `AuthService.login` разрешает оператора без tenant; `TenantGuard` пропускает роль operator с `tenantId:null`; tenant-scoped эндпоинты `/products/*` и `/demo/*` → **403** для оператора.
- **Web**: бейдж «GTIN подтверждён вручную» в `products.tsx` (при `proposed.gtinManual`).
- **Тесты** (11 в `apps/api/test/moderation.spec.ts`): полный путь, AT-03 (ярус A), AT-04 (GTIN/НТИН+версия), reject/resubmit-400, GtinResolver mod10, NKT отказ, REQUIRE_GS1, NKT timeout→exceptions, оператор-403, login оператора, seed gtin_cache. + 4 mod10 в shared + 1 web-бейдж.

**Гейты (последний прогон):** 80/80 тестов (17 файлов), typecheck 0, lint 0, secret-scan 0, vite build 0. Коммит прошёл pre-commit.

## Что НЕ начато / отложено (осознанно, ponytail)

- **Ревью и мерж**: ветка не прошла /ocr-review, нет диф-ревью на сильной модели, не влита в main; после мержа — npm install + prisma generate + полный гейт на merged main, удаление worktree/ветки.
- **Ручной ввод GTIN как отдельный endpoint** (слой 3 доступен через `resolve(gtin, true)` в сервисе, но API/кнопка в web не выведены) — вывести вместе с UI карточки.
- **Задача сверки (reconciliation) оператору**: critical расхождение устанавливает `ordersBlocked`, но отдельная задача на дашборд (ID-017) и блокировка НОВЫХ заказов КМ по карточке — при появлении заказов КМ (C5/W3).
- **Daily cron синхронизации gtin_cache** — после боевого доступа GS1.
- **`REQUIRE_GS1_VERIFIED_FOR_REGISTERING`** реализован и покрыт тестом, но включается только через env.

## Список из 11 подзадач (план реализации тикета)

1. Миграция t3_moderation: GtinCache, ProductCard.audit/fieldReasons/rejectedAttributes/ordersBlocked + восстановление partial unique.
2. shared: `verifyGtinMod10` + юнит-тесты (RAVENOL, codes_success, порча, длина).
3. `integrations.ts`: IGs1Adapter + MockGs1Adapter (mod10), INktAdapter + MockNktAdapter (SLA, reject/hang).
4. GtinResolver: слой кэш → IG → manual, upsert gtin_cache, флаг REQUIRE_GS1_VERIFIED_FOR_REGISTERING.
5. Машина модерации CAT-013 + аудит переходов (author/time/comment).
6. Needs Correction + fieldReasons + rejectedAttributes + resubmit-400.
7. Очередь `/moderation/queue?tenantId=` + approve/reject + `/moderation/exceptions`.
8. Автоматизация Validating→Submitted (ярус A + ТНВЭД-гейт + GtinResolver) → Needs Correction.
9. OutboxPoller: Registering→Registered (SLA), timeout→FAILED→ID-017, отказ→Needs Correction.
10. Seed: operator@markflow + gtin_cache (RAVENOL/codes_success); auth/guard для роли operator без tenant + 403 на tenant-данные.
11. AT-03/AT-04 тесты, web-бейдж «GTIN подтверждён вручную», полный гейт + коммит.

## Следующий шаг (когда продолжим)

`/verification-before-completion` (повторно) → `/ocr-review` → `/requesting-code-review` на сильной модели → `/finishing-a-development-branch` (merge в main + гейты на merged + cleanup worktree/ветку + ROADMAP + opencode-mem).

---

## /ocr-review коммита b1fdd52 (07.08)

### HIGH — исправлены отдельным коммитом `772fe68` (не amend)

1. **Формат аудита** не соответствовал acceptance: писалось `{at, actor, action, comment}` вместо требуемого `{author, at, from, to, comment}`. Исправлено: `AuditEntry = {author, at, from, to, comment}`, все переходы через `recordTransition(from, to, ...)`. Тест проверяет путь без «прыжков»: `DRAFT→VALIDATING→SUBMITTED→IN_REVIEW→APPROVED`.
2. **Идемпотентность approve**: повторный approve на `APPROVED` создавал второй outbox → дубль регистрации в НКТ. Исправлено: на `APPROVED` возвращаем как есть, outbox не дублируется. Тест: `nktRows.length === 1`.
3. **Миграция теряла индекс** `ProductCard_tenantId_gtin_idx` при `DROP TABLE`/RedefineTables. Исправлено: `CREATE INDEX` добавлен в миграцию + применён к dev.db.
4. **Poller читал env при конструировании** (`readonly pollMs/timeoutMs/requireGs1Verified`) → конфиг-флаги не менялись без перезапуска, и тесты REQUIRE_GS1/timeout проходили ложноположительно (лов чужой FAILED-строки). Исправлено: геттеры читают env на каждом тике; `setInterval`→самоперезапускаемый `setTimeout`; тесты ищут outbox-строку **по `payload.cardId`** + проверяют `status==="FAILED"` и `card.status !== "REGISTERED"`.
5. **Resubmit после авто-валидации**: `validateForSubmit` не писал `rejectedAttributes` → после исправления полей повторная отправка навсегда = 400. Исправлено: снапшот пишется и при авто-валидации; сравнение значения со снапшотом (отсутствие в снапшоте = пусто тогда).

### Некритичные (не исправлены, принято как есть)

- `apps/api/src/outbox-poller.ts` — `poll()` глотает ошибки (`catch(e => void e)`): ок для MVP, при реальном НКТ добавить метрику/лог.
- `MockNktAdapter.ntin` — синтетический `0{gtin}001`; реальный формат НТИН — по контракту НКТ (Q5 мок).
- `ModerationController.exceptions` — `take: 50` без пагинации; при росте добавить курсор.
- `GtinResolver` слой 2 пишет в кэш даже при хите `PENDING_REAL` (лишний upsert) — идемпотентно, не критично.
- `SeedService.seed()` — 2 отдельных `findUnique`+`create` на GTIN; можно `upsert` одним запросом (микрооптимизация).
- web-бейдж: `gtinManual` пока не выставляется API при создании draft (только чтение флага) — выводить вместе с реальным потоком ручного ввода GTIN.
