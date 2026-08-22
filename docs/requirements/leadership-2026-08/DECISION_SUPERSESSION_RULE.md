# Decision Supersession Rule

**Date:** 2026-08-22

---

## Rule

A later named legal/finance/integration decision record may **supersede only the affected policy version** of a prior decision. It **never** rewrites:

- Historic accruals (posted ledger entries, invoice amounts, settlement records)
- Audit events (code access logs, moderation decisions, document submissions)
- Prior decision records (each record is preserved with its original status and date)

## How supersession works

1. A new decision record is created with `Status: Superseded` referencing the prior record it replaces.
2. The prior record retains its original status, date, and content.
3. Only the **policy going forward** changes; all historical data remains as-is.
4. The supersession record must cite the affected MF-REQ IDs and the exact policy version it replaces.
5. No automatic migration of existing data is triggered by supersession — data migration requires a separate decision.

## Example

If D-001 (tariff pricing) is superseded by a new decision D-001v2:
- D-001 retains `Status: Superseded` with original date and content.
- D-001v2 has `Status: Adopted` with new date and content.
- All posted accruals at 800 tiyn remain valid; new accruals use the new tariff.
- No ledger entries are modified by the supersession.
