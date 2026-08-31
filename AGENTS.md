# AGENTS.md — Cursor Ultra + Grok Bot

## 0. Источник истины

- Контекст: `CONTEXT.md` + `docs/{ROADMAP,DECISIONS,CONTRACT-IS-MPT,RULES-MM,CATALOG-MM,SOURCE-MANIFEST}.md`.
- Детали ТЗ: `docs/source/*.md`. Фикстуры КМ: `fixtures/*.csv`.
- Не читать `.docx`/`.pdf`. Нет детали → `SOURCE-MANIFEST`, затем один md-файл.
- Windows `C:\Users\Бауыржан\Desktop\MarkFlow` агенту недоступен — человек кладёт файлы в `docs/source` или `fixtures`.
- После фичи: обновить `CONTEXT.md`/ADR при смене модели; урок → `tasks/lessons.md`; трек → `tasks/todo.md`.

## 1. Процесс (Cursor, не OpenCode)

1. Plan Mode, если ≥3 шагов или скоуп неясен.
2. Subagents liberally (`explore`, параллельные Task). Grok Bot / Grok 4.6 оркестрирует.
3. TDD: красный тест из AT-* первым, если задача про поведение.
4. Verification before done (см. §5) → code-review skill при крупном diff.
5. Записать урок в `tasks/lessons.md`. **После любой правки пользователя — урок туда же.**

Ponytail: минимальный код, YAGNI, без абстракций «на вырост». Rule `02-ponytail.mdc`.

Не использовать: OpenCode-команды (`/to-tickets` как процесс-рантайм), GLM, Qwen, DeepSeek.

## 2. Стоп-правила (домен)

- Внешние API не выдумывать: только `docs/CONTRACT-IS-MPT.md` и официальные спеки; расхождение — в пользу ТЗ.
- `tenant_id` во всех бизнес-таблицах; запрос без tenant = throw; негативный тест в каждом модуле.
- Деньги: decimal/BigInt минорные; float запрещён; баланс = сумма проводок; резерв с блокировкой (CAS/`FOR UPDATE` по ADR, не float).
- Полные КМ не в логах/UI/APM — маска; хранение envelope-шифрованием.
- `documentBody` doc/* = base64(JSON, ключи A–Z); Accept обязателен; идемпотентность изменяющих операций.
- Статусы — только машины ТЗ §8; внешний статус хранить как `external_status`.
- Дедлайны Правил = данные (`docs/RULES-MM.md`), не хардкод.

## 3. Стек

NestJS+TS, Prisma+PostgreSQL16 (prod) / SQLite (dev), Valkey (не Redis), RabbitMQ, MinIO, OpenBao(prod)/file-KMS(dev), bwip-js, React+Vite, EntityList. Модульный монолит.

## 4. Модели

По умолчанию: **Composer** / **Grok 4.6**. **Fable** — только тяжёлые кросс-модульные рефакторинги и только если пользователь явно сказал Fable. Подробно: `.cursor/rules/04-models.mdc`.

## 5. Production-gates

- План: `docs/production/ROADMAP.md`; WB-импорт: `docs/production/WB_DOCUMENT_IMPORT_CONTRACT.md`. Старые OpenCode-промпты: `docs/production/OPENCODE_PROMPTS.md` (архив, не запускать как процесс).
- Маршрут/меню ≠ реализация: нужны domain service, migration, API-контракт, real UI state, audit, background job при необходимости, AT-тесты.
- В production запрещены StubPage, `return { ok: true }` вместо команды, hardcoded tenant, mock-адаптеры, FileKMS, LocalStorage, `dev-secret`, прямые vendor-вызовы из React.
- Внешние команды: command + outbox; только Gateway/worker вызывает ИС МПТ, 1ecom, GS1, НКТ/КМТ, банк, ERP/WMS, ОФД, ЭДО, маркетплейсы.
- Timeout после mutating ИС МПТ = `UNKNOWN_RESULT → RECONCILIATION`; повторный POST до сверки запрещён.
- Массовая операция: server-side selection, preview/preflight, async job, partial result, отчёт ошибок, retry только проблемной части, explicit confirmation, audit.
- STAGE = `test.markirovka.kz`. Сначала read-only smoke; заказ/документ/печать/резерв/списание — утверждённый кейс + явное подтверждение человека.

## 6. Completion evidence

- Graph: UI/API → service → Prisma → outbox/job → adapter → audit/tests.
- Targeted tests, `npm run lint`, `npm run typecheck`, Prisma generate/validate, migration check, `npm run secret-scan`, независимый review.
- Gate красный → `ready-for-human` или `needs-info`, не «готово».
- В итог: изменённые контракты, миграции, риски, exact команды проверок и вывод.

## Agent skills

Локальные: `.cursor/skills/`. Rules: `.cursor/rules/`.

### Issue tracker

Issues/specs — markdown в `.scratch/<feature>/`. См. `docs/agents/issue-tracker.md`.

### Triage labels

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. См. `docs/agents/triage-labels.md`.

### Domain docs

Single-context: один `CONTEXT.md` + `docs/adr/` (решения также в `docs/DECISIONS.md`). См. `docs/agents/domain.md`.

### Рекомендуемый плагин (не установлен в репо)

**Compound Engineering** — в Cursor Agent chat: `/add-plugin compound-engineering` (marketplace). Не клонировать в Grok Bot VM. После установки на аккаунт Cursor плагин доступен и Grok Bot.

### Skills в репо

- `markirovka-integration` — слой ИС МПТ (обязателен при заказах/КМ/doc/*).
- mattpocock (минимум): `setup-matt-pocock-skills`, `grill-with-docs` (+ `grilling`, `domain-modeling`), `diagnosing-bugs`.
- `archify` — диаграммы; полный renderer требует Node (`npx skills add tt-a1i/archify`). Без Node — mermaid.
- awesome-cursor: `best-of-n-solving`, `creating-pr`, `codebase-onboarding`, `building-skills-from-patterns`, `grinding-until-pass`.

Когда появится Node: `npx skills add tt-a1i/archify` и `npx skills@latest add mattpocock/skills` (добрать полный набор).

## Память

Обязательный цикл: `tasks/todo.md` + `tasks/lessons.md`.

Опционально позже (не ставить без спроса): [agentmemory](https://github.com/search?q=agentmemory) / ai-memory MCP. Сейчас файловая база достаточна. Не поднимать тяжёлые сервисы памяти на этом VPS без явной просьбы.
