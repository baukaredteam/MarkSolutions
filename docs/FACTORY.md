# Factory — Grok Bot / Finn loop (MarkSolutions)

Канон **как** крутить агентов на `chore/cursor-agent-factory`. Не заменяет `AGENTS.md` (стоп-правила) и не заменяет `docs/ROADMAP-REAL.md` (что строить: A→B→C→D).

Finn loop здесь = узкий конвейер: PM режет цель на доску → Dev берёт **одну** задачу → draft PR → Chief/Harith смотрят → merge **только** после «да» Harith → PM двигает карточку. Никто не «пишет весь продукт сам».

Плагины Cursor / Compound — `docs/agents/cursor-factory.md`. Локальные тикеты `.scratch/` — запасной трекер, не замена Linear/Notion.

---

## 1. Роли

| Роль | Кто | Делает | Не делает |
| ---- | --- | ------ | --------- |
| **Markirovka Chief** | Оркестратор / chief of staff (Grok Bot или человек в этой роли) | Держит цель и канон (`ROADMAP-REAL`, CONTRACT, этот файл). Режет конфликты скоупа. Раздаёт **готовые** тикеты PM/Dev. Смотрит draft PR (комментарий, не merge). Сверяет graph и hard rules. | Не пишет весь код. Не подменяет Dev. Не мержит. Не зовёт STAGE. Не плодит параллельных агентов на одни файлы. |
| **MS-PM** | Project manager (Linear предпочтительно, иначе Notion) | Декомпозирует цель Chief в **упорядоченные** задачи. Права на доске. Кормит Dev **по одной**. Мониторит статус Cloud Agent / draft PR. Двигает карточку после merge или «да». Эскалация Chief/Harith. | **Никогда** не запускает Cloud Agents за код. Не пушит ветки. Не открывает PR. Не «чинит» код в чате вместо Dev. |
| **MS-Dev** | Developer = **только** Cloud Agent | Берёт одну карточку `ready-for-agent`. Ветка от `chore/cursor-agent-factory`. **Один тикет → один draft PR** в factory. Targeted tests + lint/typecheck когда есть Node. Урок в `tasks/lessons.md`, трек в `tasks/todo.md`. | Не мержит. Не второй агент на те же файлы. Не `http-mpt.adapter.ts` параллельно с другим Dev. Не mutating STAGE. Не выдумывает API ИС МПТ. |
| **Harith** | Человек (заказчик / VPS / STAGE) | Единственный, кто говорит **«да»** на merge в factory и на любой mutating STAGE (метод + qty + GTIN + МОД). Read-only пробы `mpt:*` на VPS. Права ЛК. | Агенты и CI не подменяют «да». Документ / роадмап / этот playbook — не «да». |

Ревьюер (если есть отдельный проход) пишет **только** комментарий. Свой PR ревьюера — максимум `tasks/*` / docs close-out, не silent fix чужого diff. Merge — Harith.

---

## 2. Цикл (Finn loop)

Одна цель за раз. Карточка не уходит в Dev, пока PM не закрыл зависимости и не выписал Allowed / Forbidden / Done.

```
цель (Chief)
    → декомпозиция + порядок (MS-PM, Linear/Notion)
    → одна карточка Dev (Cloud Agent)
    → draft PR → chore/cursor-agent-factory
    → ревью Chief + (по желанию) комментарии
    → merge только после «да» Harith
    → PM двигает доску; следующая карточка
```

