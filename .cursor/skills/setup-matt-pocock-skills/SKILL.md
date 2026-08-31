---
name: setup-matt-pocock-skills
description: "Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. Run once before first use of the other engineering skills."
disable-model-invocation: true
---

# Setup Matt Pocock's Skills

Этот репозиторий **уже настроен**: local markdown tracker (`.scratch/`), triage labels, single-context `CONTEXT.md`. См. `docs/agents/{issue-tracker,triage-labels,domain}.md`.

Не перезаписывать `AGENTS.md` целиком. Если пользователь явно просит re-setup — следовать upstream: https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/SKILL.md

Когда появится Node: `npx skills@latest add mattpocock/skills` (обязательно включить `setup-matt-pocock-skills`).
