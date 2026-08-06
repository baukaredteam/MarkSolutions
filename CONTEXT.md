# MarkSolutions — контекст проекта

## Суть

ИС «MarkSolutions» — единое цифровое окно маркировки и прослеживаемости (РК). Первая группа — «Моторные масла» (ТНВЭД: 2710198200, 3403191000, 3403199000, 3403990000). Заказчик: ТОО «Mark Solutions». База требований: ТЗ v2.0 (docs/source/Техническое_задание_ИС_MarkFlow_версия_2.0.md).

## Внешние системы

- ИС МПТ (xTrace API; prod.markirovka.kz / test.markirovka.kz) — единственная полная спека: docs/CONTRACT-IS-MPT.md.
- GS1 (GTIN/GCP), НКТ (НТИН) — спеки ожидаются, адаптеры-заглушки.
- 1ecom.kz — ПУБЛИЧНОГО API НЕТ: порт + ручной режим оператора, реальный — по договору.
- Банк; 1С клиента (обмен v1 файлами, ADR-010); ЭДО/ЭЦП — фаза 3; ОФД/ККМ — наблюдатель.

## Фаза (на 2026-08-06)

Автономный MVP-прототип БЕЗ реальных интеграций (внешнее — за портами с моками; симулятор ИС МПТ ведёт себя по спеке). Демо 31.08–01.09 → доступы → волны интеграций.

## Границы MVP-1

Входит: онбординг (оферта без ЭЦП), каталог (44 атрибута, 4 канала, ТНВЭД-фильтр), GTIN/НТИН (мок+справочник), биллинг (double-entry, пополнение файлом «из 1С»), заказ КМ (симулятор), Code Vault (маска+AES, file-KMS), этикетки (настоящий DataMatrix ECC200 + roundtrip), склад/документы (мок), экспорт в 1С (файлы), дашборд «что дальше».

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
docker-compose.yml — локальный контур инфраструктуры
```

Стек: NestJS+TS, Prisma+PostgreSQL16, Valkey, RabbitMQ, MinIO, OpenBao(prod)/file-KMS(dev), bwip-js, React+Vite, EntityList.

## Как запустить локально

```bash
# 1. Поднять инфраструктуру (PostgreSQL 16, Valkey, RabbitMQ, MinIO)
docker compose up -d

# 2. Установить зависимости
npm install

# 3. Конфигурация
cp .env.example .env

# 4. Сгенерировать Prisma client
npm run generate --workspace @markflow/db

# 5. Запустить API (порт 3000)
npm run start --workspace @markflow/api
```

Полезные порты: MinIO консоль `http://localhost:9001`, RabbitMQ UI `http://localhost:15672` (markflow/markflow).

## Git-дисциплина

- Pre-commit: prettier + eslint + tsc --noEmit + secret-scan
- Прямой push в `main`/`master` заблокирован хукoм `pre-push` — только через pull request
