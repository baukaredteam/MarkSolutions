# MarkFlow — контекст проекта

Маркировка нефтепродуктов: управление кодами маркировки, интеграции с поставщиками данных и печатью.

## Стек

- NestJS + TypeScript (монорепо npm workspaces)
- Prisma + PostgreSQL 16
- Valkey (кэш)
- RabbitMQ (очереди)
- MinIO (объектное хранилище)

## Структура

```
apps/api       — NestJS API
apps/web       — веб-клиент
packages/db    — Prisma schema и миграции
packages/shared — общие типы/утилиты
docker-compose.yml — локальный контур инфраструктуры
```

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
