# AGENTS.md — правила агента

## 0. Чтение репо

- Первичный контекст: CONTEXT.md + docs/{ROADMAP,DECISIONS,CONTRACT-IS-MPT,RULES-MM,CATALOG-MM,SOURCE-MANIFEST}.md.
- Детали: docs/source/_.md (anydoc-конверсия docx/pdf). Фикстуры КМ: fixtures/_.csv.
- ЗАПРЕЩЕНО: читать _.docx/_.pdf напрямую и «перечитывать папку». Нет детали — смотри SOURCE-MANIFEST, затем конвертируй ОДИН файл anydoc.
- После фичи: обнови CONTEXT.md/ADR и opencode-mem.

## 1. Процесс (OpenCode)

- Старт: /grill-with-docs. Сложная задача → /to-tickets; спека → /to-spec.
- Реализация: /using-git-worktrees + /tdd (красный тест из AT-* первым).
- Финиш: /verification-before-completion → /ocr-review (+ /requesting-code-review на сильной модели) → /finishing-a-development-branch.
- Модели: планирование GLM-5.2 / Qwen3.8-Max; реализация DeepSeek-V4-Flash.
- Ponytail: минимальный код, без абстракций «на вырост».

## 2. Стоп-правила

- Внешние API НЕ выдумывать: только docs/CONTRACT-IS-MPT.md и официальные спеки; расхождение — в пользу официальной документации (ТЗ).
- tenant_id во всех бизнес-таблицах; запрос без tenant = throw; негативный тест в каждом модуле.
- Деньги: decimal/минорные; float запрещён; баланс = сумма проводок; резерв FOR UPDATE.
- Полные КМ НЕ в логах/UI/APM — маска; хранение envelope-шифрованием.
- documentBody doc/* = base64(JSON, ключи A–Z); Accept: _/_; идемпотентность изменяющих операций.
- Статусы — только машины состояний ТЗ §8; внешний статус хранить как external_status.
- Дедлайны Правил = данные (docs/RULES-MM.md), не хардкод.

## 3. Стек (зафиксирован)

NestJS+TS, Prisma+PostgreSQL16, Valkey (не Redis), RabbitMQ, MinIO, OpenBao(prod)/file-KMS(dev), bwip-js, React+Vite, EntityList (data-driven таблицы). Модульный монолит.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