| Шаг | Кто | Что происходит | Стоп, если |
| --- | --- | -------------- | ---------- |
| **1. Цель** | Chief | Одна формулировка + фаза A/B/C/D + ссылка на канон. Не спринт-календарь. | Цель = «сделай маркировку» без границы. |
| **2. Нарезать** | MS-PM | Карточки на доске, **порядок** явный. В каждой: роль, Allowed, Forbidden, base branch, Done (PR URL + evidence). Permissions: кто двигает / кто только смотрит. | Две карточки на один файл / на `http-mpt.adapter.ts`. |
| **3. Кормить по одной** | MS-PM | В Dev уходит только следующая `ready-for-agent`. Параллель — только если файлы **не** пересекаются (урок factory A → B+C). | PM сам открыл Cloud Agent «чтобы быстрее». |
| **4. Сделать** | MS-Dev | Cloud Agent, одна ветка, один draft PR в `chore/cursor-agent-factory`. CI mock-only (`ADAPTERS_MPT=mock`). | Агент зовёт `test.markirovka.kz` / `prod.markirovka.kz`. |
| **5. Смотреть** | Chief (+ ревьюер) | Комментарий: hard rules, tenant, деньги, маска КМ, CONTRACT vs выдумка, sim/StubPage не расширен. | Merge от ревьюера / автомерж. |
| **6. «Да»** | Harith | Явное «да» на **этот** PR (и отдельно — на STAGE POST, если карточка про mutating). | «Роадмап написан» / «#17 влит» / «ЛК recon» как суррогат «да». |
| **7. Доска** | MS-PM | Карточка → Done. Урок в `tasks/lessons.md`, если человек поправил агента. Следующая карточка. | Dev сам берёт следующую без PM. |

Triage-лейблы (если живут в `.scratch/` или на доске): `needs-triage` → `needs-info` | `ready-for-agent` | `ready-for-human` | `wontfix` — `docs/agents/triage-labels.md`. Красный gate → `needs-info` / `ready-for-human`, не «готово».

---

## 3. Жёсткие правила

Сжатый набор из `AGENTS.md` и `docs/ROADMAP-REAL.md` §6. Нарушение = стоп карточки, не «заодно поправим».

