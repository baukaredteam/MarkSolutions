# AUDIT-BACKEND — сплошной аудит MarkFlow против ТЗ v2.0

**Дата:** 2026-08-11
**Роль:** lead-architect-аудитор
**Источники истины (приоритет):**

1. `docs/source/Техническое_задание_ИС_MarkFlow_версия_2.0.md` — ТЗ v2.0
2. `docs/RULES-MM.md` — Правила 44-н/қ
3. `docs/CONTRACT-IS-MPT.md` — xTrace ver 1.0
4. `docs/DECISIONS.md` (ADR-001…025) + `CONTEXT.md`
   **Область:** backend `apps/api` + БД `packages/db`. Без веб-UI, без прод-контура — это отдельный аудит.

---

## 1. Executive Summary

MarkFlow на стадии «MVP-1 закрыт» для демо 31.08–01.09. Закрытые домены: REG, CAT/ID, ORD, CV, LBL, DOC (import/withdrawal), BILL (частично). Симулятор ИС МПТ покрывает 6 из 18 разделов спецификации xTrace.

**Главные дыры к демо 31.08 (см. §7 P0):**

- IAM-roles **не действуют**: ни один бизнес-эндпоинт кроме `/api/admin/probe` не использует `@Roles` — RBAC из ТЗ §6.2/§4.2 **не реализован**.
- Машина статусов КМ (ТЗ §8.4) покрывает 7 из 14 канонических статусов, отсутствует поле `externalStatus`.
- IAM §8.1 Tenant-машина **отсутствует** (только PENDING|ACTIVE|REJECTED).
- 4 из 18 AT не покрыты: AT-10, AT-14, AT-15, AT-17, AT-18.

**Готовность к демо 31.08:** ✅ Все 5 пунктов CONTEXT §1 покрыты. ⚠️ Требует ручной проверки переходов по deep-link дашборда.

---

## 2. Покрытие требований ТЗ

