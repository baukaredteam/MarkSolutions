---
name: codebase-onboarding
description: Launch multiple explore subagents in parallel to investigate architecture, data models, auth, APIs, and deployment. Synthesize into an onboarding document.
---

# Codebase Onboarding

Spawn explore subagents in parallel:

1. Architecture & structure (apps/packages, Nest+Vite)
2. Data models (Prisma, SQLite/PG, money BigInt, tenant_id)
3. API routes
4. Auth / tenant
5. Deploy (docker-compose, STAGE markirovka)

Synthesize; default save path: user-specified, else do **not** create root ONBOARDING.md unless asked — prefer pointing at `CONTEXT.md`.

Start-here: `CONTEXT.md`, `AGENTS.md`, `docs/CONTRACT-IS-MPT.md`.
