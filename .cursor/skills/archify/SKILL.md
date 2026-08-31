---
name: archify
description: Create architecture, workflow, sequence, data-flow, and lifecycle diagrams. Use when the user asks to visualize system architecture, MPT flows, state machines, or convert Mermaid.
license: MIT
metadata:
  version: "2.16-local"
  upstream: https://github.com/tt-a1i/archify
---

# Archify (project-local)

Полный пакет (schemas, `bin/archify.mjs`) **не вендорен**: на этом VPS нет Node.

## Если Node есть (человек ставит)

```bash
npx -y skills add tt-a1i/archify --skill archify --agent cursor --copy --yes
```

Тогда: выбрать тип → JSON IR → `node bin/archify.mjs validate` → `deliver`. Контракт upstream: https://github.com/tt-a1i/archify/blob/main/archify/SKILL.md

## Fallback без Node

1. Тип: `architecture` | `workflow` | `sequence` | `dataflow` | `lifecycle`.
2. Нарисовать **mermaid** в чате или файл `docs/*.md` (не HTML-renderer).
3. Для машин состояний маркировки читать `CONTEXT.md` + ТЗ §8, не выдумывать статусы.
4. Не заявлять «Archify HTML delivered», если `deliver` не запускался.
