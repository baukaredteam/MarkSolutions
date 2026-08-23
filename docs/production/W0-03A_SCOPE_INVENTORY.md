# W0-03a Scope Inventory (ADR-027)

Классификация каждой модели Prisma-схемы по scope-дисциплине. Правило: модель
с колонкой `tenantId` ОБЯЗАНА иметь строку в этой таблице (проверяется
`scripts/scope-inventory-check.mjs`; CI-гейт).

Классы:

- **dual-scoped now** — несёт `(tenantId, legalEntityId)`, composite FK
  `→ LegalEntity(id, tenantId) ON DELETE RESTRICT`; все чтения/записи через
  validated ActiveLegalEntityScope (`scopeWhere`). `legalEntityId` NOT NULL.
- **parent-scoped with enforced parent predicate** — собственного
  `legalEntityId` нет; доступ только через родителя, который dual-scoped;
  предикат родителя enforced в каждом запросе.
- **global/platform** — данные платформы/справочники; бизнес-скоуп не применим.

| Model                       | Classification                               | Rationale                                                                                                                                       |
| --------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tenant`                    | global/platform                              | Корень владения данными; сам скоупом не является.                                                                                               |
| `LegalEntity`               | global/platform                              | Единица скоупа; уникальность `(id, tenantId)` — якорь composite FK.                                                                             |
| `UserLegalEntityMembership` | global/platform                              | Отношение пользователь↔юрлицо; источник авторизации, не защищаемые бизнес-данные.                                                               |
| `User`                      | global/platform                              | Учётная запись; членства дают доступ к юрлицам.                                                                                                 |
| `Application`               | global/platform                              | Заявка на онбординг до существования tenant/LE.                                                                                                 |
| `Account`                   | dual-scoped now                              | Отдельные балансы юрлиц (mockup); composite FK + RESTRICT.                                                                                      |
| `LedgerEntry`               | dual-scoped now                              | Финансовая проводка юрлица; evidence не отсоединяется (RESTRICT).                                                                               |
| `Invoice`                   | dual-scoped now                              | Счёт выставляется юрлицу.                                                                                                                       |
| `Product`                   | dual-scoped now                              | Черновой товар юрлица.                                                                                                                          |
| `ProductCard`               | dual-scoped now                              | Источник истины каталога; files-дескрипторы наследуют скоуп карточки.                                                                           |
| `DraftProposal`             | dual-scoped now                              | Черновик из каналов юрлица.                                                                                                                     |
| `Order`                     | dual-scoped now                              | Заказ КМ юрлица; создаётся из validated scope.                                                                                                  |
| `OrderLine`                 | dual-scoped now                              | Строка заказа; `tenantId` добавлен (backfill от Order) + composite FK — рассинхрон невозможен в PostgreSQL.                                     |
| `CodeVault`                 | dual-scoped now                              | Секретная часть КМ; AAD конверта связывает (org, LE, objectId=строка Vault).                                                                    |
| `CodeEvent`                 | dual-scoped now                              | Append-only журнал статусов КМ юрлица.                                                                                                          |
| `VaultExport`               | dual-scoped now                              | Аудит выдачи/печати КМ (CV-032).                                                                                                                |
| `UtilisationReport`         | dual-scoped now                              | Отчёт о нанесении по заказу юрлица.                                                                                                             |
| `ImportDocument`            | dual-scoped now                              | ДТ на партию юрлица; unique `(tenantId, customsNumber)`.                                                                                        |
| `WithdrawalDocument`        | dual-scoped now                              | Вывод из оборота юрлица.                                                                                                                        |
| `AggregationUnit`           | dual-scoped now                              | Транспортная упаковка SSCC юрлица.                                                                                                              |
| `AggregationMember`         | dual-scoped now                              | Член агрегата; скоуп наследует агрегат, но продублирован колонками.                                                                             |
| `UtilisationAlert`          | parent-scoped with enforced parent predicate | Алерт привязан к `orderId`; читается только вместе с родительским Order (dual-scoped); собственный LE-суффикс избыточен для read-model таймера. |
| `Outbox`                    | parent-scoped with enforced parent predicate | Платформенная очередь; protected-происхождение фиксируется immutable payload-scope (`tenantId` в payload), авторизация по нему НЕ проводится.   |
| `MptOrder`                  | parent-scoped with enforced parent predicate | Зеркало симулятора ИС МПТ; ключ `externalId = orderId` внутреннего dual-scoped заказа.                                                          |
| `MptCode`                   | parent-scoped with enforced parent predicate | Коды симулятора; принадлежат MptOrder (см. выше).                                                                                               |
| `MptUtilisation`            | parent-scoped with enforced parent predicate | Отчёты симулятора; `reportId` коррелирует с dual-scoped UtilisationReport.                                                                      |
| `MptDocument`               | parent-scoped with enforced parent predicate | Документы симулятора; коды ссылаются на dual-scoped CodeVault.                                                                                  |
| `Tariff`                    | global/platform                              | Политика цен платформы (ADR-024: тариф не привязан к юрлицу до появления требования).                                                           |
| `GtinCache`                 | global/platform                              | Общий справочник GTIN (кэш резолвера).                                                                                                          |
| `SsscCounter`               | parent-scoped with enforced parent predicate | Tenant-счётчик последовательностей SSCC; уникальность `(tenantId)`; генерация SSCC всегда в контексте dual-scoped AggregationUnit.              |

## Verification

- Composite FK: миграции `20260822230000_w0_03a_scope_invariants`,
  `20260823090000_w0_03a_orderline_scope`.
- NOT NULL: включён в инвариантную миграцию ниже после verified backfill.
- Регрессионные тесты: `apps/api/test/scope-fk.spec.ts`
  (cross-tenant rejection / retention / zero-mismatch verification),
  `apps/api/test/scope-completeness.red.spec.ts` (cross-LE card read, clone LE).
- CI-гейт: `npm run scope:check` — каждая модель с `tenantId` обязана иметь строку здесь.
