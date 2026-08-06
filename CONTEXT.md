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

- **06.08 — T0 (стек), T0-web (веб-каркас), T1 (онбординг-бэкенд), T2 (связка веб↔бэкенд) закрыты.** T1: POST /onboarding/applications (AT-02 дубль БИН), /operator/approvals (provisioning атомарно), JWT-auth c tenant-клеймом, tenant-guard из JWT (ADR-017), MFA-заглушка (IAM-006, ADR-020). T2: /apply, /status, /login на реальных T1-эндпоинтах, api-client с Bearer JWT. 30 тестов.
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
