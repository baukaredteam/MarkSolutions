---
name: markirovka-integration
description: Specialist for the ИС МПТ (xTrace) integration layer — orders, codes, utilisation, documents, outbox, reconciliation. Use when changing MPT adapters, Gateway, Code Vault, KM orders, STAGE/PROD hosts, or CONTRACT-IS-MPT.
---

# ИС МПТ integration

## Source of truth

1. `docs/CONTRACT-IS-MPT.md` — единственная полная API-спека в репо.
2. ТЗ: `docs/source/Техническое_задание_ИС_MarkFlow_версия_2.0.md`.
3. Правила: `docs/RULES-MM.md`. Код не является спекой API.

Не выдумывать поля, лимиты, статусы. Ловушки контракта (refresh URL, Accept, base64 A–Z, businessPlaceId int32) — читать контракт, не «исправлять» по интуиции.

## Hosts

- STAGE: `https://test.markirovka.kz`
- PROD: `https://prod.markirovka.kz`
- Read-only smoke на STAGE сначала. Mutating (POST orders/docs/utilisation/print/reserve) — утверждённый кейс + явное «да» человека.

## Patterns in this codebase

- Mutating внешняя команда = persist command + **outbox**; worker/Gateway вызывает вендора. React не ходит в ИС МПТ.
- Timeout после mutating call → внутренний `UNKNOWN_RESULT` → **RECONCILIATION**. Запрещён повторный POST до сверки.
- Идемпотентность: Idempotency-Key / уникальность проводки (orderId, kind).
- `documentBody` doc/* = base64(JSON, ключи A–Z до encode). Accept обязателен (иначе 406 пустое тело).
- Внешний статус хранить как `external_status`; внутренние статусы — ТЗ §8.

## Tenant / KM / money

- Без `tenant_id` — throw. Негативный тест обязателен.
- Полный КМ не логировать. Маска: GTIN открыт; serial первые 2 + … + последние 2 если length>6.
- Деньги BigInt/decimal минорные, не float.

## What not to do

- Не хардкодить дедлайны Правил.
- Не считать utilisation «готово» по факту POST (есть reportId + poll).
- Не использовать prod host в STAGE-профиле.
