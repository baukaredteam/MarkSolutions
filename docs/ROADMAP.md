# Технический роадмап MarkFlow

## Фаза 0 — автономный прототип (04.08–28.08.2026), демо 31.08–01.09

**Веха 08.08 (пт) — внутренний показ учредителям.** Скоуп: онбординг; экран «Товары» на фикстуре; ТНВЭД-фильтр. Парсер инвойса и цепочка заказ→КМ→этикетка НЕ входят.

**T0 — профиль стека: ЗАКРЫТ** (06.08). Коммиты `8119d09` (профиль: SQLite+LocalStorage+OutboxPoller, health, seed) + `3e8ad50` (fix review: санация storage, exactly-once outbox, глобальный tenant-guard, формат ошибок Приложения B). Тесты 8/8. ADR-017.

**T0-web — каркас веб-морды: ЗАКРЫТ** (06.08). Коммиты `9187e56` (Vite+React+TS, 4 страницы, api-client, фикстура) + `b8f7bd6` (fix review: реальная фикстура инвойса, блок повторного POST при дубле БИН, префилл исправления, demo-badge). Тесты 17/17. ADR-019 (инвойс — недоверенный черновик).

**T1 — онбординг-бэкенд: ЗАКРЫТ** (06.08). Коммиты `bd91d6a` (POST applications/approvals, JWT-auth, MFA-stub, tenant-guard из JWT) + `9138355` (review-docs). Тесты 26/26 (API). AT-02 дубль БИН, AT-16 → 401, MFA 403. ADR-017 обновлён (AT-16=401, @Public=3), ADR-020 (MFA независим от user.mfaEnabled).

**T2 — связка веб-морды с онбординг-бэкендом: ЗАКРЫТ** (06.08). Коммит `e0c5967`: /apply, /status, /login дёргают реальные T1-эндпоинты; api-client шлёт `Authorization: Bearer` (JWT из session); /products переживает ApiUnavailable. Тесты 30/30 (api + web).

**T3-demo — подготовка к показу 08.08: ЗАКРЫТ** (06.08). Коммит `9d10d2b`: scripts/demo-smoke.mjs (E2E 8/8 PASS по живому API), npm run demo:reset (свежая dev.db + seed), docs/DEMO-0808.md (сценарий + FALLBACK), PrismaService default → packages/db/prisma/dev.db.

**T3 тикет 01 (catalog-schema): ЗАКРЫТ** (07.08). Коммиты `ee0c3d8` + `2fdf414`: схема 44 attr v1 (ярус A = 31 required: 14 ручных + 17 авто), schemaVersion=1, DraftProposal (source/proposed/missing/demo), xlsx-шаблон из sheetModel (JWT-protected, ADR-017), валидатор ярусов, версионирование additive-only. Частичный уникальный индекс и предпроверка дублей — в тикет 02. Тесты 46/46.

**T3 тикет 02 (catalog-import): ЗАКРЫТ** (07.08). Коммиты `00fceb3` + `3749601` + `cc2d702`: 4 канала входа, DraftProposal с confidence+missing (ADR-019), двухфазный ТНВЭД-фильтр с двумя аудируемыми кнопками (ADR-022), эвристика наименования п.15, нечёткие дубли с аудитом confirmDuplicate, частичный уникальный индекс uniq_card_tenant_gtin_active, транзакция assertGtinFree+create с P2002→409, web /products читает GET /products/drafts. Тесты 64/64.

**T3 тикет 03 (catalog-moderation): ЗАКРЫТ** (07.08). Коммиты `b1fdd52` + `772fe68` (fix review) + `2fc4a46` (docs review): машина модерации CAT-013 (Draft→Validating→Submitted→In Review→Approved/Needs Correction/Rejected→Registering→Registered) с аудитом {author,at,from,to,comment}; GtinResolver 3 слоя + seed кэша (RAVENOL/codes_success VERIFIED, source=seed); NktAdapter + OutboxPoller с SLA (3с, timeout→FAILED→ID-017); очередь оператора cross-tenant (GET /moderation/queue?tenantId=), approve/reject; fieldReasons при reject, повторная отправка без исправления = 400; REQUIRE_GS1_VERIFIED_FOR_REGISTERING; оператор operator@markflow без доступа к tenant-данным; web-бейдж «GTIN подтверждён вручную». Тесты 80/80.

**T3 тикет 04 (catalog-files): ЗАКРЫТ** (07.08). Коммиты `5929028` + `e8ea138` (fix review): фото/декларация через StorageAdapter (существующий T0, не переписан) — upload → write → дескриптор {key, originalName, mimeType, contentHash(sha256), uploadedAt, label} в attributes.files; clone (CAT-011) переиспользует ключи, замена → новый ключ; GET /products/cards/:id/files/:key с tenant-проверкой через карточку (IDOR → чужой tenant 403, без JWT 401); гейт яруса B в validateForSubmit (фото ≥2 с разными label, декларация — даты/бессрочность). Тесты 95/95.

