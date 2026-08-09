# MarkSolutions — контекст проекта

## Суть

ИС «MarkSolutions» — единое цифровое окно маркировки и прослеживаемости (РК). Первая группа — «Моторные масла» (ТНВЭД: 2710198200, 3403191000, 3403199000, 3403990000). Заказчик: ТОО «Mark Solutions». База требований: ТЗ v2.0 (docs/source/Техническое_задание_ИС_MarkFlow_версия_2.0.md).

## Внешние системы

- ИС МПТ (xTrace API; prod.markirovka.kz / test.markirovka.kz) — единственная полная спека: docs/CONTRACT-IS-MPT.md.
- GS1 (GTIN/GCP), НКТ (НТИН) — спеки ожидаются, адаптеры-заглушки.
- 1ecom.kz — ПУБЛИЧНОГО API НЕТ: порт + ручной режим оператора, реальный — по договору.
- Банк; 1С клиента (обмен v1 файлами, ADR-010); ЭДО/ЭЦП — фаза 3; ОФД/ККМ — наблюдатель.

## Фаза (на 2026-08-06)

Автономный MVP-прототип БЕЗ реальных интеграций (внешнее — за портами с моками; симулятор ИС МПТ ведёт себя по спеке).

Профиль прототипа (ADR-015): SQLite (Prisma adapter) + in-process OutboxPoller + локальная папка storage/. Docker на ноутбуке НЕ ставим. Прод = PostgreSQL 16 / RabbitMQ / MinIO на сервере (docker-compose.yml готов).

Портабельная схема (ADR-016): без enum/массивов, деньги BigInt минорными, статусы String, optimistic lock по version.

## Вехи

- **06.08 — T0..T3 закрыты.** T3-demo: `npm run demo:reset` (свежая dev.db), `npm run demo:smoke` (8/8 PASS по живому API), docs/DEMO-0808.md (сценарий показа + FALLBACK). К показу 08.08 готовы: онбординг (заявка→одобрение→вход) + товары на фикстуре с ТНВЭД-фильтром.
- **08.08 (пт) — внутренний показ учредителям.** Скоуп: онбординг; экран «Товары» на фикстуре; ТНВЭД-фильтр. Парсер инвойса и цепочка заказ→КМ→этикетка НЕ входят.
- **31.08–01.09 — демо стейкхолдерам** → доступы → волны интеграций.

## Границы MVP-1

Входит: онбординг (оферта без ЭЦП), каталог (44 атрибута, 4 канала, ТНВЭД-фильтр), GTIN/НТИН (мок+справочник), биллинг (double-entry, пополнение файлом «из 1С»), заказ КМ (симулятор), Code Vault (маска+AES, file-KMS), этикетки (настоящий DataMatrix ECC200 + roundtrip), склад/документы (мок), экспорт в 1С (файлы), дашборд «что дальше».

Скоуп демо 31.08 — 5 сквозных пунктов (режем глубину, не ширину):

1. Онбординг — заявка→tenant; без MFA-enforce и приглашений (одна роль админа клиента).
2. Карточка+ТНВЭД-фильтр — форма 44 атрибута, ТНВЭД-фильтр, дубли; Excel-импорт вне демо.
3. Заказ+симулятор КМ — ПОЛНОСТЬЮ (сердце демо).
4. Этикетка+скан — DataMatrix ECC200 + roundtrip, ПОЛНОСТЬЮ.
5. Документы — уведомление о ввозе/выводе одним экраном со статусами; без полного акта приёма-передачи и агрегации.

Фолбэк на 28.08: если не успеваем — сначала документы → статусы на дашборде, затем онбординг → «заявка→tenant»; заказ/этикетка/скан не трогаем.

НЕ входит: ЭДО/ЭЦП, ОФД/ККМ, офлайн, ERP, группы РФ, реальный 1ecom.

## Глоссарий

КМ (КИ+код проверки), КИ (AI01+GTIN14+AI21+serial), GTIN, НТИН, ТНВЭД, УОТ, УЭО, МОД (businessPlaceId), tenant, КМ base (AI01+AI21) / extended (+GS+AI91+AI92), GS=0x1D, SSCC (AI='00').

## Глоссарий каталога (T3, ADR-021/022)

