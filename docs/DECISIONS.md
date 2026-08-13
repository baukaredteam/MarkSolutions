# ADR — принятые решения

- ADR-001 Модульный монолит; вынос Integration Hub/Code Vault — только по боли.
- ADR-002 Изоляция tenant ЛОГИЧЕСКАЯ (tenant_id везде + Prisma-guard), не физическая БД.
- ADR-003 Оферта в MVP-1 = акцепт (клик+скан+аудит); ЭЦП — фаза 3 (ТЗ DOC-051 Should).
- ADR-004 1ecom: порт IEcomAdapter + MockEcomAdapter (ручной режим), реальный — по договору.
- ADR-005 Ports&Adapters: конфиг adapters.<system>=mock|http; симулятор ИС МПТ реализует IMptAdapter и используется в контрактных тестах.
- ADR-006 Каноническая модель КМ: структура {gtin, serial, ai91, ai92} + form base|extended; raw-строка с GS(0x1D) — лишь сериализация; рендер/парсинг только из структуры.
- ADR-007 Биллинг double-entry; баланс=сумма проводок; деньги BigInt в целых тенге (дробных единиц нет); резерв — портабельный optimistic CAS на Account.version (SQLite↔PG), FOR UPDATE допустим на PG только как оптимизация при росте конкуренции, не как условие корректности; списание КМ = регистрация сведений о нанесении (п.26 Правил).
- ADR-008 UI-таблицы = один data-driven EntityList + конфиги (вкладки = конфиги, не страницы).
- ADR-009 Valkey вместо Redis; OpenBao вместо Vault (лицензии RSAL/BSL не OSI).
- ADR-010 1С: контракт v1 (PaymentImport идемпотентно по ref1c; ServiceAct; MovementJournal только с хешами КМ); транспорт MVP = файлы; 1С — система записи бухгалтерии, не MarkFlow. PaymentImport-эндпоинт расширяемый: принимает JSON-строку (ядро — идемпотентность по ref1c), multipart-загрузка файла — в тикете 06 (web+api upload), формат файла по контракту v1.
- ADR-011 ТНВЭД-фильтр перечня ДО создания карточки; подсказка «возможно 2710198200».
- ADR-012 Дедлайны Правил = данные (таблица: срок→отсчёт→календ/раб→пункт), не хардкод в UI.
- ADR-013 Контекст агента = дистиллированные md (anydoc-raw — fallback); бинарники не читаются.
- ADR-014 Утверждён профиль прототипа и портабельная схема (см. ADR-015, ADR-016).
- ADR-021 JSON-схема 44 атрибутов — источник истины карточки (additive-only, ленивая миграция через app-мапперы, трёхъярусная обязательность).
- ADR-022 ТНВЭД-фильтр на уровне карточки, не инвойса (двухфазный, две аудируемые кнопки, эвристика п.15).
- ADR-023 Закрытие T3 — каталог сквозной; каталог не меняется до второй товарной группы; будущие изменения — только через CAT-010 (конфигурируемые группы) с отдельной фазой.
- ADR-024 Заказ КМ + Code Vault (W3): снимок единиц маркировки в строке заказа; тарифы = данные (Tariff seed); Ledger TOPUP/RESERVE/RELEASE/SETTLE + optimistic CAS на Account.version; симулятор ИС МПТ stateless (SIM_MPT_EMISSION_MS); Code Vault AES-256-GCM (KMS_PROFILE) + маска; поллер=сверка ORD-029; cisType=UNIT, serialNumberType=OPERATOR.
- ADR-025 W4 — этикетки/нанесение/документы/1С: DataMatrix ECC200 roundtrip (bwip-js → ZBar WASM, PNG); CodeVault.status MVP-набор (ACTIVE|PRINTED|APPLIED|UTILISED|INTRODUCED|EXPIRED|AGGREGATED|WITHDRAWN|WRITTEN_OFF) + CodeEvent append-only; AggregationUnit SSCC + AT-13; ImportDocument + withdrawal; 1С-экспорт CSV v1 проекции (ServiceAct + MovementJournal с kmHash); REPRINT (AT-11); дашборд «что дальше».

## ADR-015 — профиль прототипа: SQLite + LocalStorage + OutboxPoller

Контекст: ноутбук разработчика; Docker недоступен (≈40 ГБ, не ставим). Нужен живой прототип к демо.

