# Module gap matrix — MarkFlow 16 vs `apps/`

Снимок: 2026-08-31, база `chore/cursor-agent-factory`.
Роль: MS-Architect. Только карта. Не предписание переписать платформу.

Канон 16 модулей — левое меню `docs/source/MARK_FLOW_16_modules_exact_layout_v2.html` (`openM(0)`…`openM(15)`) и таблица §1 `docs/source/MARK_FLOW_Functional_System_Specification_v1.0.md`. Коды HOME…SET — из Functional Spec / Developer Quick Start.

`apps/api` — плоский Nest (`AppModule`, контроллеры в `apps/api/src/*.controller.ts`), не 16 domain-пакетов. `apps/web` следует UI-SPEC v4 (23 экрана в `apps/web/src/roles.ts`), не каноническому меню из 16.

---

## Как читать статус

Критерий **есть**: domain service + модель Prisma + поведенческий тест, которые закрывают срез ТЗ (не все 7–32 экрана модуля).

Критерий **stub**: есть маршрут / контроллер / схема, но модуля ТЗ нет (StubPage, пустой list, модели без HTTP API, только счётчики).

Критерий **нет**: в `apps/api` и `apps/web` нет пути, который реализует этот модуль. Явно писать «нет», не оставлять пустую ячейку.

Приоритет привязан к циклу CONTEXT.md MVP-1 (каталог → заказ КМ → печать/нанесение → документы → биллинг → «что дальше»), не к полноте мокапов:

| Приоритет | Смысл                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------- |
| **P0**    | Уже в committed marking-loop / демо. Дыра здесь ломает контроль или compliance-контур.                    |
| **P1**    | Следующий операционный слой после loop (агрегация как продукт, поставки, склад, производство, настройки). |
| **P2**    | Поиск, отчёты, ИИ, база знаний.                                                                           |

Внешние API не выдумывать: только `docs/CONTRACT-IS-MPT.md` и `docs/source/`.

---

## Матрица

