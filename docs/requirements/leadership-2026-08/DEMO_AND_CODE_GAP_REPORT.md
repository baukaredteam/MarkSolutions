# Demo and Code Gap Report

**Date:** 2026-08-21

---

| Workflow        | Leadership Expected                 | Existing Demo                 | Gap                             |
| --------------- | ----------------------------------- | ----------------------------- | ------------------------------- |
| RBAC login      | Role-based access per module        | Login + role claims           | No MFA integration              |
| Product catalog | 44-attribute cards with GS1/NTIN    | Product cards with attributes | WB/OZON template import missing |
| 1ecom sync      | Counterparty verification + catalog | Mock adapter with 8 products  | Real API not implemented        |
| Code order      | Order→MPT→Vault→Print               | Order→MPT→Vault→Print         | No real MPT connection          |
| Billing         | Ledger + invoice + payment          | Ledger + invoice              | Tariff pricing undecided        |
| Code Vault      | Encrypted codes + label keys        | Encrypted codes + labels      | No OpenBao KMS in prod          |
| Print           | PNG DataMatrix labels               | PNG labels                    | No print device integration     |
| Operations      | Import/withdrawal documents         | Documents (partial)           | No async reconciliation         |
| Warehouse       | Shipment + aggregation + TSD        | Not implemented               | W0-03 scope                     |
| Settings        | Config UI                           | Settings (basic)              | No OpenBao/MinIO config UI      |

## Key gaps not in W0-03a scope

- WB/OZON template import (MF-REQ-030/031/032) — missing
- Warehouse lifecycle (MF-REQ-090-093) — missing
- Async reconciliation (MF-REQ-110-112) — missing
- Correlation ID (MF-REQ-130) — missing
- Real MPT/GS1/NKT/1ecom connections — mocks only