- БД: SQLite через Prisma adapter. datasource sqlite в dev; прод = PostgreSQL 16 (та же schema, адаптация типов).
- Очередь: in-process OutboxPoller — запись в таблицу outbox + опрос в том же процессе; прод = RabbitMQ.
- Файлы (этикетки/инвойсы): локальная папка storage/; прод = MinIO.

Замены только инфраструктурные, бизнес-логика не меняется (Ports&Adapters, ADR-005). Прод-контур (postgres/valkey/rabbitmq/minio) готов в docker-compose.yml — ждёт деплоя на сервер.

## ADR-016 — портабельная схема БД (SQLite↔PostgreSQL)

- Без enum в Prisma: enum → String + валидация на уровне приложения; статусы — String, не enum.
- Без массивов: массив → JSON-строка с валидацией на уровне приложения (прод = native array PostgreSQL).
- Деньги: BigInt в тиынах (KZT, 1 ₸ = 100 тиын; минорные, float запрещён); формат — formatTenge (W5-07 апдейт ADR-016).
- Оптимистическая блокировка: поле version Int @default(0); UPDATE только с WHERE version = {n}; конфликт → retry/409.
- Время: DateTime (Prisma прозрачно: TEXT в SQLite / TIMESTAMP в PostgreSQL).
- Миграции проверяем на обеих БД контрактным тестом.

## ADR-017 — единый формат ошибок (Приложение B ТЗ) + глобальный tenant-guard (обновлён в T1)

Изменение внешнего контракта API — фиксируется как решение.

- Все ошибки возвращаются в едином формате Приложения B ТЗ: `{code, message, details, fieldErrors, correlationId, retryable}` (AllExceptionsFilter).
- `code` = HTTP-статус; `correlationId` = UUID; `retryable = status >= 500`.
- **T1 апдейт**: AT-16 = **401 Unauthorized** (отсутствует/невалидный JWT), 400 не используется для аутентификации; код 403 зарезервирован за ролевой guard / MFA.
- **T1 апдейт**: tenant читается ИСКЛЮЧИТЕЛЬНО из JWT-клейма; заголовок `x-tenant-id` игнорируется (атака header-spoofing закрыта).
- **T1 апдейт**: TenantGuard + RolesGuard глобальные (APP_GUARD). Публичные роуты помечаются `@Public()`: /health, /onboarding/applications (POST), /auth/login — ровно три; в MVP также GET /onboarding/applications/:id (для веб-статуса без JWT) и /operator/approvals (оператор-мок без auth — будет закрыт при появлении операторского UI, см. review-t1.md).

## ADR-020 — MFA обязательный для ролей admin/accountant/operator/marking при MFA_ENABLED=true

Фикс ловушки IAM-006: в изначальной трактовке MFA требовался только если `user.mfaEnabled == true`. Это позволяло обойти второй фактор, не включая флаг у пользователя (ловушка в тесте: токен выдавался с mfaCompleted=true даже при MFA_ENABLED=true).

- **При MFA_ENABLED=true** обязательные роли (admin, accountant, operator, **marking**) требуют второй фактор НЕЗАВИСИМО от `user.mfaEnabled`. marking — оператор маркировки+печати, имеет доступ к КМ (печать/apply/экспорт) → MFA-обязательна (T0-RBAC).
- manager, warehouse, viewer — MFA НЕ обязательна (нет прямого доступа к КМ; warehouse получает доступ в будущем через WMS-POST, будет пересмотрен).
- Поле `user.mfaEnabled` НЕ участвует в расчёте `mfaRequired` (IAM-006 заглушка: все обязательные роли требуют фактор при включённом флаге, юзер-флаг — для будущих настроек на пользователя).
- Негативный тест: MFA_ENABLED=true на момент probe, JWT без mfaCompleted → 403 Forbidden. Флаг НЕ сбрасывается до проверки.

## ADR-019 — инвойс — недоверенный черновик

Инвойс (любой формат: Excel/CSV/PDF/ручной ввод) не является источником истины.