| #   | module                           | TZ file                                                                 | status in code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | priority | dependencies                                                                            |
| --- | -------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| 1   | Главная (HOME)                   | `docs/source/MARK_FLOW_Главная_финальная_v3.md`                         | **stub** — `apps/api/src/dashboard.service.ts` (5 счётчиков W4, не HOME-01…07); `apps/api/src/dashboard.controller.ts`; `apps/web/src/pages/dashboard.tsx`; тест `apps/api/test/dashboard.spec.ts`. Ролевых дашбордов ТЗ нет.                                                                                                                                                                                                                                                                                                                      | P0       | CAT, ORD, PRINT, OPS, TASK, BILL                                                        |
| 2   | Центр задач и уведомлений (TASK) | `docs/source/MARK_FLOW_Центр_задач_и_уведомлений_финальный (1).md`      | **есть (minimal)** — Prisma `Task` (`tenantId`, unique source+sourceRef); `GET/POST /tasks` проецирует Outbox FAILED + `UtilisationAlert`; UI `apps/web/src/pages/tasks.tsx`; HOME KPI `openTasks`. Нет SLA-движка, кабинета оператора, центра уведомлений ТЗ.                                                                                                                                                                                                                                                                                     | P0       | все мутирующие модули; Outbox; ID-017                                                   |
| 3   | Глобальный поиск (SEARCH)        | `docs/source/MARK_FLOW_Глобальный_поиск_детальный_финальный.md`         | **stub** — только topbar в `apps/web/src/layout.tsx` (`placeholder` + Enter → `/codecheck`). API/индекса нет. `apps/web/src/pages/code-check.tsx` = lookup одного КМ (`apps/api/src/code-lookup.controller.ts`), не SEARCH-01…14.                                                                                                                                                                                                                                                                                                                  | P2       | CAT, ORD, OPS, Code Vault                                                               |
| 4   | Каталог товаров (CAT)            | `docs/source/MARK_FLOW_Каталог_товаров_v2_регистрации_GS1_NKT_KMT.md`   | **есть** — `apps/api/src/catalog.controller.ts` + `CatalogService`; `apps/api/src/moderation.service.ts` (CAT-013); `apps/api/src/gtin-resolver.ts`; Prisma `ProductCard`, `DraftProposal`, `GtinCache`; UI `apps/web/src/pages/products.tsx`, `product-detail.tsx`; AT-03/04 в `apps/api/test/catalog-import.spec.ts`, `moderation.spec.ts`. GS1/NKT — мок-порты (`apps/api/src/integrations.ts`).                                                                                                                                                | P0       | CATALOG-MM; порты GS1/NKT (мок); SET (tenant); CONTRACT-IS-MPT не invent                |
| 5   | Заказ кодов (ORD)                | `docs/source/MARK_FLOW_Заказ_кодов_детальный_финальный.md`              | **есть** — `apps/api/src/order.service.ts` (заказ + RESERVE + outbox в одной tx); `apps/api/src/order.controller.ts`; `apps/api/src/outbox-poller.ts`; Prisma `Order`, `OrderLine`, `MptOrder`, `MptCode`; UI `apps/web/src/pages/orders.tsx`, `order-form.tsx`; AT-06/07 в `apps/api/test/order.spec.ts`, `mpt-simulator.spec.ts`. Code Vault — `apps/api/src/vault.service.ts` (не отдельный из 16).                                                                                                                                             | P0       | CAT; BILL; CONTRACT-IS-MPT (заказ/коды); Vault                                          |
| 6   | Печать и этикетки (PRINT)        | `docs/source/MARK_FLOW_Печать_и_этикетки_детальный_финальный.md`        | **есть** — `apps/api/src/label.service.ts` (bwip-js PNG, apply, reprint); `apps/api/src/label.controller.ts`; `apps/api/src/code-event.service.ts`; UI `apps/web/src/pages/labels.tsx` (принтеры Zebra захардкожены — локальный stub внутри есть-модуля); `apps/api/test/label.spec.ts` (roundtrip + reprint ≈ AT-11). Нет конструктора шаблонов / очереди принтеров ТЗ PRINT-01…24.                                                                                                                                                               | P0       | ORD; Vault; CONTRACT-IS-MPT (формат КМ)                                                 |
| 7   | Агрегация (AGG)                  | `docs/source/MARK_FLOW_Агрегация_детальный_финальный.md`                | **stub** — Prisma `AggregationUnit`, `AggregationMember` (`packages/db/prisma/schema.prisma`); `generateSssc` в `apps/api/src/code-event.service.ts` + `apps/api/test/code-event.spec.ts`; чтение при выводе в `apps/api/src/document.service.ts`. HTTP create/seal/disaggregate **нет**. Страницы модуля **нет**. CONTEXT: агрегация вне демо MVP.                                                                                                                                                                                                | P1       | PRINT/apply; CONTRACT-IS-MPT (SSCC не эмитируется оператором); OPS                      |
| 8   | Операции и документы (OPS)       | `docs/source/MARK_FLOW_Операции_и_документы_детальный_финальный (1).md` | **stub** — срез документов есть: `apps/api/src/document.service.ts` (import/withdrawal), `apps/api/src/utilisation.service.ts`, `apps/api/src/document.controller.ts`; Prisma `ImportDocument`, `WithdrawalDocument`, `UtilisationReport`, `MptDocument`; UI `apps/web/src/pages/docs.tsx`; тесты `apps/api/test/documents.spec.ts`, `utilisation.spec.ts`. Единого журнала OPS-01…29 нет. `/operations` = `StubPage` (`apps/web/src/app.tsx`). Акт приёма-передачи (AT-14) нет. `apps/web/src/pages/utilisation-form.tsx` не подключён к роутеру. | P0       | CONTRACT-IS-MPT `doc/*`; ORD; PRINT; BILL (SETTLE при нанесении); AGG (каскадный вывод) |
| 9   | Поставки (SHP)                   | `docs/source/MARK_FLOW_Поставки_детальный_финальный (1).md`             | **нет** — в `apps/api` нет `Shipment*` / `POST /shipments`. В `apps/web` нет маршрута «Поставки». `ImportDocument` закрывает уведомление о ввозе (OPS), не входящие/исходящие поставки ТЗ.                                                                                                                                                                                                                                                                                                                                                         | P1       | CAT; OPS; AGG; CONTRACT-IS-MPT `doc/import`                                             |
| 10  | Производство (PRD)               | `docs/source/MARK_FLOW_Производство_детальный_финальный (1).md`         | **stub** — только `StubPage` `/production` (`apps/web/src/app.tsx` `STUB_IDS`, nav `apps/web/src/roles.ts`). Domain/Prisma `Production*` нет. Поле `productionDate` в utilisation/import — дата партии, не модуль.                                                                                                                                                                                                                                                                                                                                 | P1       | CAT; ORD; PRINT; AGG                                                                    |
| 11  | Склад и ТСД (WMS)                | `docs/source/MARK_FLOW_Склад_и_ТСД_детальный_финальный.md`              | **stub** — `StubPage` `/warehouse`; роль `"warehouse"` в `apps/api/src/guards.ts` и `apps/web/src/roles.ts`. Моделей Zone/Bin/WarehouseTask/Device нет.                                                                                                                                                                                                                                                                                                                                                                                            | P1       | AGG; SHP; OPS                                                                           |
| 12  | Биллинг (BILL)                   | `docs/source/MARK_FLOW_Billing_Final.md`                                | **есть** — `apps/api/src/billing.service.ts` (double-entry, CAS reserve/settle); `apps/api/src/billing.controller.ts`; `apps/api/src/invoice.service.ts`; Prisma `Account`, `LedgerEntry`, `Tariff`, `Invoice`; UI `apps/web/src/pages/balance.tsx` (Kaspi/закрывающие — мок/пусто); AT-06 в `apps/api/test/billing.spec.ts`, `invoice.spec.ts`. Нет полного BILL-01…26 (тарифный админ-UI, закрывающие периоды).                                                                                                                                  | P0       | ORD (RESERVE); utilisation/OPS (SETTLE); CONTRACT не invent bank API                    |
| 13  | Отчёты и аналитика (RPT)         | `docs/source/MARK_FLOW_Reports_Analytics_Final.md`                      | **stub** — `StubPage` `/reports`. `UtilisationReport` — документ нанесения, не аналитика. Read-model/export модуля нет.                                                                                                                                                                                                                                                                                                                                                                                                                            | P2       | все доменные модули                                                                     |
| 14  | ИИ помощник (AI)                 | `docs/source/MARK_FLOW_AI_Assistant_Final.md`                           | **нет** — в `apps/api` и `apps/web` нет assistant/chat/AI-fill как модуля. Каталожный `aiFill` есть только в старых мокапах, не в коде.                                                                                                                                                                                                                                                                                                                                                                                                            | P2       | SEARCH; KB; те же backend-команды, что UI (ТЗ: без обхода команд)                       |
| 15  | База знаний (KB)                 | `docs/source/MARK_FLOW_Knowledge_Base_Final.md`                         | **нет** — нет Knowledge/runbook API и страницы. `/support` = `StubPage` «Поддержка» (UI-SPEC), не KB-01…30.                                                                                                                                                                                                                                                                                                                                                                                                                                        | P2       | RULES-MM; SET                                                                           |
| 16  | Настройки (SET)                  | `docs/source/MARK_FLOW_Settings_Final.md`                               | **stub** — IAM/онбординг: `apps/api/src/auth.service.ts`, `apps/api/src/onboarding.controller.ts`, Prisma `Tenant`, `User`, `Application`; статус адаптеров `apps/api/src/integrations.controller.ts` + `apps/web/src/pages/integrations.tsx`. `/organization` = `StubPage`. CRUD организации/складов/интеграций/ролей по SET-01…32 нет.                                                                                                                                                                                                           | P1       | Tenant; CONTRACT-IS-MPT (профили адаптеров, не выдуманные методы)                       |