| ID           | Требование                                           | Статус | Ссылка                                                              | Комментарий                                    |
| ------------ | ---------------------------------------------------- | ------ | ------------------------------------------------------------------- | ---------------------------------------------- |
| **REG-001**  | Создание заявки с дубль-проверкой                    | ✅     | `apps/api/src/onboarding.controller.ts`, `onboarding.spec.ts:AT-02` | —                                              |
| **REG-002**  | Проверка регистрации во внешней системе              | 🟡     | `ecom.adapter.ts`, `onboarding.service`                             | MockEcomAdapter; retry-политика не реализована |
| **REG-003**  | Создание tenant + лицевого счёта атомарно            | ✅     | `onboarding.controller.ts`                                          | —                                              |
| **REG-004**  | Приглашение пользователей со сроком действия         | ❌     | —                                                                   | CONTEXT: «вне демо»                            |
| **REG-005**  | Suspended/Closing/Closed                             | ❌     | `Tenant.status` = `PENDING                                          | ACTIVE                                         | REJECTED` | §8.1-машина не реализована |
| **IAM-006**  | MFA для admin/operator/КМ-доступа                    | 🟡     | `guards.ts:77`, JWT mfaCompleted                                    | TOTP/2FA — нет                                 |
| **IAM-007**  | RBAC + ABAC                                          | ❌     | `guards.ts`, `app.module.ts`                                        | `@Roles` только в `AdminController.probe`      |
| **IAM-008**  | TTL/idle/concurrent sessions                         | 🟡     | `auth.service.ts` (expiresIn 1h)                                    | revoke-all, idle — нет                         |
| **IAM-009**  | Сервисные учётки (API-client scopes)                 | ❌     | —                                                                   | —                                              |
| **CAT-010**  | Конфигурируемая модель атрибутов                     | 🟡     | `packages/shared/src/motor-oil.ts`                                  | Только моторные масла                          |
| **CAT-011**  | Черновик и версии карточки                           | 🟡     | `schemaVersion`                                                     | Suspended/New Version — нет                    |
| **CAT-012**  | CSV/XLSX/JSON импорт                                 | 🟡     | `seedInvoice` (fixtures)                                            | CSV/XLSX — нет                                 |
| **CAT-013**  | Модерация (Draft→…→Registered)                       | ✅     | `moderation.service.ts`, `moderation.spec.ts:AT-03/04`              | —                                              |
| **CAT-014**  | Дубликаты по GTIN/fuzzy                              | 🟡     | `catalog.controller.ts:createCard`                                  | —                                              |
| **ID-015**   | Запрос GTIN                                          | 🟡     | `MockGs1Adapter` + `gtin-resolver.ts`                               | Мок                                            |
| **ID-016**   | Регистрация в НКТ                                    | ✅     | `MockNktAdapter`, `moderation.spec.ts`                              | —                                              |
| **ID-017**   | Сверка идентификаторов                               | 🟡     | `gtin-resolver.ts`                                                  | Периодическая сверка — частично                |
| **BILL-018** | Double-entry                                         | ✅     | `billing.service.ts`, `billing.spec.ts`                             | —                                              |
| **BILL-019** | Резерв при создании заказа                           | ✅     | `order.service.ts:create`                                           | AT-06 (402)                                    |
| **BILL-020** | Момент списания конфигурируемый                      | 🟡     | `Tariff` (period, currency)                                         | Момент = SETTLE при utilisation SUCCESS        |
| **BILL-021** | Пополнение и сверка (банк/1С)                        | 🟡     | `billing.controller.ts:POST /payments/import`                       | Банк — нет                                     |
| **BILL-022** | Возврат/корректировка (2 согласования)               | ❌     | —                                                                   | AT-15 — нет                                    |
| **BILL-023** | Тарифы                                               | 🟡     | `Tariff`                                                            | Rounding rules — нет                           |
| **ORD-024**  | Формирование заказа                                  | ✅     | `order.service.ts:create`                                           | —                                              |
| **ORD-025**  | Идемпотентность                                      | ✅     | `order.service.ts`                                                  | AT-07                                          |
| **ORD-026**  | Машина заказа                                        | 🟡     | `order.service.ts`, `outbox-poller.ts`                              | Unknown/Reconciling/Manual Review — нет        |
| **ORD-027**  | Частичный результат                                  | 🟡     | `outbox-poller.ts:reconcileOrder`                                   | Только quantity-mismatch                       |
| **ORD-028**  | Отмена                                               | ✅     | `order.service.ts:cancel`                                           | —                                              |
| **ORD-029**  | Сверка                                               | ✅     | `outbox-poller.ts`                                                  | —                                              |
| **CV-030**   | Шифрование КМ                                        | ✅     | `kms.adapter.ts`                                                    | —                                              |
| **CV-031**   | Маскирование                                         | ✅     | `vault.service.ts:maskOf`                                           | —                                              |
| **CV-032**   | Учёт выдачи                                          | 🟡     | `VaultExport` + `LabelService`                                      | —                                              |
| **CV-033**   | Антиэксфильтрация (квоты, MFA на КМ, 2 согласования) | ❌     | —                                                                   | —                                              |
| **LBL-034**  | Конструктор шаблонов                                 | ❌     | —                                                                   | Шаблон фиксирован                              |
| **LBL-035**  | ZPL/EPL/TSPL/PDF                                     | ❌     | —                                                                   | Только PNG                                     |
| **LBL-036**  | DPI/размеры                                          | 🟡     | `bwip-js:scale:4`                                                   | Параметры захардкожены                         |
| **LBL-037**  | Валидация Data Matrix                                | 🟡     | `label.spec.ts:roundtrip`                                           | Эталонного сканера нет                         |
| **LBL-038**  | Задание печати                                       | 🟡     | `LabelService.print`                                                | Контроль повторов — нет                        |
| **LBL-039**  | Локальный агент печати                               | ❌     | —                                                                   | —                                              |
| **LBL-040**  | Брак и повторная печать                              | ✅     | `label.service.ts:reprint`                                          | AT-11                                          |
| **WMS-041**  | Приёмка                                              | ❌     | —                                                                   | —                                              |
| **WMS-042**  | Нанесение и отчёт                                    | 🟡     | `POST /codes/:codeKey/apply` + `UtilisationService`                 | —                                              |
| **WMS-043**  | Агрегация + AT-13                                    | 🟡     | `AggregationUnit/Member`, `documents.spec.ts:childrenWriteOff`      | Создание агрегатов — нет                       |
| **WMS-044**  | Брак/перемаркировка                                  | 🟡     | `WITHDRAWN`/`WRITTEN_OFF`                                           | REMARK — нет                                   |
| **WMS-045**  | Отгрузка                                             | ❌     | —                                                                   | —                                              |
| **WMS-046**  | Инвентаризация                                       | ❌     | —                                                                   | —                                              |
| **WMS-047**  | Офлайн-режим                                         | ❌     | —                                                                   | Could в ТЗ                                     |
| **DOC-048**  | Уведомление о ввозе                                  | ✅     | `document.service.ts:submitImport`                                  | —                                              |
| **DOC-049**  | Акт приёма-передачи                                  | 🟡     | `submitImport`                                                      | «Подтверждение/отклонение» — нет               |
| **DOC-050**  | Версии и архив                                       | 🟡     | `createdAt`                                                         | —                                              |
| **DOC-051**  | ЭЦП                                                  | ❌     | —                                                                   | Фаза 3                                         |
| **NTF-052**  | Многоканальные уведомления                           | 🟡     | `useToast`                                                          | Email/SMS — нет                                |
| **NTF-053**  | События                                              | 🟡     | `Outbox`                                                            | —                                              |
| **NTF-054**  | Retry/backoff/DLQ                                    | 🟡     | `outbox.processedAt/FAILED`                                         | Нет retry-поллера                              |
| **SUP-055**  | Заявки                                               | ❌     | —                                                                   | —                                              |
| **SUP-056**  | Безопасная диагностика                               | 🟡     | `TenantGuard` + маскирование КМ                                     | Временный доступ — нет                         |
| **SEC-057**  | Неизменяемый аудит                                   | 🟡     | `CodeEvent` append-only                                             | Глобальный AuditEvent — нет                    |
| **SEC-058**  | События безопасности                                 | 🟡     | `req.actor, tenantId, mfaCompleted`                                 | IP/device не фиксируется                       |