- Любой инвойс → `DraftProposal` (confidence + missing): набор предполагаемых полей с уверенностью и списком недостающего. Ничего не валидируется как «факт» на этом шаге.
- **Карточка товара (44 атрибута, CATALOG-MM) — единственный валидируемый источник.** ТНВЭД-фильтр и обязательность полей применяются на уровне карточки, не на уровне инвойса.
- Нехватка данных = состояние «добор» (missing в DraftProposal), а НЕ ошибка: пользователь дополняет, карточка собирается только из валидированных значений.
- Каналы импорта в MVP: **Excel-шаблон (CAT-012) > per-client конфиг-адаптер > ручная форма.** Универсальный парсер / LLM-извлечение — после MVP и только с human-in-the-loop.
- Фикстура `fixtures/invoice-38.json` = 38 реальных строк инвойса Nomad + 2 синтетические demo (помечены `demo: true`) — демо-данные, не бизнес-правило.

## ADR-021 — JSON-схема 44 атрибутов как источник истины карточки

JSON-схема атрибутов (CATALOG-MM) — единственный источник истины для ProductCard, DraftProposal и Excel-шаблона.

- **Версионирование (CAT-010):** `schemaVersion: Int` в атрибутах карточки и DraftProposal, старт = 1.
- **Эволюция в MVP-1 — additive-only:** новые поля добавляются только как опциональные; отсутствующий ключ в исторических карточках = null/«добор» (ADR-019), не ошибка. Ретроспективной перевалидации НЕТ.
- **Breaking changes запрещены в MVP-1.** Если неизбежны — Change Request: schemaVersion → v(n+1); маппинг v(n)→v(n+1) живёт в приложении (модуль каталога: версионированные mapper-функции + реестр, unit-тесты), применяется лениво — при правке карточки (новая версия по CAT-011, валидация по свежей схеме).
- **DB-миграции НЕ трогают Json-семантику** — только колоночные изменения; все трансформации Json — через app-маппер (безопасный откат).
- **Обязательность — трёхъярусная** (колонка «Обязательность» Рекомендаций):
  - **Ярус A** (блокирует Submitted, все «Да»): A-ручные = GTIN(1), наименование(5), товарный знак(6), страна знака(7), состав(11), срок годности(12), вид товара(13), объём(14), назначение(15), SAE(16), хранение(17), знак соответствия(23), знаки обращения(24), вес брутто(27); A-авто = группа(2), категория(3), тип упаковки(4), КПВЭД(8), GPC(9), ТНВЭД(10), владелец 33–36, площадка 37–39, участник 40, 42–44.
  - **Ярус B** (опциональные «Нет», валидируются при заполнении): декларация 18–22, вид/материал упаковки 25–26, ед. веса 28, габариты 29–31, фото 32 (если есть — ≥2: лицевая+обратная), GCP участника 41.
- **Фото/файлы (ярус B)** через StorageAdapter: дескриптор `[{key, originalName, mimeType, contentHash, uploadedAt, label}]`; reuse ключей при клоне/новой версии (файлы иммутабельны, физического удаления нет); GET защищён tenant-контролем через карточку (IDOR, дух AT-16).
- **Excel-шаблон per-product-group**, генерируется на лету из схемы (репо: генератор + golden-снапшот в fixtures/). GET /templates/:productGroup. Дескриптор несёт productGroup+schemaVersion.

## ADR-022 — ТНВЭД-фильтр на уровне карточки, а не инвойса

Согласование ADR-011 (фильтр рано) и ADR-019 (фильтр на карточке). Двухфазный фильтр.

- **Фаза 1 — DraftProposal (инвойс/Excel/парсер): мягкая пометка.** Строка с ТНВЭД вне перечня {2710198200, 3403191000, 3403199000, 3403990000} → красная + подсказка «возможно 2710198200» + статус «добор». Создание черновика/импорт НЕ блокируются (инвойс не источник истины).
- **Фаза 2 — карточка при Submitted: жёсткий гейт.** Гейт блокирует НЕ «вне перечня», а «вне перечня И без решения».
- **Два аудируемых действия на красной строке:**
  - «Исправить код» — ошибка данных: выбор кода из перечня (подсказка 2710198200), строка → карточка → Submitted.
  - «Не подлежит маркировке» — вне скоупа: подтверждение корректности ТНВЭД; строка получает терминальный статус «вне скоупа», НЕ становится карточкой, видна отдельным списком с причиной и кем подтверждена.
  - Дефолт — ни то ни другое; пока решения нет — строка висит в «доборе».
