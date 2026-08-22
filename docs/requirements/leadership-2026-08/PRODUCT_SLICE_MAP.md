# Product Slice Map

**Date:** 2026-08-21
**Status:** DRAFT — comparison only where demo screens lack approved requirements

---

## Slice 1: Organization & RBAC

| Aspect | Detail |
|--------|--------|
| MF-REQ group | MF-REQ-001–004 |
| Roles | Руководитель, Специалист, Оператор, Бухгалтер, Модератор, Администратор, Просмотр |
| Data inputs | User registration, role assignment, MFA enrollment |
| Data outputs | JWT token, role claims, RBAC-patched API responses |
| Acceptance evidence | auth.spec.ts (login, JWT), rbac.spec.ts (role enforcement) |
| Demo screen | Login screen — **comparison only** (demo has no MFA integration) |

## Slice 2: Product Catalog & Moderation

| Aspect | Detail |
|--------|--------|
| MF-REQ group | MF-REQ-010–016 |
| Roles | Специалист (create/edit), Модератор (approve/reject), Администратор (config) |
| Data inputs | Product card attributes (44 fields), GS1/NTIN, TN VED, images |
| Data outputs | ProductCard with status, audit trail, moderation decisions |
| Acceptance evidence | moderation.spec.ts (lifecycle), products-cards.spec.ts (CRUD), code-lookup.spec.ts (GTIN), catalog-import.spec.ts (import) |
| Demo screen | Catalog cards — **comparison only** (demo has no WB/OZON import, no external moderation API) |

## Slice 3: Code Order & Vault

| Aspect | Detail |
|--------|--------|
| MF-REQ group | MF-REQ-050–053, MF-REQ-060–064 |
| Roles | Специалист (create order), Оператор (print), Администратор (config) |
| Data inputs | Order request (cardId, gtin, places, units), code payload (gtin, serial, ai91, ai92) |
| Data outputs | Order (status machine, number), CodeVault (encrypted codes, status), CodeEvent (audit) |
| Acceptance evidence | order.spec.ts (state machine, idempotency), code-vault.spec.ts (encrypt/decrypt), code-event.spec.ts (status transitions) |
| Demo screen | Order list + code vault — **comparison only** (demo has no real MPT connection, no encryption via OpenBao) |

## Slice 4: Billing & Invoice

| Aspect | Detail |
|--------|--------|
| MF-REQ group | MF-REQ-040–045 |
| Roles | Бухгалтер (invoice, settlement), Администратор (tariff config) |
| Data inputs | Invoice request, payment confirmation (Kaspi webhook), tariff configuration |
| Data outputs | Invoice (status, amounts), LedgerEntry (balance changes), Account balance |
| Acceptance evidence | billing.spec.ts (reserve/release/settle, ledger invariant), invoice.spec.ts (create, confirm, webhook) |
| Demo screen | Billing dashboard — **comparison only** (demo tariff is 8 KZT; D-001 pending) |

## Slice 5: Print & Labels

| Aspect | Detail |
|--------|--------|
| MF-REQ group | MF-REQ-070–072 |
| Roles | Оператор (print), Специалист (label config) |
| Data inputs | Code key, print reason, label template |
| Data outputs | PNG DataMatrix label, LabelKey (content-addressed), CodeEvent (PRINTED/REPRINTED) |
| Acceptance evidence | label.spec.ts (render, print, reprint, reason validation) |
| Demo screen | Label print dialog — **comparison only** (demo has no print device integration) |

## Slice 6: Documents & Operations

| Aspect | Detail |
|--------|--------|
| MF-REQ group | MF-REQ-080–083 |
| Roles | Оператор (submit), Специалист (review), Бухгалтер (invoice linking) |
| Data inputs | Import document (customs declaration), withdrawal document (codes, reason) |
| Data outputs | MptDocument (status), ImportDocument/WithdrawalDocument (status machine) |
| Acceptance evidence | documents.spec.ts (CRUD, status) — **partial** (no async reconciliation) |
| Demo screen | Documents list — **comparison only** (demo has no real MPT document submission) |

## Slices NOT in scope (W0-03+)

| Slice | MF-REQ range | Target WP |
|-------|-------------|-----------|
| Warehouse & TSD | MF-REQ-090–093 | W0-03 |
| Exception handling | MF-REQ-110–112 | W0-04 |
| Correlation ID | MF-REQ-130 | W0-05 |
| Real MPT integration | MF-REF-100–105 | W0-03c + W0-04 |
| Real GS1/NKT/1ecom | — | W0-03b |