**Итого: ✅ 16, 🟡 24, ❌ 16.** Готовность к демо 31.08 — соответствует 5 пунктам CONTEXT §1.

---

## 3. Срез A — Контракт ИС МПТ

### A.1 Реализованные эндпоинты (MockMptAdapter)

| Спека xTrace             | Метод MarkFlow                      | Тест                                              |
| ------------------------ | ----------------------------------- | ------------------------------------------------- |
| POST /api/orders         | `createOrder`                       | `mpt-simulator.spec.ts`, `order.spec.ts:AT-06/07` |
| GET /api/orders (sub)    | `getOrder` — только status+quantity | `order.spec.ts`                                   |
| GET /api/codes           | `getCodes`                          | `code-vault.spec.ts`                              |
| POST /api/utilisation    | `submitUtilisation`                 | `utilisation.spec.ts`                             |
| GET /api/utilisation/:id | `getUtilisation`                    | `utilisation.spec.ts`                             |
| POST doc/import          | `submitImport`                      | `documents.spec.ts`                               |
| POST doc/withdrawal      | `submitWithdrawal`                  | `documents.spec.ts`                               |

### A.2 Не реализовано

| Метод спеки                                    | Демо 31.08? | Волна интеграций?                    |
| ---------------------------------------------- | ----------- | ------------------------------------ |
| GET /api/orders/sub-orders                     | ❌          | 🟡 MVP-2/3                           |
| POST /api/order/close                          | ❌          | 🟡 закрытие партий                   |
| GET /api/codes/packs                           | ❌          | 🟡 1С/ERP                            |
| doc/correction, doc/validation                 | ❌          | 🟡 качество печати                   |
| doc/aggregation, transport-code-disaggregation | ❌          | 🟡 тикет 03 (WMS)                    |
| doc/storage/docs/*                             | ❌          | 🟡 дашборд                           |
| public/cod/* exports ZIP                       | ❌          | 🟡 тикет 05                          |
| public/api/v1/party/{tin}/status               | ❌          | 🟡 только после публичного API 1ecom |

### A.3 Семантика

- `Accept: *_/*` — ✅ (NestJS default)
- ЛОВУШКА 5 (businessPlaceId тип) — N/A в MVP
- documentBody base64(JSON A–Z) — реализовано через mock (JSON), задокументировано в CONTRACT-IS-MPT.md

---

## 4. Срез B — Машины состояний §8 ТЗ

### B.1 Tenant §8.1

| ТЗ-статус                                                                                                  | Реализация         |
| ---------------------------------------------------------------------------------------------------------- | ------------------ |
| Active                                                                                                     | ✅ (Tenant.status) |
| Остальные 8 (Draft/Submitted/In Review/Approved/Provisioning/Provisioning Failed/Suspended/Closing/Closed) | ❌ нет             |

**Gap**: 8/9. Tenant-машина не реализована.

### B.2 Карточка §8.2

✅ Draft, Validating, Submitted, In Review, Needs Correction, Approved, Registering, Registered, Rejected (9/12).
❌ Suspended, New Version, Archived.

### B.3 Заказ §8.3

✅ Draft, Validating, Funds Reserved, Queued, Sent, Processing, Partially Completed, Completed, Rejected, Cancelled, Failed, Accepted (частично).
❌ Unknown, Reconciling, Closed Partial, Closed Failed, Manual Review (4).

### B.4 Код §8.4 — TRANSITIONS

`code-event.service.ts:32-44`:

| Из         | Целевые                                                           |
| ---------- | ----------------------------------------------------------------- |
| ACTIVE     | PRINTED, WITHDRAWN, WRITTEN_OFF, EXPIRED, AGGREGATED              |
| PRINTED    | APPLIED, REPRINTED, WITHDRAWN, WRITTEN_OFF, EXPIRED               |
| APPLIED    | UTILISED, INTRODUCED, WITHDRAWN, WRITTEN_OFF, EXPIRED, AGGREGATED |
| UTILISED   | ❌ тупик                                                          |
| INTRODUCED | WITHDRAWN, WRITTEN_OFF                                            |
| AGGREGATED | DISAGGREGATED, APPLIED, WITHDRAWN, WRITTEN_OFF                    |

**Gap поля `externalStatus` (ТЗ §8.4)**: не реализовано. `MptOrder.status` хранит внешний код (CREATED|PENDING|READY|REJECTED|CLOSED), но **исходное строковое значение не сохраняется** (нет `externalStatusRaw`).

**Gap UTILISED → ?** : тупик. CONTEXT/ADR-024 не покрывает случай списания брака после нанесения.

### B.5 Платёж §8.5

❌ Все 7 статусов (Created/Awaiting/Matched/Posted/Rejected/Refunded/Disputed). Только `LedgerEntry` (TOPUP/RESERVE/RELEASE/SETTLE) + `Topup` (ref1c идемпотентно).

### B.6 Сводка B

| Домен    | §8 ТЗ | Реализовано | Gap                     |
| -------- | ----- | ----------- | ----------------------- |
| Tenant   | 9     | 1           | 8                       |
| Карточка | 12    | 9           | 3                       |
| Заказ    | 15    | 11          | 4                       |
| Код      | 15    | 7           | 8 (плюс externalStatus) |
| Платёж   | 7     | 0           | 7                       |

**К демо 31.08**: критичных gaps нет.

---

## 5. Срез C — IAM: матрица роль × эндпоинт

### C.1 Реальность

- `@Roles("admin")` — **только** `AdminController.probe`
- `@Roles("operator")` — только `ModerationController`
- Все остальные контроллеры (Orders, Vault, Label, Document, Utilisation, Billing, Files, Catalog, Dashboard) — **только TenantGuard**, без `@Roles`
- `TenantGuard`: operator без tenantId (глобальная роль)

### C.2 Матрица

| Роль ТЗ §4.2            | Защита MarkFlow                    | Требуется           |
| ----------------------- | ---------------------------------- | ------------------- |
| Администратор платформы | ❌ (только probe)                  | tenant CRUD, тарифы |
| Оператор подключения    | ❌                                 | REG-003             |
| Оператор маркировки     | 🟡 (только модерация)              | Модерация ✓         |
| Финансовый оператор     | ❌ (TenantGuard на /api/billing/*) | BILL-022            |
| Администратор клиента   | ❌                                 | IAM-008             |
| Менеджер клиента        | 🟡 (tenant-scoped)                 | admin               |
| Бухгалтер клиента       | 🟡                                 | accountant          |
| Оператор печати         | 🟡                                 | printer             |
| API-клиент              | ❌                                 | IAM-009             |

### C.3 Дыры

| Дыра    | Sev    | Описание                                                                                                                                                 |
| ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C-1** | HIGH   | `/api/orders`, `/codes/:key/apply`, `/labels/:key/*`, `/import`, `/withdrawal` — нет `@Roles`. Все tenant-пользователи = admin в seed → RBAC отсутствует |
| **C-2** | HIGH   | Нет разнообразия ролей в seed (только admin)                                                                                                             |
| C-3     | MEDIUM | `/api/billing/payments/import` без @Roles (BILL-022)                                                                                                     |
| C-4     | MEDIUM | `/api/utilisation` без @Roles                                                                                                                            |
| C-5     | MEDIUM | `/api/orders` без @Roles                                                                                                                                 |

---

## 6. Срез D — AT-01…AT-18

| AT    | Тест                                                               | Покрытие                          |
| ----- | ------------------------------------------------------------------ | --------------------------------- |
| AT-01 | onboarding.spec + e2e apply                                        | ✅ unit+e2e                       |
| AT-02 | onboarding.spec:AT-02 + e2e                                        | ✅ unit+e2e                       |
| AT-03 | catalog-import.spec:AT-03 + moderation.spec:AT-03                  | ✅ unit                           |
| AT-04 | moderation.spec (НТИН после Registered)                            | 🟡 unit                           |
| AT-05 | order.spec (create+RESERVE) + utilisation.spec (SETTLE)            | 🟡 unit                           |
| AT-06 | billing.spec:AT-06 + order.spec:AT-06                              | ✅ unit                           |
| AT-07 | order.spec:AT-07 (10 повторов)                                     | ✅ unit                           |
| AT-08 | mpt-simulator.spec (failed)                                        | 🟡 unit                           |
| AT-09 | code-vault.spec                                                    | 🟡 unit (нет log-injection теста) |
| AT-10 | —                                                                  | ❌ нет                            |
| AT-11 | label.spec (BOGUS/OTHER/c причиной → тот же key)                   | ✅ unit                           |
| AT-12 | utilisation.spec + label.spec (apply→APPLIED+SETTLE)               | 🟡 unit                           |
| AT-13 | documents.spec (член агрегата → 409)                               | 🟡 unit                           |
| AT-14 | —                                                                  | ❌ нет (не в MVP)                 |
| AT-15 | —                                                                  | ❌ нет (BILL-022)                 |
| AT-16 | http.spec + catalog-import.spec + templates.spec + onboarding.spec | ✅ unit (несколько)               |
| AT-17 | —                                                                  | ❌ нет (NFR/DR)                   |
| AT-18 | —                                                                  | ❌ нет (NFR)                      |

**Покрытие: ✅ 6, 🟡 6, ❌ 6.** Все Must из демо покрыты.

---

## 7. Gap-таблица с приоритетами

| ID        | Gap                                                               | Sev    | P      | Демо 31.08?        |
| --------- | ----------------------------------------------------------------- | ------ | ------ | ------------------ |
| **G-C-1** | RBAC в бизнес-эндпоинтах                                          | HIGH   | **P0** | НЕТ (admin в seed) |
| **G-C-2** | Разнообразие ролей в seed                                         | HIGH   | **P0** | НЕТ                |
| G-C-3     | `/api/billing/payments/import` без @Roles                         | MEDIUM | P1     | НЕТ                |
| G-C-4     | `/api/utilisation` без @Roles                                     | MEDIUM | P2     | НЕТ                |
| G-C-5     | `/api/orders` без @Roles                                          | MEDIUM | P2     | НЕТ                |
| G-B-1     | Tenant-машина §8.1 (8 из 9)                                       | MEDIUM | P1     | НЕТ                |
| G-B-2     | CodeEvent: externalStatus                                         | LOW    | P2     | НЕТ                |
| G-B-3     | UTILISED → ? тупик                                                | LOW    | P2     | НЕТ                |
| G-A-1     | sub-orders, order/close, codes/packs                              | MEDIUM | P2     | НЕТ                |
| G-A-2     | doc/correction, validation, aggregation, transport-disaggregation | MEDIUM | P2     | НЕТ (тикет 03)     |
| G-A-3     | public/cod/* exports ZIP                                          | LOW    | P2     | НЕТ (тикет 05)     |
| G-A-4     | doc/storage/*                                                     | LOW    | P2     | НЕТ                |
| G-A-5     | businessPlaceId нормализация                                      | LOW    | P2     | НЕТ                |
| G-D-1     | AT-10 (1000 этикеток)                                             | MEDIUM | P1     | НЕТ                |
| G-D-2     | AT-14 (акт)                                                       | LOW    | P2     | НЕТ (не в MVP)     |
| G-D-3     | AT-15 (ручная фин корректировка)                                  | MEDIUM | P1     | НЕТ (BILL-022)     |
| G-D-4     | AT-17 (восстановление)                                            | MEDIUM | P2     | НЕТ (NFR)          |
| G-D-5     | AT-18 (нагрузочный)                                               | MEDIUM | P2     | НЕТ (NFR)          |
| G-R-1     | REG-005 Suspended/Closing/Closed                                  | MEDIUM | P1     | НЕТ                |
| G-R-2     | REG-004 приглашения                                               | LOW    | P2     | НЕТ                |
| G-R-3     | IAM-009 сервисные учётки                                          | LOW    | P2     | НЕТ                |
| G-R-4     | IAM-008 idle/concurrent                                           | LOW    | P2     | НЕТ                |
| G-N-1     | LBL-034/035/036 конструктор/ZPL/EPL                               | LOW    | P2     | НЕТ                |
| G-N-2     | CV-033 антиэксфильтрация                                          | MEDIUM | P2     | НЕТ                |
| G-N-3     | NTF-052 email/SMS/push                                            | LOW    | P2     | НЕТ                |
| G-N-4     | SEC-057 AuditEvent                                                | LOW    | P2     | НЕТ                |
| G-N-5     | WMS-041/045/046/047                                               | LOW    | P2     | НЕТ                |
| G-N-6     | DOC-051 ЭЦП                                                       | LOW    | P2     | НЕТ                |
| G-N-7     | CAT-012 CSV/XLSX                                                  | LOW    | P2     | НЕТ                |
| G-N-8     | NTF-054 retry/DLQ                                                 | LOW    | P2     | НЕТ                |

### Сводка

- **P0 (к ближайшему релизу):** 2 gap (G-C-1, G-C-2) — RBAC и роли
- **P1 (ближайший спринт):** 5 gap (G-C-3, G-B-1, G-D-1, G-D-3, G-R-1)
- **P2 (backlog):** 21 gap

**Демо 31.08 готово.** Ни один P0 не блокирует демо (admin в seed).

---

## 8. Тикеты /to-tickets нарезка P0 (≤ 1 дня)

### T0-1 — RBAC-roles в бизнес-эндпоинтах (G-C-1, G-C-2)

**Файл-маркер:** `.scratch/w4/audit/T0-1-rbac-business.md`
**Оценка:** 0.5 дня

**Задачи:**

1. Ввести 5 ролей в seed: `admin`, `accountant`, `operator`, `printer`, `viewer`.
2. Создать `RolesGuard` (расширить) + декоратор `@Roles(...)` на:
   - `OrderController.POST /orders` → `admin` | `manager`
   - `LabelController.POST /labels/:key/print` → `admin`, `manager`, `printer`
   - `LabelController.POST /labels/:key/reprint` → `admin`, `manager`, `printer`
   - `POST /codes/:key/apply` → `admin`, `manager`, `printer`
   - `DocumentController.POST /import` → `admin`, `manager`
   - `DocumentController.POST /withdrawal` → `admin`, `manager`, `accountant`
   - `BillingController.POST /payments/import` → `admin`, `accountant`
   - `UtilisationController.POST /` → `admin`, `manager`, `printer`
3. Тесты: негативный 403 с недостаточной ролью.
4. E2E: роль `printer` → `/orders` → 403, `/labels/:key/print` → 200.

**Не блокирует демо 31.08**, критично для prod-приёмки.

### T0-2 — Реальный RBAC через auth.service (вспомогательный)

**Файл-маркер:** `.scratch/w4/audit/T0-2-auth-roles.md`
**Оценка:** 0.5 дня (в связке с T0-1)

**Задачи:**

1. `auth.service.ts:login` — поддержка `roles[]` в JWT.
2. `User` модель: добавить `roles: String` (CSV/Json).
3. Login response: вернуть `roles[]` для UI.
4. E2E: `admin@demo` → roles=["admin"]; добавить `operator@demo`, `printer@demo`.

**Итого P0: 2 тикета, 1 рабочий день, не блокирует демо 31.08.**

---

## 9. Препятствия для демо 31.08

**Демо 31.08 — 5 пунктов CONTEXT §1**:

1. ✅ Онбординг (заявка→tenant; без MFA-enforce, одна роль admin)
2. ✅ Карточка+ТНВЭД-фильтр (форма 44 атрибута, ТНВЭД-фильтр, дубли)
3. ✅ Заказ+симулятор КМ (ПОЛНОСТЬЮ)
4. ✅ Этикетка+скан (DataMatrix ECC200 + roundtrip, ПОЛНОСТЬЮ)
5. ✅ Документы (вкладка «Документы»)

**Все 5 пунктов покрыты** на чистом стенде (e2e-browser 11/11 PASS после подготовки).

### Что сделать ДО демо (28.08):

1. ✅ Перезапустить API + web на текущем main
2. ✅ Сбросить dev.db (`demo:reset`)
3. ✅ Создать карточку + заказ через API
4. ⚠️ Вручную проверить deep-link переходы по счётчикам summary (LOW из ревью 65eea50)
5. ✅ Прогнать e2e-browser — 11/11 PASS
6. ✅ Фикс e2e (печать/скан ВСЕХ ACTIVE кодов заказа, PR `789bc9d` в main)

**Демо готово.**

---

## 10. Что НЕ в скоупе аудита

- Frontend-UI: отдельный аудит
- Прод-контур (PG/Valkey/RabbitMQ/MinIO/OpenBao): вне прототипа
- Производительность (SLO §12): отдельный тикет AT-18
- Безопасность приложения (WAF/CSRF/XSS/SQLi): SAST/DAST — вне
- Соответствие 152-ФЗ / GDPR: юридический — вне
- ЭЦП: фаза 3

---

**Аудит завершён.** Все 4 среза выполнены. Gap-таблица + 2 тикета P0 готовы. Жду вашей отмашки (или правок) перед формальным `/to-tickets`.