- **Эвристика наименования (п.15 Правил — «руководствоваться кодом И наименованием»):** если наименование содержит маркеры моторного масла (масло, SAE, ATF, API, ACEA, GL-) при ТНВЭД вне перечня — усилить подсказку в сторону «исправить код». Фикстура Nomad (38 строк 27101919) — тестовый случай.
- Все переходы и решения аудируются (кто/когда/основание).

## ADR-023 — закрытие T3: каталог сквозной, заморожен до второй товарной группы

Контекст: каталог «Моторные масла» прошёл все четыре тикета T3 (schema → import → moderation → files) и стал сквозной вертикалью: черновик → добор → карточка → модерация → регистрация → файлы. Дальше вертикаль КМ (заказ, этикетки, документы) строится на уже зафиксированном каталоге.

- **Каталог больше НЕ меняется** (ни поля, ни справочники, ни обязательность) до появления второй товарной группы.
- **Будущие изменения каталога — ТОЛЬКО через CAT-010 (конфигурируемые товарные группы)** и только в отдельной фазе: выделение схемы «моторные масла» в конфиг-группу, реестр групп, per-group валидация/справочники/шаблоны. НЕ инкрементально, НЕ «попутно» с другими фичами.
- Пока CAT-010 не выведен — любые правки в `CATALOG-MM`, `motorOilSchemaV1`, справочниках или машине модерации для каталога считаются изменением замороженного контура и требуют отдельного решения.
- Исключение — исправление дефектов, не меняющих контракт: баги валидации/модерации/файлов фиксируются как обычно, но без расширения атрибутов и без смены правил обязательности.

## ADR-024 — заказ КМ + Code Vault (W3)

Решения грилля W3 (grill-with-docs, 10 вопросов). Дорожка «Заказы кодов» + деньги.

### Единицы маркировки и снимок заказа

- Единицы маркировки — НЕ сущность, а снимок в строке заказа: `{places, unitsPerPlace, quantity, totalPrice, cisType, serialNumberType}`.
- quantity по умолчанию = places × unitsPerPlace (превью в UI), пользователь может уменьшить до 1; валидация `1 ≤ quantity ≤ places×unitsPerPlace`.
- places/unitsPerPlace — из инвойса/packing list (если заказ связан с поставкой) либо ручной ввод.
- MVP заказ однопозиционный (1 заказ = 1 строка); многопозиционность — позже, таблица OrderLine (адаптер уже принимает `products[]`).

### Тарифы и деньги

- Цена карточки/инвойса в биллинге НЕ участвует (у карточки цены нет — ADR-023; `priceUsd` инвойса — закупочная цена, вне биллинга MarkFlow).
- **Tariff**: `{id, validFrom, validTo, pricePerCodeKZT (BigInt целые тенге, дробных единиц нет), unit="KM", currency="KZT"}` — данные в БД (seed), не хардкод. Выбор = активный на дату; нет активного → заказ отклоняется «тариф не настроен». Заказ хранит снимок `{tariffId, pricePerCodeKZT}`; totalPrice = quantity × pricePerCodeKZT.
- **isPaid** в POST /api/orders всегда true (резерв создаётся атомарно с заказом; при 0 баланса заказ не создаётся, AT-06).
- **Ledger** (ADR-007): TOPUP / RESERVE / RELEASE / SETTLE; balance = материализованный кэш; available = balance − SUM(активных RESERVE).
- Резерв: optimistic CAS на Account.version (`UPDATE ... WHERE id=? AND version=?`), портабельно SQLite↔PG, БЕЗ FOR UPDATE в коде; FOR UPDATE на PG — только оптимизация при росте конкуренции. Конфликт → до 3 ретраев с backoff, затем 409. RESERVE уникален по (orderId, kind).
- Создание заказа: одна транзакция = заказ + RESERVE + outbox `send-order-to-mpt`; отправка поллером после коммита (Idempotency-Key = orderId, AT-07).
- Освобождение — явный RELEASE (компенсация, не откат); отмена до эмиссии → RELEASE; после эмиссии отмена запрещена. SETTLE — только при регистрации нанесения (п.26).

### Симулятор ИС МПТ (Q5)

