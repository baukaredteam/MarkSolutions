# Review T1 (main..feat/t1-onboarding, bd91d6a)

Дата: 2026-08-06. Фокус-чеклист 9 пунктов.

## Критичные — нет (0 HIGH)

## Некритичные (MEDIUM/LOW)

| #   | Severity | Замечание                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | MEDIUM   | Пункт 6: @Public() не «ровно три, а пять»: /health, /onboarding/applications POST, /auth/login = OK. Но ещё @Public на GET /onboarding/applications/:id (нужен веб-странице «Проверить статус» без JWT — defensible) и на /operator/approvals (оператор-мок MVP — auth бутстрапинг: некому одобрять, если закрыть апрувы JWT). Операторский апрув будет защищён в T1-production с ролевой моделью. |
| 2   | LOW      | `provisionTenant` принимает PrismaClient, но вызывается с `this.prisma` (PrismaService extends PrismaClient — корректно, но теряется DI-контекст). При переходе на multi-tenant в проде можно переписать на PrismaService-метод.                                                                                                                                                                   |
| 3   | LOW      | GET /onboarding/applications/:id — таймлайн хардкоден (`"Заявка создана"` + `"Одобрена"`). В проде нужна таблица событий со статус-машиной §8.1.                                                                                                                                                                                                                                                   |
| 4   | LOW      | `ecomRetries` в Application schema — не обновляется кодом (MockEcomAdapter имеет свой внутренний счётчик). Поле остаётся 0 даже после retry.                                                                                                                                                                                                                                                       |
| 5   | INFO     | `http.spec.ts` beforeAll не применяет миграции к tmp-БД (в отличие от onboarding.spec.ts) — но health работает (SELECT 1 без таблиц) и AT-16/header-тесты не требуют Application.                                                                                                                                                                                                                  |
| 6   | INFO     | `@Res({passthrough:true})` — Express-coupling в onboarding controller. При смене платформы (Fastify) потребуется адаптация метода `res.status(200)`.                                                                                                                                                                                                                                               |
| 7   | INFO     | `MFA_ENABLED` в .env — строковый буль-флаг. Для прод-а нужен конфиг-сервис с typed values (Ponytail: сейчас минимально).                                                                                                                                                                                                                                                                           |

## Пункты без замечаний (✓)

| #   | Статус                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ✓ tenant-guard читает tenant ТОЛЬКО из JWT-клейма; header игнорируется; тест «x-tenant-id без JWT → 401» в http.spec.ts                                                                               |
| 2   | ✓ provisioning атомарен: `$transaction` (tenant+счёт+роли); юнит-тест ROLLBACK; повторное одобрение идемпотентно (1 tenant)                                                                           |
| 3   | ✓ MFA: при `MFA_ENABLED=true` и обязательной роли вход без второго фактора = 403, НЕЗАВИСИМО от `user.mfaEnabled`; тест держит флаг включённым в момент probe                                         |
| 4   | ✓ MockEcomAdapter за портом IEcomAdapter (токен `ECOM_ADAPTER`); ручное одобрение оператора через тот же порт; Pending External + retry (2й вызов → VERIFIED)                                         |
| 5   | ✓ AT-02: дубль БИН возвращает 200 + существующая заявка, count=1; не создаёт вторую                                                                                                                   |
| 7   | ✓ consent: Application хранит `consentDocument="offer-v1"`, `consentAcceptedAt`=ISO, `consentSubject`; версия валидируется (400 при != offer-v1)                                                      |
| 8   | ✓ PrismaService extends PrismaClient; $transaction работает; все тесты с транзакциями зелёные                                                                                                         |
| 9   | ✓ @types/express + @nestjs/jwt в корневых devDeps/deps api; без дубликатов; миграция 20260806171702_t1_onboarding портабельна (ADR-016: String, BigInt, Json, version); применима на свежей SQLite ✅ |

## Верификация

- npm test: 9 файлов, 26 тестов ✓
- npm run typecheck: exit 0 ✓
- npm run lint: exit 0 ✓
- npm run secret-scan: exit 0 ✓
- npm run build --workspace @markflow/web: exit 0 ✓
