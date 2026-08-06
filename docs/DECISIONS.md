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

## ADR-017 — единый формат ошибок (Приложение B ТЗ) + глобальный tenant-guard (обновлён в T1)

Изменение внешнего контракта API — фиксируется как решение.

- Все ошибки возвращаются в едином формате Приложения B ТЗ: `{code, message, details, fieldErrors, correlationId, retryable}` (AllExceptionsFilter).
- `code` = HTTP-статус; `correlationId` = UUID; `retryable = status >= 500`.
- **T1 апдейт**: AT-16 = **401 Unauthorized** (отсутствует/невалидный JWT), 400 не используется для аутентификации; код 403 зарезервирован за ролевой guard / MFA.
- **T1 апдейт**: tenant читается ИСКЛЮЧИТЕЛЬНО из JWT-клейма; заголовок `x-tenant-id` игнорируется (атака header-spoofing закрыта).
- **T1 апдейт**: TenantGuard + RolesGuard глобальные (APP_GUARD). Публичные роуты помечаются `@Public()`: /health, /onboarding/applications (POST), /auth/login — ровно три; в MVP также GET /onboarding/applications/:id (для веб-статуса без JWT) и /operator/approvals (оператор-мок без auth — будет закрыт при появлении операторского UI, см. review-t1.md).

## ADR-020 — MFA обязательный для ролей admin/accountant/operator при MFA_ENABLED=true

Фикс ловушки IAM-006: в изначальной трактовке MFA требовался только если `user.mfaEnabled == true`. Это позволяло обойти второй фактор, не включая флаг у пользователя (ловушка в тесте: токен выдавался с mfaCompleted=true даже при MFA_ENABLED=true).

- **При MFA_ENABLED=true** обязательные роли (admin, accountant, operator) требуют второй фактор НЕЗАВИСИМО от `user.mfaEnabled`.
- Поле `user.mfaEnabled` НЕ участвует в расчёте `mfaRequired` (IAM-006 заглушка: все обязательные роли требуют фактор при включённом флаге, юзер-флаг — для будущих настроек на пользователя).
- Негативный тест: MFA_ENABLED=true на момент probe, JWT без mfaCompleted → 403 Forbidden. Флаг НЕ сбрасывается до проверки.

## ADR-019 — инвойс — недоверенный черновик

Инвойс (любой формат: Excel/CSV/PDF/ручной ввод) не является источником истины.

- Любой инвойс → `DraftProposal` (confidence + missing): набор предполагаемых полей с уверенностью и списком недостающего. Ничего не валидируется как «факт» на этом шаге.
- **Карточка товара (44 атрибута, CATALOG-MM) — единственный валидируемый источник.** ТНВЭД-фильтр и обязательность полей применяются на уровне карточки, не на уровне инвойса.
- Нехватка данных = состояние «добор» (missing в DraftProposal), а НЕ ошибка: пользователь дополняет, карточка собирается только из валидированных значений.
- Каналы импорта в MVP: **Excel-шаблон (CAT-012) > per-client конфиг-адаптер > ручная форма.** Универсальный парсер / LLM-извлечение — после MVP и только с human-in-the-loop.
- Фикстура `fixtures/invoice-38.json` = 38 реальных строк инвойса Nomad + 2 синтетические demo (помечены `demo: true`) — демо-данные, не бизнес-правило.
