---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `CONTEXT.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

This repo is **single-context**: root `CONTEXT.md`. Decisions live in `docs/DECISIONS.md` (and `docs/adr/` if created lazily). Do not treat `CONTEXT.md` as a dump of implementation details when adding glossary terms.

## During the session

- Challenge terms against `CONTEXT.md`. Sharpen fuzzy language.
- Stress-test relationships with concrete scenarios. Cross-check code.
- When a term is resolved, update `CONTEXT.md` inline. Format: [CONTEXT-FORMAT.md](CONTEXT-FORMAT.md).
- Offer an ADR only if hard to reverse + surprising + real trade-off. Format: [ADR-FORMAT.md](ADR-FORMAT.md). Prefer appending `docs/DECISIONS.md` if that is the existing house style.