**W2 (T3) ЗАКРЫТА: тикеты 01 schema + 02 import + 03 moderation + 04 files. Каталог сквозной:** схема 44 attr + schemaVersion (ADR-021); 4 канала входа + DraftProposal + двухфазный ТНВЭД-фильтр с двумя аудируемыми кнопками (ADR-022); эвристика наименования п.15; нечёткие дубли с аудитом; частичный уникальный индекс uniq_card_tenant_gtin_active; машина модерации CAT-013 с аудитом переходов; GtinResolver 3 слоя + seed кэша; NktAdapter + OutboxPoller с SLA; файлы фото/декларации через StorageAdapter с IDOR-защитой. Тестов: 95/95. ADR-023 (каталог заморожен до второй товарной группы).

**W3 тикет 01 (billing-core): ЗАКРЫТ** (09.08). Коммиты `a2a17f0` + `6a791f3` (fix currency) + `413e59f` (fix review): LedgerEntry TOPUP/RESERVE/RELEASE/SETTLE; Tariff seed 100 ₸/КМ (целые тенге); PaymentImport идемпотентно по ref1c; optimistic CAS на Account.version; release идемпотентен; settle ограничен available; конкурентный резерв [201,402]. 106/106 тестов. ADR-024 (заказ КМ + Code Vault), ADR-007/010/016 апдейты.

**W3 тикет 02 (order): ЗАКРЫТ** (09.08). Коммиты `514076c` + `7bde880` (fix review): POST /orders одной транзакцией (заказ + RESERVE + outbox); снимки единиц маркировки и тарифа (целые тенге); AT-06 (402, заказ и резерв не создаются); AT-07 включая конкурентный повтор (P2002 → existing); ORD-028 отмена до/после эмиссии; IDOR 404; cisType=UNIT / serialNumberType=OPERATOR гейты; 115/115 тестов.

**W3 тикет 03 (mpt-simulator+poller): ЗАКРЫТ** (09.08). Коммит `68d4861`: stateless-симулятор ИС МПТ (ADR-005) — status=f(now,createdAt,SIM_MPT_EMISSION_MS); POST /api/orders идемпотентен по orderId; GET /api/codes идемпотентен, serial уникальны по (gtin) между заказами; поллер MarkFlow (ORD-029, поллер=сверка) догоняет статусы всех незакрытых заказов; таймаут MPT_ORDER_TIMEOUT_MS → Failed + RELEASE + задача mpt-order-timeout; мок-шов quantity−1 → Partially Completed + задача без авто-финкорректировки; Cancelled не отправляется/не эмитирует; флейк-фикс try/catch в poll(); 122/122 тестов.

**W3 тикет 04 (code-vault): ЗАКРЫТ** (09.08). Коммит `ca316e9`: AES-256-GCM per-row nonce, CV-030 дамп без serial, маски CV-031, инджест из симулятора идемпотентен, CSV-экспорт <GS>/BOM/«;» с аудитом CV-032, печать с аудитом, KMS_PROFILE переключается без кода; 129/129 тестов.

**W3 тикет 05 (utilisation+deadline): ЗАКРЫТ** (10.08). Коммит `c70f48b`: POST /utilisation (strict spec: sntins[], releaseType, expirationDate/productionDate/manufacturerCountry обязательные); симулятор ИС МПТ с submitUtilisation+getUtilisation; SUCCESS→SETTLE (п.26) + коды → UTILISED + RELEASE резерва; идемпотентность по settled-флагу; таймер 30 дней как данные (UTIL_DEADLINE_DAYS), алерты 7/3/1 через UtilisationAlert, аннулирование = EXPIRED (не удаление); 136/136 тестов.

**W3 тикет 06 (web-orders): ЗАКРЫТ** (10.08). Коммит `afc4a09`: EntityList (ADR-008) data-driven; экраны Баланс (пополнение идемпотентно по ref1c), Заказы (маски КМ, Скачивание), Создание заказа (валидация quantity, cisType=UNIT, serialNumberType=OPERATOR), Скачать коды (CSV BOM/«;» с аудитом CV-032), Отчёт о нанесении (SUCCESS→SETTLE на экране), Дашборд (модерация + дедлайны 30 дней); browser E2E 8/8; 143/143.

**W3 ЗАКРЫТА: тикеты 01 billing + 02 order + 03 mpt-simulator + 04 code-vault + 05 utilisation + 06 web. Цикл денег замкнут (TOPUP → RESERVE → эмиссия → SUCCESS → SETTLE); все три дорожки бизнеса работают в браузере без терминала; демо 31.08 готово. 143/143 тестов + 8/8 browser E2E.**

