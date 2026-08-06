# ADR — принятые решения

- ADR-001 Модульный монолит; вынос Integration Hub/Code Vault — только по боли.
- ADR-002 Изоляция tenant ЛОГИЧЕСКАЯ (tenant_id везде + Prisma-guard), не физическая БД.
- ADR-003 Оферта в MVP-1 = акцепт (клик+скан+аудит); ЭЦП — фаза 3 (ТЗ DOC-051 Should).
- ADR-004 1ecom: порт IEcomAdapter + MockEcomAdapter (ручной режим), реальный — по договору.
- ADR-005 Ports&Adapters: конфиг adapters.<system>=mock|http; симулятор ИС МПТ реализует IMptAdapter и используется в контрактных тестах.
- ADR-006 Каноническая модель КМ: структура {gtin, serial, ai91, ai92} + form base|extended; raw-строка с GS(0x1D) — лишь сериализация; рендер/парсинг только из структуры.
- ADR-007 Биллинг double-entry; баланс=сумма проводок; резерв FOR UPDATE; списание КМ = регистрация сведений о нанесении (п.26 Правил).
- ADR-008 UI-таблицы = один data-driven EntityList + конфиги (вкладки = конфиги, не страницы).
- ADR-009 Valkey вместо Redis; OpenBao вместо Vault (лицензии RSAL/BSL не OSI).
- ADR-010 1С: контракт v1 (PaymentImport идемпотентно по ref1c; ServiceAct; MovementJournal только с хешами КМ); транспорт MVP = файлы; 1С — система записи бухгалтерии, не MarkFlow.
- ADR-011 ТНВЭД-фильтр перечня ДО создания карточки; подсказка «возможно 2710198200».
- ADR-012 Дедлайны Правил = данные (таблица: срок→отсчёт→календ/раб→пункт), не хардкод в UI.
- ADR-013 Контекст агента = дистиллированные md (anydoc-raw — fallback); бинарники не читаются.
- ADR-014 Утверждён профиль прототипа и портабельная схема (см. ADR-015, ADR-016).

## ADR-015 — профиль прототипа: SQLite + LocalStorage + OutboxPoller

Контекст: ноутбук разработчика; Docker недоступен (≈40 ГБ, не ставим). Нужен живой прототип к демо.

- БД: SQLite через Prisma adapter. datasource sqlite в dev; прод = PostgreSQL 16 (та же schema, адаптация типов).
- Очередь: in-process OutboxPoller — запись в таблицу outbox + опрос в том же процессе; прод = RabbitMQ.
- Файлы (этикетки/инвойсы): локальная папка storage/; прод = MinIO.

Замены только инфраструктурные, бизнес-логика не меняется (Ports&Adapters, ADR-005). Прод-контур (postgres/valkey/rabbitmq/minio) готов в docker-compose.yml — ждёт деплоя на сервер.

## ADR-016 — портабельная схема БД (SQLite↔PostgreSQL)

- Без enum в Prisma: enum → String + валидация на уровне приложения; статусы — String, не enum.
- Без массивов: массив → JSON-строка с валидацией на уровне приложения (прод = native array PostgreSQL).
- Деньги: BigInt в минорных единицах; float запрещён.
- Оптимистическая блокировка: поле version Int @default(0); UPDATE только с WHERE version = {n}; конфликт → retry/409.
- Время: DateTime (Prisma прозрачно: TEXT в SQLite / TIMESTAMP в PostgreSQL).
- Миграции проверяем на обеих БД контрактным тестом.

## ADR-017 — единый формат ошибок (Приложение B ТЗ) + глобальный tenant-guard

Изменение внешнего контракта API — фиксируется как решение.

- Все ошибки возвращаются в едином формате Приложения B ТЗ: `{code, message, details, fieldErrors, correlationId, retryable}` (AllExceptionsFilter).
- `code` = HTTP-статус; `correlationId` = UUID; `retryable = status >= 500`.
- AT-16 (запрос без tenant_id) = **400** — единственный используемый код; 403 не применяется (нет ролевой модели до T1).
- TenantGuard глобальный (APP_GUARD); публичные роуты помечаются `@Public()` (health); данные бизнес-эндпоинтов доступны только с заголовком `x-tenant-id`.