- Stateless: `status = f(now, createdAt, config)`, без setTimeout. PENDING пока `now-createdAt < SIM_MPT_EMISSION_MS` (демо 45 с, тесты 50–100 мс), затем READY.
- Коды генерируются ОДИН раз при первом переходе в READY, сохраняются (GET /api/codes идемпотентен). Валидны по п.19 + ADR-006.
- Поллер MarkFlow (MPT_POLL_MS) опрашивает getStatus; PENDING дольше MPT_ORDER_TIMEOUT_MS → Failed + RELEASE + задача оператору (ID-017).
- Внешние CREATED|PENDING|READY маппятся на внутреннюю машину ORD-026 (Sent→Processing→Completed).

### Code Vault (CV-030…033)

- Строка Vault: gtin ОТКРЫТЫЙ (индекс) + шифрованный `{serial, ai91, ai92}` (AES-256-GCM, per-row nonce рядом с ciphertext) + метадата {orderId, cardId, tenantId, status, createdAt, mask}. Ключи через KMS_PROFILE (file-KMS dev / OpenBao prod). Хешей полного КМ нет.
- Маска КМ: gtin открыт + serial «первые 2 + … + последние 2» при length>6, иначе скрыт полностью. Полный КМ — только печать этикетки и экспорт, с аудитом CV-032.
- Экспорт CSV: `gtin, serial, ai91, ai92, form, km_full, orderId`; km_full с литералом `<GS>` (текст, не 0x1D); UTF-8 BOM, «;»; только READY/Completed (иначе 409); tenant-scoped; роли admin/accountant; каждая выгрузка = аудит.
- serialNumberType всегда OPERATOR; SELF_MADE → 400 (фаза с tenant-конфигом схемы). cisType всегда UNIT; GROUP/SET → 400 (агрегация — W4/C6).

### Reconciliation (ORD-029)

- Поллер = сверка: опрашивает ВСЕ незакрытые заказы каждые MPT_POLL_MS и догоняет пропущенные статусы. Дневного джоба в MVP НЕТ (эволюция: после боевой интеграции — независимый дневной контрольный контур).
- Расхождение количества → Partially Completed + задача оператору, БЕЗ авто-финкорректировки (SETTLE по фактическому количеству при нанесении + RELEASE разницы оператором).

### Таймер 30 дней (п.25, ADR-012)

- От даты получения КМ; алерты 7/3/1; аннулирование = смена статуса, не физическое удаление; дедлайны = данные.

## ADR-025 — W4: этикетки / нанесение / документы / 1С

Решения грилля W4 (grill-with-docs, 10 вопросов).

### DataMatrix roundtrip (LBL-037)

- Генерация: **bwip-js** (DataMatrix ECC200, includetext=false, parsefnc=true, scale/module=4px, quietzone=4, rotate=N, ASCII ч/б). **ТОЛЬКО PNG** (Zebra/TSC принимают PNG); SVG/PDF — эволюция.
- Декод: **@nicolo-ribaudo/zbar-wasm** (ZBar WASM, промышленный декодер DataMatrix ECC200, сырые байты, корректный GS 0x1D; НЕ jsQR/QR-only, НЕ zxing — плохой GS). Node + браузер (демо «Сканировать камерой»).
- Roundtrip-тест: bwip-js → PNG → ZBar → parseGS1(ADR-006) → {gtin,serial,ai91,ai92,form} → deepEqual. base + extended. Тихая зона/контраст = параметры генерации (эталонного сканера нет, ADR-015). SSCC (Code128 AI='00') — отдельный кейс на том же ZBar.
- Хранение: одна этикетка = один PNG-файл в storage/ (StorageAdapter.write→key); дескриптор {key, mimeType:"image/png", contentHash, createdAt, label:"datamatrix"}. Печать: `<img src="data:image/png;base64">` + window.print().

### Статусы КМ (CodeVault.status, MVP-набор из ТЗ §8.4)

- **ACTIVE | PRINTED | APPLIED | UTILISED | INTRODUCED | EXPIRED | AGGREGATED | WITHDRAWN | WRITTEN_OFF**.
- APPLIED ≠ UTILISED (п.26): APPLIED = физически нанесён, UTILISED = зарегистрировано в ИС МПТ (SUCCESS). Пропущены: Reserved for Print, In Stock, Shipped, Transferred, Accepted, Damaged, Lost, Replaced, Cancelled.
- **CodeEvent** — append-only лог: {id, tenantId, codeKey, event: PRINTED|REPRINTED|APPLIED|AGGREGATED|DISAGGREGATED|UTILISED|INTRODUCED|EXPIRED|WITHDRAWN|WRITTEN_OFF, at, actor, reasonCode?, comment?, relatedId?}. CodeVault.status = производная от последнего события.