**W4 тикет 01 (code-status): ЗАКРЫТ** (11.08). Коммит `fcdc8e4`: общая GS1 mod10 (GTIN-14 + SSCC-18) `gs1Mod10CheckDigit`/`verifyGs1Mod10` вместо verifyGtinMod10; CodeEvent append-only {tenantId, codeId, event, at, actor, reasonCode, comment, relatedId} с write-through CodeVault.status; машина переходов MVP-набора (ACTIVE→PRINTED→APPLIED→UTILISED/INTRODUCED, AGGREGATED↔DISAGGREGATED, WITHDRAWN/WRITTEN_OFF/EXPIRED), REPRINTED не меняет статус; негативный тест «не прыгает мимо машины»; SsscCounter {tenantId, nextSeq} + generateSssc (детерминированный GCP из tenantId). 150/150 тестов. Fix `c429af1`: generateSssc — tenant-scoped автоинкремент через SsscCounter (HIGH ревью).

**W4 тикет 02 (labels): ЗАКРЫТ** (11.08). Коммит `0f064b2`: DataMatrix ECC200 roundtrip bwip-js→ZXing-WASM (`@sec-ant/zxing-wasm` — замена недоступного `@nicolo-ribaudo/zbar-wasm`; undecaf/zbar-wasm и zbar.wasm не умеют DataMatrix); LabelService renderPng/decodePng (raw ADR-006 с байтом 0x1D, parsefnc, backgroundcolor=ffffff обязателен — прозрачный фон ломал контраст); POST /labels/:codeKey/print (ACTIVE→PRINTED, write-through), /reprint (AT-11: словарик причин, OTHER→comment≥5, тот же key content-addressed labelKey), /codes/:codeKey/apply (PNG→decode→deepEqual→APPLIED, mismatch 400); GET /codes/:orderId/codes (individual); веб-кнопки Печать/Перепечатать (модалка причины) + превью PNG; e2e-browser «печать → скан (APPLIED)». 157/157 тестов.

| Неделя      | Циклы  | Содержание                                                                                                                                                          | Стоп-тесты                                                                         |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| W1 04–08.08 | C0, C2 | скелет, CI-gate, OpenAPI-скелет, EntityList; IAM+tenant+онбординг (мок 1ecom)                                                                                       | дубль заявки не создаётся (AT-02); запрос без tenant_id падает (AT-16)             |
| W2 10–14.08 | C3     | каталог (4 тикета .scratch/mvp1): schema (44 attr, ADR-021) → import (4 канала+ТНВЭД+дубли) → moderation (CAT-013+GtinResolver+NktAdapter) + files (StorageAdapter) | инвойс-фикстура парсится; 27101919 отклоняется; левый ключ JSONB=400               |
| W3 17–21.08 | C4, C5 | биллинг double-entry + пополнение файлом 1С; заказ КМ + симулятор ИС МПТ + Code Vault + таймер 30 дней                                                              | 10 повторов=1 заказ (AT-07); заказ при нуле не уходит (AT-06); конкурентный резерв |
| W4 24–28.08 | C6, C7 | этикетки (bwip-js, roundtrip), нанесение/агрегация (мок), документы ввоз/вывод (мок), экспорт 1С, дашборд, demo-данные                                              | roundtrip совпал (LBL-037); повторная печать только с причиной (AT-11)             |

Демо-сценарий: инвойс → 38 черновиков → ТНВЭД-фильтр (wow) → автозаполненная карточка → заказ 1000 КМ → эмиссия симулятором → Code Vault + таймер → печать → скан телефоном → нанесение → списание → акт-файл для 1С.

## Волны интеграций (после доступов)

1. Сен: ИС МПТ real (adapters.mpt=http; контрактные тесты; замер лимитов на STAGE).
2. Окт: GS1, НКТ, 1С боевой транспорт, банк/выписки.
3. Ноя: 1ecom по договору, ЭДО/ЭЦП.
4. Дек–янв: UAT (AT-01…AT-18), нагрузочное 150%, hardening, PROD. К 01.02.2027 — оборот (глава 11).

## Chore (после демо 08.08)

- **Унифицировать module system монорепо (ESM):** сейчас api — CJS (ts-node) + shared — ESM с dual-package (dist/cjs, `9104920`); перевести монорепо на ESM целиком (api на tsx/NodeNext), убрать dual-package. Драйвер: фикс демо-блокера.

## Настоящее vs мок в прототипе

Настоящее: бизнес-логика, статус-машины, биллинг, Code Vault, DataMatrix, таймеры, UI, аудит.

Мок: 1ecom, GS1, НКТ, банк, 1С (файлы), ИС МПТ = симулятор по спеке (те же методы/статусы/задержки; фейк-КМ структурно валидны по п.19 Правил).
