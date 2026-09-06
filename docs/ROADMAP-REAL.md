# Технический роадмап реального контура MarkFlow

Канон для **реального** контура (человек на VPS + `HttpMptAdapter` + боевые порты).  
Не продолжать `docs/ROADMAP.md` (архив OpenCode W1–W4 + симулятор) и не считать `docs/production/ROADMAP.md` (черновик production-срезов W0–W6) каноном этого документа.

Снимок as-is: factory `chore/cursor-agent-factory` @ `2df8f3a` (A6 / PR #16).  
Источники: `CONTEXT.md`, `docs/CONTRACT-IS-MPT.md`, `docs/MPT-PHASE-B-READINESS.md`, `docs/MPT-GET-CONTRACT-AUDIT.md`, `docs/RULES-MM.md`, `docs/INTEGRATIONS.md`, `docs/agents/module-gap-matrix.md`, мокапы `docs/source/MARK_FLOW_*`. Методы ИС МПТ — только из CONTRACT; API не выдумывать.

Порядок фаз **зафиксирован**: **A → B → C → D**. Горизонты (GS1, НКТ, 1С, Markmobile, ЭДО, РФ) — не все сразу и не вместо MPT.

---

## 1. Фаза 0 — автономный прототип (закрыта)

**Статус: закрыта.** Это был временный контур, чтобы показать marking-loop без боевых доступов.

Что осталось как капитал (не выкидывать):

- Домен: онбординг, каталог 44 attr, биллинг double-entry, заказ КМ, Code Vault + маска, этикетки DataMatrix, ввоз/вывод, дашборд/задачи (minimal).
- Порты ADR-005: `adapters.<system>=mock|http`. Симулятор = `MockMptAdapter` для CI и локальных AT, **не** продуктовая цель.
- Профиль прототипа ADR-015 (SQLite / in-process outbox / `storage/`) — дев. Прод = PostgreSQL 16 / RabbitMQ / MinIO / OpenBao.

Что **не** цель фазы 0 и не расширять:

- Симулятор эмиссии (`SIM_MPT_EMISSION_MS`, фейк-КМ).
- `StubPage` как «модуль».
- Календарные вехи старого ROADMAP (W1–W4, «к 01.02.2027 сдаём продукт»).

Демо 31.08–01.09 закрыло показ. Дальше — реальный контур, не «ещё один спринт симулятора».

---

## 2. Волна MPT: A ✅ → B → C → D

### Phase A — STAGE read-only ✅

Человек на VPS. Агенты и CI **не** зовут `test.markirovka.kz` / `prod.markirovka.kz`.

| Факт | Где |
| ---- | --- |
| Auth `200` | `docs/STAGE-MPT-HEALTHCHECK.md` |
| `GET /api/orders` `200`, issuer, `productGroup=autofluids`, пустой кабинет (`orders_count=0`) | `docs/STAGE-MPT-READONLY-GET.md` |
| A4 GET **P0** влит (#15): `getOrder` ← `orderInfos[].orderStatus` (`quantity: 0`); `getCodes` official `orderId+gtin+quantity` + `codes[]`; `getUtilisation` ← `reportStatus` | `docs/MPT-GET-CONTRACT-AUDIT.md` |
| A6 readiness (prep-only, **не** разрешение на POST) | `docs/MPT-PHASE-B-READINESS.md` (#16) |
| A5 (зонды C/D на пустом кабинете) | не форсировать |
| A4 **P1** (optional `productGroup` на `getOrder`, GET `Content-Type`, enum `getDocument`) | открыто, **не** блокер B |
| PR **#17** P0 safety (UNKNOWN_RESULT, один POST, RELEASE только после сверки) | **открыт, draft** — [pending](https://github.com/baukaredteam/MarkSolutions/pull/17). Этот роадмап **не** мержит его |

**Done criteria A (закрыты):** auth 200 + list orders 200 на issuer/`autofluids`; P0-парсинг GET в адаптере; чеклист B записан; mutating не открыт.

Остаток A (P1 GET) — полировка, не гейт на «да».

---

### Phase B — первый mutating на STAGE (только после «да» Harith)

**Не открыта.** Ни агент, ни этот документ, ни CI не делают POST. Кандидат при пустом кабинете: `createOrder` qty=**1** (`UNIT` / `OPERATOR` / `autofluids` / подтверждённый МОД) → сразу GET-сверка. Utilisation — только если уже есть коды. Не close, не `doc/*`, не печать, не второй POST (`docs/MPT-PHASE-B-READINESS.md` §1, §5).

Перед «да»: чеклист A6 §4 (роль issuer, права CREATE/READ/ADMINISTRATION, ТГ `autofluids`, МОД, `ADAPTERS_MPT=http` и `NODE_ENV=stage` на VPS, `MPT_ORDER_TIMEOUT_MS` намного больше ожидаемой эмиссии STAGE, qty=1, runbook без повторного POST).

P0-дыры as-is (закрывать **до** «да», не этим PR): retry POST в адаптере; outbox `PENDING` → повторный POST; RELEASE по default 60s до READY; `createOrder` отбрасывает STAGE `orderId`; default ТГ адаптера `motor-oils`. Это предмет **#17** (pending).

**Done criteria B:**

1. Harith написал «да» на **конкретный** метод + qty + GTIN + МОД.
2. Ровно один утверждённый POST на STAGE; `Idempotency-Key` = MarkFlow `order.id` (ADR-024).
3. Обрыв / timeout → внутренний `UNKNOWN_RESULT` → сверка **GET**. Слепой повторный POST запрещён.
4. GET `/api/orders` (и при READY — `/api/codes`, только count/маска) совпал с кабинетом; Vault ingest без полного КМ в логах.
5. RESERVE/SETTLE/RELEASE остаются в ledger MarkFlow. ИС МПТ не списывает тенге.
6. CI по-прежнему `ADAPTERS_MPT=mock`. На VPS — `http` + `test.markirovka.kz`.

Не «готово к эмиссии», пока нет пункта 1.

---

### Phase C — НКТ (после B)

Регистрация карточки в Национальном каталоге: порт `INktAdapter` уже есть (мок + outbox SLA). Боевой HTTP — **после** доказанного B, не вместо MPT.

**Done criteria C:**

1. Спека/доступ НКТ в репо (не выдуманный API). `adapters.nkt=http` на VPS; CI — mock.
2. `Registering → Registered` (или отказ → Needs Correction + fieldReasons) идёт через реальный адаптер + reconciliation, не через setTimeout-мок.
3. Tenant-scoped; без tenant = throw; негативный AT.
4. Не блокирует повторный mutating MPT и не требует GS1 «сразу настоящий».

---

### Phase D — 1С (после C)

Сейчас: файловый контракт v1 (`docs/CONTRACT-1C.md`, ADR-010) — `PaymentImport` / `ServiceAct` / `MovementJournal` с `kmHash`, без plaintext КМ. Боевой транспорт (не «ещё один CSV») — с интегратором, не из головы.

**Done criteria D:**

1. Согласованный с 1С-интегратором транспорт (файлы → то, что подпишут; XML не изобретать заранее).
2. Те же три проекции, идемпотентность `ref1c`, полные КМ не уходят.
3. Аудит каждой выгрузки. Cron/автодоставка — только если интегратор этого требует, не «на вырост».
4. Не подменяет MPT и не открывает банк/ЭДО.

---

## 3. Горизонты (не все сразу)

Очередь **после** текущей фазы MPT. Не параллелить «чтобы быстрее». Классификация канала — `docs/INTEGRATIONS.md` (open API vs close).

| Горизонт | Канал | Когда | Что не делать сейчас |
| -------- | ----- | ----- | -------------------- |
| **GS1 Kazakhstan** | open API, дока [api11.gs1.kz/docs/api](https://api11.gs1.kz/docs/api) | После устойчивого MPT (A/B). Порт `IGs1Adapter` + GtinResolver слой 2 уже мок (mod10). Настоящий verify/register — отдельно | Не вместо Phase B. Не выдумывать методы сверх публичной доки. Close-договор (если появится) — тоже горизонт, не блокер A/B |
| **НКТ** | open API + договор | = **Phase C** | Не раньше B |
| **1С** | close, файлы → боевой транспорт | = **Phase D** | Не изобретать XML/банк |
| **Markmobile** | close | Эволюция: скан/нанесение с телефона (ТЗ WMS-047 Could; в INTEGRATIONS — «скан-подтверждение») | Не мобильное приложение «вместо» web-loop |
| **ЭДО / ЭСФ / ЭЦП** | open API, фаза 3 ТЗ | После D и договора | ADR-003: оферта MVP = клик; ЭЦП не тащить в B |
| **РФ** (Гис МТ / МДЛП / АТК) | другой контур | Отдельная волна, не MVP-1 KZ | Не смешивать с xTrace. Порты позволяют добавить позже |

1ecom — close, публичного API нет (ADR-004). Банк / ОФД — наблюдатель, не горизонт этой волны.

---

## 4. Что вытесняем и чем

Симулятор и StubPage — **техдолг**, не продукт. Инвентарь долга ведёт отдельный документ (агент R2: `docs/TECH-DEBT-SIM-STUB.md`, когда появится). Здесь только направление вытеснения.

| Сейчас (временное) | Чем вытесняем | Когда |
| ------------------ | ------------- | ----- |
| `MockMptAdapter` / `SIM_MPT_EMISSION_MS` как «ИС МПТ» | `HttpMptAdapter` (`ADAPTERS_MPT=http`) + CONTRACT + GET-сверка. Мок **остаётся** в CI | A уже читает STAGE человеком; B — первый POST после «да» |
| `StubPage` `/production`, `/warehouse`, `/reports`, `/organization`, `/support` и UI-SPEC-лишние (`partners`, `processes`, …) | Реальный модуль: domain service + Prisma + API-контракт + UI state + audit + AT. Канон — 16 модулей `MARK_FLOW_*`, не 23 экрана UI-SPEC | По приоритету gap-matrix: сначала дыры P0 marking-loop (HOME глубина, OPS wizard), не все 16 сразу |
| Мок `INktAdapter` | HTTP НКТ | Phase C |
| Мок `IGs1Adapter` | HTTP по [api11.gs1.kz](https://api11.gs1.kz/docs/api) | горизонт GS1, не вместо B |
| 1С = только CSV v1 | Согласованный транспорт | Phase D |
| FileKMS / LocalStorage / `dev-secret` на VPS | OpenBao + MinIO + fail-closed `NODE_ENV=stage` | до B на процессе API |

Не вытеснять симулятор **расширением** симулятора. Не считать маршрут/меню реализацией (`AGENTS.md` §5).

---

## 5. Сейчас / ~2 недели / 1–2 месяца

Горизонтные корзины, **не** спринт-коды и не обещание календарной даты. «2 нед» = ближайший фокус после этого документа; «1–2 мес» = следующая ёмкость, если B закрыт.

| | **Сейчас** (as-is) | **~2 недели** (фокус) | **1–2 месяца** (ёмкость) |
| --- | --- | --- | --- |
| **MPT** | A закрыта. Кабинет пустой. Mutating закрыт. #17 pending | Review #17 (не автомерж). Чеклист A6 человеком. **B только если Harith «да»** — один `createOrder` qty=1 + GET. Иначе B не начинать | Если B прошёл: следующий mutating (utilisation / `doc/*`) — **новое** «да». Иначе добить B. C не начинать до B |
| **Вытеснение** | Loop живёт на симуляторе в CI; VPS читает STAGE GET. StubPage на PRD/WMS/RPT/SET | Не расширять sim. P0 UI: глубина HOME/OPS/TASK по уже существующим сервисам, не новые StubPage | Http MPT как основной путь заказа на VPS. Мок — только тесты. Точечное вытеснение StubPage P1 (AGG как продукт, SET), не 16 модулей |
| **Горизонты** | GS1/НКТ/1С/Markmobile/ЭДО/РФ — мок или файлы или «эволюция» | Спеки читать, порты не ломать. Боевой GS1/НКТ/1С **не** вместо B | Старт C (НКТ), затем D (1С). GS1 http — после MPT, по доке api11. Markmobile/ЭДО/РФ — позже |
| **Регуляторика (контекст, не дедлайн поставки)** | Обязательная маркировка моторных масел **уже с 01.02.2026** (перечень; приказ №44-н/қ). Глава 11 (оборот) — **с 01.02.2027** (`docs/RULES-MM.md`) | Не обещать «сдадим продукт к дате приказа» | Тот же якорь 01.02.2027 = оборот по Правилам, не дата релиза MarkFlow |

Нет строк вида «W5 / спринт 12 / к пятнице».

---

## 6. Жёсткие правила

1. **Ни агент, ни CI** не делают STAGE/PROD mutating и не ходят на `test.markirovka.kz` / `prod.markirovka.kz`. Скрипты `mpt:*` не в `npm test` / `verify`.
2. **Любой POST** в ИС МПТ — только после явного «да» **Harith** на метод + qty + GTIN + МОД. Это роадмап, не «да».
3. Timeout после mutating → `UNKNOWN_RESULT` → **RECONCILIATION** (GET). Повторный POST до сверки запрещён.
4. Методы и тела — только `docs/CONTRACT-IS-MPT.md` (+ официальная таблица). Расхождение — в пользу ТЗ/официальной спеки, не догадки.
5. `tenant_id` на бизнес-таблицах; запрос без tenant = throw. Деньги — BigInt, не float. Полные КМ — маска; не в логах/UI/APM.
6. `documentBody` doc/* = base64(JSON, ключи A–Z). Accept `*/*` обязателен (ловушка 3).
7. Симулятор / StubPage не расширять как продуктовую цель. Дедлайны Правил = данные (`docs/RULES-MM.md`), не хардкод в UI.

---

## 7. Карта документов

| Документ | Роль |
| -------- | ---- |
| **Этот файл** | Канон реального контура |
| `docs/ROADMAP.md` | Архив OpenCode W1–W4 + sim |
| `docs/production/ROADMAP.md` | Старый черновик production-срезов; не канон A–D |
| `docs/CONTRACT-IS-MPT.md` | Единственная полная спека xTrace в репо |
| `docs/MPT-GET-CONTRACT-AUDIT.md` | GET as-is vs official (A3/A4) |
| `docs/MPT-PHASE-B-READINESS.md` | Prep B, чеклист Harith |
| `docs/INTEGRATIONS.md` | Карта портов / open vs close |
| `docs/agents/module-gap-matrix.md` | 16 модулей vs StubPage |
| `docs/TECH-DEBT-SIM-STUB.md` | Инвентарь долга (R2; не этот PR) |