- **DraftProposal** — невалидированный черновик карточки из любого канала (инвойс/Excel/форма/клон). Несёт confidence + missing (ADR-019); не источник истины.
- **ProductCard** — валидированная карточка товара (44 атрибута, CATALOG-MM), единственный источник истины. Версионируется (CAT-011): опубликованная версия неизменна, правка = новая версия.
- **schemaVersion** — версия JSON-схемы атрибутов; additive-only эволюция, ленивая миграция при правке через app-мапперы (ADR-021).
- **ModerationRoute** — машина состояний карточки Draft→Validating→Submitted→In Review→Approved/Rejected→Registering→Registered (CAT-013, §8.2 ТЗ); причина отклонения на уровне поля (fieldReasons).
- **GtinResolver** — трёхслойная проверка GTIN: кэш→IGs1Adapter.verify (mod10)→ручной ввод. Registering не требует VERIFIED в MVP-1 (конфиг-флаг, ADR-016-политика).
- **NktAdapter** (мок) — submitProduct + getStatus; Registering→Registered асинхронно, reconciliation (ID-017), отказ → Registration Failed → Needs Correction.
- **Вне скоупа** — терминальный статус строки DraftProposal, чей ТНВЭД вне перечня и пользователь подтвердил «не подлежит маркировке» (Q3, ADR-022); виден отдельным списком с причиной.

## Глоссарий заказов КМ (W3)

- **Единицы маркировки** — НЕ сущность, а снимок в строке заказа: `{places, unitsPerPlace, quantity, totalPrice} + cisType + serialNumberType`. quantity по умолчанию = places × unitsPerPlace (превью расчёта в UI), пользователь может уменьшить до 1 (частичная маркировка), но не выше произведения; валидация 1 ≤ quantity ≤ places×unitsPerPlace. places/unitsPerPlace — из инвойса/packing list (если заказ связан с поставкой) либо ручной ввод.
- **OrderLine (MVP)** — однопозиционный заказ КМ: 1 заказ = 1 строка товара со снимком единиц маркировки. Многопозиционность — позже (таблица OrderLine); адаптер ИС МПТ уже принимает `products[]`.
- **Сумма резерва** — `totalPrice = quantity × тариф_КМ` (снимок цены из карточки/инвойса НЕ используется: у карточки цены нет — ADR-023; `priceUsd` инвойса — закупочная цена товара, в биллинге MarkFlow не участвует).
- **Tariff** — справочник тарифов: `{id, validFrom, validTo, pricePerCodeKZT (BigInt целые тенге, дробных единиц нет), unit="KM", currency="KZT"}`. На MVP — одна активная строка в БД, seeded (правка через seed/скрипт, админ-UI нет). Выбор при заказе = активный на дату; нет активного → создание заказа отклоняется («тариф не настроен»). Заказ хранит снимок `{tariffId, pricePerCodeKZT}`; смена тарифа существующие заказы не меняет.
- **isPaid** — в POST /api/orders всегда true при отправке: резерв создаётся до/в момент создания заказа (одна транзакция), при 0 баланса заказ не создаётся (AT-06); ручного «не оплачен» в MVP нет (п.26 — оплата до сведений о нанесении).
- **Симулятор ИС МПТ** — stateless, без setTimeout: `status = f(now, createdAt, config)`. `PENDING` пока `now-createdAt < SIM_MPT_EMISSION_MS` (конфиг; демо-дефолт 45 000 мс, тесты 50–100 мс), затем `READY`. Коды генерируются ОДИН раз при первом переходе в READY и сохраняются (GET /api/codes идемпотентен). Коды валидны по п.19 + ADR-006 (AI01+GTIN14+AI21+serial; +ai91/ai92 extended; рендер с GS — только из структуры). МарkFlow-поллер опрашивает getStatus (интервал MPT_POLL_MS); PENDING дольше MPT_ORDER_TIMEOUT_MS → внутренний Failed + задача оператору (паттерн ID-017).
- **CodeVault** — строка Vault = gtin ОТКРЫТЫЙ (публичный идентификатор, индекс) + зашифрованный `{serial, ai91, ai92}` (секретная часть КМ, AES-256-GCM, per-row nonce рядом с ciphertext) + метадата {orderId, cardId, tenantId, status, createdAt, mask}. Ключи через KMS_PROFILE (file-KMS dev / OpenBao prod). Хешей полного КМ нет.
- **Маска КМ** — для UI/логов/APM: gtin открыт + serial по правилу «первые 2 + … + последние 2» при length>6, иначе полностью скрыт. Полный КМ — только привилегированные операции (печать этикетки, «Скачать коды»-экспорт), каждая с аудит-записью (CV-032: actor, время, причина).
- **Экспорт кодов** — CSV: колонки `gtin, serial, ai91, ai92, form (base|extended), km_full, orderId`; km_full = raw с литералом `<GS>` (текст, не байт 0x1D), сериализация ТОЛЬКО из структуры (ADR-006). UTF-8 с BOM, разделитель «;», файл `markflow-codes-{orderId}-{timestamp}.csv`. Экспорт только для READY/Completed заказов (иначе 409); tenant-scoped (чужой → 404/403); роли admin/accountant; каждая выгрузка = аудит CV-032 (actor, время, orderId).
- **serialNumberType** — в MVP всегда `OPERATOR` (серийник эмитит ИС МПТ/симулятор); `SELF_MADE` → 400 «не поддерживается в MVP-1», UI не даёт выбрать. serial по п.19: числовые, фиксированной длины, уникальные в разрезе (gtin) между всеми заказами. SELF_MADE — отдельная фаза с tenant-конфигом схемы.
- **cisType** — в MVP всегда `UNIT` (единица товара, банка масла); GROUP/SET → 400 «групповая маркировка не поддерживается в MVP-1», UI не даёт выбрать. Симулятор/Vault/этикетка работают только с UNIT. Агрегация (SSCC AI='00', связи родитель-потомок) — фаза W4/C6, в MVP не требуется (ограничение AT-13 не в силе).
- **LedgerEntry** — double-entry источник истины (ADR-007); Account.balance = материализованный кэш, обновляется в той же CAS-транзакции. Виды: TOPUP (кредит), RESERVE (блокирует, balance не трогает), RELEASE (отмена до тарификации, BILL-019), SETTLE (списание = регистрация нанесения, п.26: balance −= amount, резерв гасится). available = balance − SUM(активных RESERVE). Резерв: optimistic CAS на Account.version (UPDATE...WHERE id AND version), портабельно SQLite↔PG, без FOR UPDATE в коде; конфликт → до 3 ретраев с backoff, затем 409. RESERVE уникален по (orderId, kind) — идемпотентность (AT-07).
- **Создание заказа** — одна транзакция = заказ (Draft) + RESERVE-проводка (CAS) + outbox-событие `send-order-to-mpt`; отправка в ИС МПТ — поллером ПОСЛЕ коммита (Idempotency-Key = orderId, AT-07). Освобождение — явный RELEASE (компенсация, не откат: double-entry не удаляет проводки). REJECTED/таймаут симулятора → заказ Failed + RELEASE + задача оператору (ID-017). Отмена ORD-028 до эмиссии (до READY) → RELEASE; после эмиссии отмена запрещена (только нанесение/аннулирование по Правилам). SETTLE — только при регистрации нанесения (п.26).
- **Reconciliation (ORD-029)** — поллер = сверка: опрашивает ВСЕ незакрытые заказы (Sent/Accepted/Processing) каждые MPT_POLL_MS и догоняет пропущенные статусы. Отдельного дневного джоба в MVP НЕТ (эволюция: после боевой интеграции — независимый дневной контрольный контур). Расхождение внешний quantity ≠ заказанный → заказ Partially Completed + задача оператору (ID-017), без авто-финкорректировки (SETTLE по фактическому количеству при нанесении + RELEASE разницы оператором; авто-корректировка — пост-интеграционная фаза).