### Агрегация SSCC (п.20)

- **AggregationUnit** {id, tenantId, sscc, type: BOX_LV_1|BOX_LV_2|PALLET, parentId?, status: OPEN|SEALED|DISAGGREGATED, sealedAt?} + **AggregationMember** {unitId, codeKey, addedAt, addedBy}. SSCC — не КМ, не эмитируется оператором; генерируется участником (GS1). **AT-13**: один codeKey не в двух активных агрегатах. AGGREGATED/DISAGGREGATED — события CodeEvent (relatedId = unit).
- SSCC-генерация: `"0" + gcp + seq.padStart(9,"0") + mod10`; gcp = первые 7 цифр sha256(tenantId) mod 10^7 (детерминирован, прод — реальный GCP GS1 KZ через ADR-005); seq — tenant-scoped auto-increment (SsscCounter).
- Общая **verifyGs1Mod10(digits)** + **gs1Mod10CheckDigit(base)** (веса 3/1 справа налево) — заменяет verifyGtinMod10.

### Документы

- **ImportDocument** (уведомление о ввозе, doc/import): одна ДТ на партию (MVP — по заказу, все APPLIED-коды); {id, tenantId, orderId, codes[], customsDeclaration{date,number,authorityCode?}, status EXPECTED|SUBMITTED|SUCCESS|ERROR, rejectReason?}; без date+number → 400 «ДТ не заполнена»; unique (tenantId, number) → повтор 409; SUCCESS → INTRODUCED-события; ERROR → задача оператору (ID-017).
- **Вывод из оборота** (doc/withdrawal): POST /withdrawal по codeKeys, обязательные withdrawalType (WITHDRAWAL→WITHDRAWN / WRITE_OFF→WRITTEN_OFF) + withdrawalReason (словарик {DEFECT, LOST, EXPIRY, RETURN_SUPPLIER, DESTRUCTION, OTHER}, OTHER→comment ≥5) + withdrawalDate; childrenWriteOff=true → рекурсивный вывод членов агрегата; член активного SEALED-агрегата в одиночку → 409; повторный вывод → 409; partialQuantity → 400 в MVP; primaryDocument{type,date,number} опционален.

### Экспорт 1С (ADR-010, MVP = CSV, v1; проекции append-only источников)

- `markflow-service-act-v1-{from}-{to}.csv` (date;refOrderId;amountKZT;reason — SETTLE-проводки из LedgerEntry, amountKZT целые тенге).
- `markflow-movement-journal-v1-{from}-{to}.csv` (eventId;date;orderId;gtin;kmHash;event — проекция CodeEvent за [from,to) UTC; kmHash = SHA-256 канонической raw-строки ADR-006 с байтом 0x1D; **полные КМ в 1С не уходят**). eventId — стабильный дедуп-ключ для 1С; пересечения периодов легитимны. Детерминизм: sort (at, eventId), golden-снапшот.
- Генерация по запросу `POST /1c/export {dateFrom,dateTo}` + аудит генерации; БЕЗ cron. docs/CONTRACT-1C.md (дистиллят контракта v1). Эволюция: XML/правила обмена — с 1С-интегратором (октябрь).

### Повторная печать (AT-11/LBL-040) и дашборд

- REPRINT: кнопка «Перепечатать» + модалка reasonCode {PRINT_DEFECT, DAMAGED_BEFORE_APPLY, LOST_LABEL, OTHER} (OTHER→comment ≥5) → тот же PNG key (content-addressed) + REPRINTED-event {reasonCode, comment?, relatedId}. APPLIED-код → 409 «требуется перемаркировка» (REMARK — эволюция). Без причины → 400. POST /labels/:codeKey/reprint.
- Дашборд «что дальше»: вкладка «Документы» (EntityList по IMPORT/WITHDRAWAL/UTILISATION/SERVICE_ACT_EXPORT) + GET /dashboard/summary (5 счётчиков COUNT по существующим таблицам, БЕЗ cron/материализации: codesNotApplied, deadlineSoon, openAggregates, docsPendingDt, exceptions; нулевые скрыты). Роли: tenant admin/accountant a–d+свои e; operator — только очередь исключений.
