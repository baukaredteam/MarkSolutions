# STAGE ИС МПТ — read-only authenticate healthcheck

Проверка **только** `POST /api/users/authenticate` (контракт: `docs/CONTRACT-IS-MPT.md`, ловушка 3: `Accept: */*`).

Это **не** заказ КМ, не utilisation, не `doc/*`, не GET `/api/codes`. Mutating-вызовы (`createOrder`, utilisation, import/withdrawal) **запрещены**, пока человек отдельно не скажет «да».

Агенты и CI этот скрипт против `test.markirovka.kz` / `prod.markirovka.kz` **не запускают**. Тесты бьют в локальный мок на `127.0.0.1`.

## Файл на VPS (человек)

Путь: `~/.config/marksolutions/mpt.env`

Имена переменных (логин/пароль оставить пустыми в репо; значения только в этом файле на VPS):

```
ADAPTERS_MPT=http
MPT_BASE_URL=https://test.markirovka.kz
MPT_LOGIN=
MPT_PASSWORD=
MPT_PRODUCT_GROUP=motor-oils
MPT_BUSINESS_PLACE_ID=36
MPT_MAX_RETRIES=2
MPT_REQUEST_TIMEOUT_MS=15000
```

`MPT_BUSINESS_PLACE_ID=36` — известный идентификатор площадки, не секрет. Скрипт требует только `MPT_BASE_URL`, `MPT_LOGIN`, `MPT_PASSWORD`.

Не коммитить этот файл. Не печатать пароль, токен, полный КМ.

## Как запустить на VPS (после merge)

```
set -a && source ~/.config/marksolutions/mpt.env && set +a
npm run mpt:auth-healthcheck
```

Или без `source`, если файл уже лежит по пути выше: скрипт сам читает `~/.config/marksolutions/mpt.env` (уже заданные в процессе переменные побеждают).

## Что сообщить обратно

Только **ok/fail** и HTTP-статус из одной строки stdout:

- `status=200` + exit 0 — ok
- `status=401` + exit 1 — fail (учётные данные / стенд)
- `status=network` + exit 1 — fail (сеть / таймаут ~15 с)
- `missing env` + exit 1 — нет `MPT_BASE_URL` / `MPT_LOGIN` / `MPT_PASSWORD` (скрипт не говорит, какой именно ключ)

Тело ответа, `accessToken`, пароль — не копировать.

## Что этот PR не делает

- Не ходит в STAGE из CI и агентов
- Не добавляет POST `/api/orders`, utilisation, `doc/*`
- Не меняет mutating-методы `HttpMptAdapter`
- Не подключает `mpt:auth-healthcheck` к `npm test` / `npm run verify` (у CI нет учёток)