## Навигация по контексту

Решения — docs/DECISIONS.md; роадмап — docs/ROADMAP.md; API — docs/CONTRACT-IS-MPT.md; Правила — docs/RULES-MM.md; каталог/инвойс — docs/CATALOG-MM.md; происхождение файлов — docs/SOURCE-MANIFEST.md. Правила агента — AGENTS.md.

## Стек и структура

```
apps/api       — NestJS API
apps/web       — веб-клиент
packages/db    — Prisma schema и миграции
packages/shared — общие типы/утилиты
docs/source    — raw-md из anydoc (fallback)
fixtures       — CSV-фикстуры КМ
storage/       — файлы прототипа (этикетки/инвойсы), локально
docker-compose.yml — прод-контур инфраструктуры (на сервере)
```

Стек прод: NestJS+TS, Prisma+PostgreSQL16, Valkey, RabbitMQ, MinIO, OpenBao(prod)/file-KMS(dev), bwip-js, React+Vite, EntityList. Прототип: SQLite + OutboxPoller + storage/ (ADR-015).

## Как запустить локально (прототип, без Docker)

Переменные окружения (см. `.env.example`):

- `DATABASE_URL="file:./dev.db"` — SQLite (миграции создают `packages/db/prisma/dev.db`)
- `STORAGE_DIR="./storage"` — файлы прототипа (этикетки/инвойсы)

```bash
# 1. Установить зависимости
npm install

# 2. Миграции (SQLite: packages/db/prisma/dev.db)
npm run db:migrate

# 3. Seed: админ-клиент, tenant, счёт, фикстура товаров
npm run db:seed

# 4. Запустить API (порт 3000)
npm run dev
```

Health: `GET http://localhost:3000/health` → `{"status":"ok","db":"ok"}`. Ошибки — единый формат Приложения B ТЗ (ADR-017): `{code,message,details,fieldErrors,correlationId,retryable}`. Прод-контур (PostgreSQL/Valkey/RabbitMQ/MinIO) — только на сервере, docker-compose.yml готов.

## Git-дисциплина

- Pre-commit: prettier + eslint + tsc --noEmit + secret-scan
- Прямой push в `main`/`master` заблокирован хукoм `pre-push` — только через pull request