1. **API ИС МПТ не выдумывать.** Методы и тела — только `docs/CONTRACT-IS-MPT.md` (+ официальная таблица). Поля ЛК / дефолты МОД·GTIN·ТГ — `docs/STAGE-LK-FIELDS.md`. Расхождение UI ↔ wire помечать, не «чинить» CONTRACT из recon.
2. **Mutating STAGE запрещён** без явного «да» Harith на метод + qty + GTIN + МОД. Агенты и CI не ходят на `test.markirovka.kz` / `prod.markirovka.kz`. Скрипты `mpt:*` не в `npm test` / `verify`. Read-only — человек на VPS.
3. Timeout после mutating POST → `UNKNOWN_RESULT` → сверка **GET**. Повторный POST до сверки запрещён. Prep этого — P0 safety (#17), не разрешение на POST.
4. **Не параллелить агентов** на одни и те же файлы. Особенно **один** владелец `apps/api/src/http-mpt.adapter.ts` (и соседний outbox/reconcile) за раз.
5. **Максимум 4 Cloud Agents** одновременно на factory. PM Cloud Agents не запускает. Chief не плодит 5-го «на всякий случай».
6. **Симулятор / StubPage = вытеснять, не строить MVP.** Инвентарь: `docs/TECH-DEBT-SIM-STUB.md`. Маршрут/меню ≠ реализация (`AGENTS.md` §5).
7. **Модели:** Composer / Grok 4.6. Fable — только если человек явно сказал Fable. Не OpenCode / GLM / Qwen / DeepSeek. `.cursor/rules/04-models.mdc`.
8. **Память:** живой трек `tasks/todo.md`, уроки `tasks/lessons.md`. После фичи и после любой правки человека — запись в lessons. Тяжёлую memory-инфру на VPS не поднимать без спроса.
9. Доменные стопы без скидок: `tenant_id` или throw; деньги BigInt, не float; полные КМ — маска; `documentBody` doc/* = base64(JSON A–Z); Accept обязателен; статусы — машины ТЗ §8 + `external_status`.
10. Merge в `chore/cursor-agent-factory` — только после «да» Harith. Draft PR — норма. Автомерж / merge ревьюером — нет.

---

## 4. Сейчас (tip factory, 2026-09-06)

Снимок `chore/cursor-agent-factory` @ `04f45ce` (после #21). Не календарь.

| Слой | Статус | Следствие для доски |
| ---- | ------ | ------------------- |
| **A read-only** | Закрыта (auth 200, GET orders 200, пустой кабинет, A4 P0 parse, A6 checklist) | Не открывать «ещё один GET-зонд вместо B». A4 P1 — полировка, не блокер «да». |
| **#17 P0 safety** | Влит в factory (`UNKNOWN_RESULT`, один POST, RELEASE после сверки, `externalOrderId`, default ТГ `autofluids`) | Влит ≠ Phase B. Не трактовать как «да» на `createOrder`. |
| **P2** | STAGE-LK-FIELDS (#20) + GTIN-14 / `autofluids` / МОД **803** в env (#21) | Recon и DTO — не POST. `releaseMethodType` и lookup/publish API **не** выдумывать. |
| **B mutating** | Закрыта | Следующий STAGE POST — только после нового «да» Harith. Кандидат: `createOrder` qty=1. Чеклист: `docs/MPT-PHASE-B-READINESS.md`. |

PM не ставит в Dev карточку «сделай первый заказ на STAGE», пока Harith не написал «да».

---

## 5. Доска и карточка

**Linear предпочтителен.** Notion — если Linear ещё нет. `.scratch/<feature>/` — локальный fallback (`docs/agents/issue-tracker.md`), не второй источник правды, когда доска живая.

Минимум полей карточки Dev:

- **id** / роль (`docs-only` \| `code` \| `ready-for-human`)
- **цель** в одном абзаце + ссылка на канон (CONTRACT / ROADMAP-REAL / STAGE-LK-FIELDS / AT-*)
- **Allowed** / **Forbidden** (пути; STAGE HTTP; merge)
- **Branch** + base = `chore/cursor-agent-factory`
- **Done** = draft PR URL + evidence (`AGENTS.md` §6)
- **Зависимости** (например: не трогать адаптер, пока открыт другой PR на него)

Права: PM администрирует доску; Dev двигает только свою карточку In progress → In review; merge/Done после «да» — PM. Cloud Agent не ходит в Linear писать код «от имени PM».

---

## 6. Cloud Agents и PR

- Dev = Cloud Agent. База всегда `chore/cursor-agent-factory` (не `main`, пока factory — рабочий контур).
- Один тикет → одна ветка → один **draft** PR. Не паковать P2 + Phase B в один diff.
- CI на factory включён (`on.pull_request.branches` содержит `chore/cursor-agent-factory`). Ждать зелёные **mock** checks. Никогда `ADAPTERS_MPT=http` в Actions.
- Параллель разрешена только при пустом пересечении путей (пример: UI-shell vs catalog-orders). Адаптер МПТ, outbox send/reconcile, vault ingest — очередь, не веер.
- Лимит: **≤4** живых Cloud Agents. Пятый ждёт доски.
- После merge PM обновляет карточку и `tasks/todo.md`. Chief не открывает следующую MPT-карточку «на тот же адаптер» внахлёст.

---

## 7. Модели и оркестрация

| Кто | Модель |
| --- | ------ |
| Chief (план, раздача, сверка) | Grok 4.6, Plan Mode если ≥3 шагов или скоуп мутный |
| MS-Dev (повседневный код, тесты, мелкий UI, docs) | Composer / Grok 4.6 |
| Исследование | explore-субагент, не весь монолит в один контекст |
| Тяжёлый кросс-модульный рефакторинг | **Fable** — только по явной просьбе человека |
| Запрещено | OpenCode как процесс, GLM, Qwen, DeepSeek |

Chief оркестрирует, не кодит «за всех». Subagents liberally **внутри** одного Dev-тикета; это не +1 Cloud Agent на доске.

---

## 8. Карта

| Документ | Зачем |
| -------- | ----- |
| **Этот файл** | Роли + Finn loop + лимиты агентов |
| `AGENTS.md` | Стек, стоп-правила, evidence |
| `docs/ROADMAP-REAL.md` | Канон реального контура A→B→C→D |
| `docs/CONTRACT-IS-MPT.md` | Единственная полная спека xTrace в репо |
| `docs/STAGE-LK-FIELDS.md` | Поля ЛК (МОД 803, GTIN-14, `autofluids`) — не POST |
| `docs/MPT-PHASE-B-READINESS.md` | Чеклист первого mutating |
| `docs/TECH-DEBT-SIM-STUB.md` | Что вытеснять вместо расширения sim |
| `docs/agents/cursor-factory.md` | Плагины Cursor (не клонировать на VM) |
| `tasks/todo.md` / `tasks/lessons.md` | Живая память factory |
