# Review T0 (main..feat/t0-stack)

Дата: 2026-08-06. Фокус-чеклист 8 пунктов.

## Критичные — исправлено в коммите

| #   | Severity | Замечание                                                                                    | Статус                                                                                                                                                                                                       |
| --- | -------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | HIGH     | LocalStorageAdapter: path traversal в `read(key)` (`join(root, key)` без санации)            | Исправлено: `sanitize()` блокирует `..`, `/`, `\`, ведущую `.` + тест                                                                                                                                        |
| 2   | HIGH     | OutboxPoller не exactly-once: findMany→handler→update, конкурентный поллер обработает дважды | Исправлено: атомарный claim `updateMany WHERE status='PENDING'` → PROCESSING; добавлен `FAILED`, `intervalMs`, `start()/stop()` graceful shutdown; тесты exactly-once + FAILED                               |
| 3   | MEDIUM   | tenant-guard не глобальный (только ProductsController) + формат ошибок Nest default          | Исправлено: APP_GUARD глобально, `@Public()` для /health; единый формат Приложения B `{code,message,details,fieldErrors,correlationId,retryable}` в AllExceptionsFilter; AT-16 → 400 (зафиксирован один код) |

## Некритичные — на заметку (не блокируют)

| #   | Severity | Замечание                                                                                                                                            |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | LOW      | OutboxPoller: take=100 жёсткий, при больших очередях нужен курсор/пейджинг. Сейчас прототип — ок.                                                    |
| 2   | LOW      | OutboxPoller: FAILED не ретраится и не экспонируется в UI. Решение о ретраях — позже (в C4/C5).                                                      |
| 3   | LOW      | PrismaService: `$queryRaw`/`$executeRawUnsafe` обёртки — при росте добавить типизированные методы репозиториев.                                      |
| 4   | LOW      | `health` возвращает `detail` (сырой текст ошибки БД) — для prod убрать/замаскировать.                                                                |
| 5   | LOW      | seed: `balance=BigInt(1000000)` = 10 000 KZT (минорные) — корректно, но комментарий можно уточнить "1 000 000 тиын".                                 |
| 6   | LOW      | `process.env.STORAGE_DIR` в http.spec задаётся, но StorageAdapter ещё не подключён в AppModule (T1).                                                 |
| 7   | LOW      | vitest config: esbuild tsconfigRaw дублирует tsconfig.base — держать в синхроне.                                                                     |
| 8   | INFO     | dev через ts-node (нужен emitDecoratorMetadata для DI); tsx не даёт design:paramtypes. Зафиксировано как рещение — менять только если станет больно. |

## Верификация после фиксов

- npm test: 3 файла, 8 тестов ✓
- npm run typecheck: exit 0 ✓
- npm run lint: exit 0 ✓
- npm run secret-scan: exit 0 ✓
- live: GET /health → `{"status":"ok","db":"ok"}`; GET /api/products без tenant → 400 `{code,message,details,fieldErrors,correlationId,retryable}`
