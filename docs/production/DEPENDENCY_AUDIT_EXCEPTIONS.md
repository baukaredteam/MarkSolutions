# Dependency Audit Exceptions (W0-02R)

This register documents high/critical vulnerabilities that are **explicitly exempted**
from the strict dependency audit (`scripts/audit-policy.mjs`). The audit fails closed on
any high/critical vulnerability NOT listed here. Exceptions are time-boxed: when an
exception expires, the dependency MUST be upgraded or the finding remediated.

Policy: never suppress the audit with `|| true`. Only documented, owned, time-boxed
exceptions are permitted.

| Package        | Advisory            | Severity | Owner                    | Expires    | Reason                                                                                                                                                          |
| -------------- | ------------------- | -------- | ------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepmerge-ts` | GHSA-ggr8-5vv4-36mx | high     | security@markflow / DBRE | 2026-11-30 | Transitive DEV-ONLY dependency of `@prisma/config` (prisma CLI). Not in production runtime bundle. No production code merges untrusted recursive object graphs. |
| `nanoid`       | GHSA-2v37-7h3g-55p8 | high     | security@markflow / DBRE | 2026-11-30 | Transitive DEV/TEST dependency (vite/vitest). Not in production runtime. Custom zero-size generators never used.                                                |

## Remediation tracking

- **2026-11-30** — review expiry. If prisma ships a patched `@prisma/config` (removes vulnerable `deepmerge-ts`), drop the `deepmerge-ts` exception and run `npm audit fix`. Similarly bump `nanoid` to `>=3.3.18` when compatible.
- Any NEW high/critical NOT in this register fails CI immediately.
