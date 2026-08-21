# Decision Log

**Date:** 2026-08-21
**Status:** DRAFT — requires leadership approval

---

## Unresolved decisions

| ID    | Decision                                | Options                                                   | Owner                 | Status          |
| ----- | --------------------------------------- | --------------------------------------------------------- | --------------------- | --------------- |
| D-001 | Tariff pricing (0.84 vs 8 KZT/code)     | Management material shows 0.84; commercial direction is 8 | Product + Finance     | conflict        |
| D-002 | Pilot MPT write authority               | Read-only vs full write on Stage                          | Integration + Product | decision-needed |
| D-003 | Data ownership (MarkFlow vs client)     | Platform owns vs client owns                              | Legal + Product       | decision-needed |
| D-004 | Code Vault cryptotext retention         | Retain forever vs. TTL-based deletion                     | Security + Legal      | decision-needed |
| D-005 | Document combinations (invoice/customs) | Rules for combining document types                        | Product + Legal       | unknown         |
| D-006 | Role matrix (full permission map)       | Complete role×module permission matrix                    | Product + Security    | decision-needed |

## Conflicts found

| Conflict              | Sides                                         | Current State                               |
| --------------------- | --------------------------------------------- | ------------------------------------------- |
| Tariff pricing        | 0.84 KZT (management) vs 8 KZT (commercial)   | seed uses 800 t tenge (8 KZT) per code      |
| Document combinations | No explicit rules in leadership docs          | Invoice + customs declaration logic unclear |
| Role matrix           | Base roles defined; no full permission matrix | Partial RBAC implemented                    |
