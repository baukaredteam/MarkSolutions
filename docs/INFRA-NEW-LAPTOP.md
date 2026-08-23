# INFRA-NEW-LAPTOP — диагностика Docker/WSL на новом ноутбуке

**Дата:** 2026-08-14
**Цель:** зафиксировать состояние контейнерного контура (ШАГ 2 аудита). Код не менялся — только диагностика.

## Вывод

Dev-профиль по ADR-015 (SQLite + in-process OutboxPoller + file-KMS) **работает без Docker** — Docker/WSL не блокирует разработку. Прод-контур (Valkey/RabbitMQ/MinIO/OpenBao, `docker-compose.infra.yml`) **на этой машине сейчас запустить нельзя**: отсутствует WSL2.

## Факты

| Компонент                   | Состояние                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `wsl --status`              | ❌ «WSL не обнаружена» — рекомендуется `wsl --install`                                |
| `wsl --list --verbose`      | ❌ пусто (дистрибутивов нет)                                                          |
| Служба `com.docker.service` | Stopped, StartType=Manual                                                             |
| Процессы Docker Desktop     | запущены (5), но движок недоступен                                                    |
| `docker info`               | `500 Internal Server Error` на `dockerDesktopLinuxEngine` pipe                        |
| PostgreSQL 18               | ✅ установлен **нативно** (служба `postgresql-x64-18`, Running, Automatic, порт 5432) |

## Диагноз

Docker Desktop на Windows работает через WSL2 Linux-движок. Так как WSL2 не установлена,
Linux engine не стартует → любой вызов `docker`/`docker compose` падает с `500` на
`%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine`. Это блокер только для prod-контура, не для dev.

## Что нужно для запуска прод-контура (один раз)

```powershell
# 1. Установить WSL2 (от администратора) + перезагрузка
wsl --install

# 2. После перезагрузки — поднять контур
docker compose -f docker-compose.infra.yml up -d
docker compose -f docker-compose.infra.yml ps   # все healthy
```

Альтернатива: контур для тестов ИС МПТ можно поднять на любой Linux-машине/сервере —
compose-файл самодостаточен (`infra/` + `docker-compose.infra.yml` в репозитории).

## Влияние на работу

- `npm run dev` / `npm test` — не зависят от Docker (SQLite + in-process poller). ✅
- Контрактные тесты против `test.markirovka.kz` — нужен только реальный URL (HTTP-адаптер), Docker не требуется. ✅
- MinIO/RabbitMQ/Valkey/OpenBao — нужен запущенный Docker (см. выше). ⏳