---

## P0 gaps (для оркестратора / Harith)

Уже **есть** на marking-loop: Каталог, Заказ кодов, Печать, Биллинг.

Дыры P0 (модуль в каноне обязателен для контроля loop, в коде — stub):

1. **Главная** — не HOME-01…07. Есть снимок 5 счётчиков (`dashboard.service.ts`), нет ролевых дашбордов и блока интеграций ТЗ.
2. **Центр задач** — minimal slice есть (Task + `/tasks` + HOME `openTasks`). Нет SLA-движка, уведомлений, полного ТЗ.
3. **Операции и документы** — жив узкий срез ввоз/вывод/нанесение. Нет единого журнала OPS, нет AT-14, форма utilisation не в роутере, `/operations` — StubPage.

Не поднимать в P0: Поставки / Производство / Склад / Агрегация-как-продукт / Настройки / Поиск / Отчёты / ИИ / БЗ — это P1–P2. CONTEXT прямо выводит агрегацию и полный акт приёма из демо.

---

## Вне канона 16 (есть в `apps/`, это не отдельные модули)

Не добавлять в матрицу как 17-й модуль. Учесть, чтобы не плодить дубли:

| Что в коде                                                    | Куда относится                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| Code Vault (`vault.service.ts`, `/vault`)                     | слой ORD/PRINT (хранение КМ)                                  |
| `/codecheck`                                                  | утилита; не SEARCH                                            |
| `/integrations`                                               | кусок SET                                                     |
| `/operator`, `/audit`                                         | платформенный контур, не TASK                                 |
| `/login`, онбординг (`apply.tsx` / `status.tsx` не в роутере) | SET / T0                                                      |
| StubPage: partners, processes, exceptions, health, support    | UI-SPEC v4; в каноне 16 нет (Конструктор процессов ТЗ удалил) |

---

## Зависимости (кратко)

Сквозные процессы Functional Spec §5:

```
CAT → ORD → PRINT → (AGG) → OPS
                ↘ BILL (RESERVE / SETTLE)
OPS / ORD / PRINT → HOME + TASK
SHP / PRD / WMS → после OPS+AGG (P1)
SEARCH / RPT / AI / KB → после данных loop (P2)
SET — tenant/IAM под всеми
CONTRACT-IS-MPT — ORD, PRINT (формат КМ), OPS (doc/*). Методы не выдумывать.
```

---

## Что не делать по этой матрице

- Не распиливать плоский Nest на 16 пакетов «чтобы совпало с меню».
- Не реализовывать 24–32 экрана модуля, пока нет среза service + Prisma + AT.
- Не считать StubPage или пустой `ProductsController.list() → { items: [] }` (`apps/api/src/app.module.ts`) модулем.
- Не путать `UtilisationReport` с модулем Отчёты и `ImportDocument` с модулем Поставки.

---

## Verification

- [x] 16 строк, порядок layout `openM(0)`…`openM(15)`
- [x] У каждой строки путь ТЗ под `docs/source/`
- [x] Статус только `есть` / `нет` / `stub`
- [x] У `есть` и `stub` — пути в `apps/api` и/или `apps/web`
- [x] У `нет` (SHP, AI, KB) — явно «нет»
- [x] Приоритет P0–P2
- [x] Колонка dependencies
- [x] PR содержит только этот файл
