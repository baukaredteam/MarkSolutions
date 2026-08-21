# Traceability Matrix

**Date:** 2026-08-21
**Status:** DRAFT

---

| Requirement ID | Source       | Existing API/Module                          | Existing Demo Screen | Status             | Acceptance Evidence        | Target WP |
| -------------- | ------------ | -------------------------------------------- | -------------------- | ------------------ | -------------------------- | --------- |
| MF-REQ-001     | LEAD-001 §2  | `AuthService`, guards                        | Login screen         | implemented        | auth.spec.ts, rbac.spec.ts | W0-01     |
| MF-REQ-002     | LEAD-001 §1  | `TenantGuard`, `RolesGuard`                  | Module access        | implemented        | rbac.spec.ts               | W0-01     |
| MF-REQ-003     | LEAD-001 §2  | `MFA_ENABLED` config                         | MFA prompt           | partial            | No integration test        | W0-01+    |
| MF-REQ-004     | LEAD-001 §2  | `JwtModule`, JWT_SECRET                      | Login flow           | implemented        | auth.spec.ts               | W0-01     |
| MF-REQ-010     | LEAD-001/005 | `ModerationService`                          | Card moderation      | implemented        | moderation.spec.ts         | W0-01     |
| MF-REQ-011     | LEAD-001     | ProductCard model (44 attrs)                 | Card detail          | implemented        | products-cards.spec.ts     | W0-01     |
| MF-REQ-012     | LEAD-005     | `GtinResolver`, `gs1Mod10Check`              | GTIN validation      | implemented        | code-lookup.spec.ts        | W0-01     |
| MF-REQ-013     | LEAD-001/005 | `tnvedHint`, `heuristicStrengthensFix`       | Card form            | implemented        | catalog-import.spec.ts     | W0-01     |
| MF-REQ-014     | LEAD-001     | `fuzzyKeyOf`, `checkDuplicate`               | Card form            | implemented        | catalog-import.spec.ts     | W0-01     |
| MF-REQ-015     | LEAD-001     | `audit` field on ProductCard                 | Moderation view      | implemented        | moderation.spec.ts         | W0-01     |
| MF-REQ-016     | LEAD-001     | `@@index([tenantId, gtin])` + partial unique | Card list            | implemented        | catalog-migration.spec.ts  | W0-01     |
| MF-REQ-020     | LEAD-001     | `MockEcomAdapter.verify()`                   | Onboarding           | implemented (mock) | ecom-products.spec.ts      | W0-01     |
| MF-REQ-021     | LEAD-001/005 | `MockEcomAdapter.listProducts()`             | Products list        | implemented (mock) | ecom-products.spec.ts      | W0-01     |
| MF-REQ-022     | LEAD-001     | `MockEcomAdapter.resolve()`                  | Onboarding           | implemented        | onboarding.spec.ts         | W0-01     |
| MF-REQ-040     | LEAD-014     | `BillingService`, `LedgerEntry`              | Billing              | implemented        | billing.spec.ts            | W0-01     |
| MF-REQ-041     | LEAD-014     | `reserveOn`, `release`, `settle`             | Billing              | implemented        | billing.spec.ts            | W0-01     |
| MF-REQ-042     | LEAD-014     | `InvoiceService`, `createInvoice`            | Invoice              | implemented        | invoice.spec.ts            | W0-01     |
| MF-REQ-043     | LEAD-014     | `kaspiWebhook`                               | Invoice              | implemented        | invoice.spec.ts            | W0-01     |
| MF-REQ-044     | ROADMAP §5   | `activeTariff`                               | Billing              | conflict           | D-01/D-02 pending          | W0-03+    |
| MF-REQ-045     | LEAD-014     | `getBalance`, ledger invariant               | Billing              | implemented        | billing.spec.ts            | W0-01     |
| MF-REQ-050     | LEAD-004     | `OrderService.create`, state machine         | Order list           | implemented        | order.spec.ts              | W0-01     |
| MF-REQ-051     | W0-02R       | `order_number_seq` (PG sequence)             | Order list           | implemented        | order.spec.ts              | W0-02R    |
| MF-REQ-052     | LEAD-004     | `idempotencyKey` unique                      | Order list           | implemented        | order.spec.ts              | W0-01     |
| MF-REQ-053     | LEAD-004     | `businessPlaceId` validation                 | Order form           | implemented        | order.spec.ts              | W0-01     |
| MF-REQ-060     | LEAD-004     | `CodeVault`, `VaultService.seal`             | Code vault           | implemented        | code-vault.spec.ts         | W0-01     |
| MF-REQ-061     | LEAD-004     | `kms.encrypt`, AES-256-GCM                   | Code vault           | implemented        | code-vault.spec.ts         | W0-01     |
| MF-REQ-062     | LEAD-006     | `labelKey`, PNG render                       | Label print          | implemented        | label.spec.ts              | W0-01     |
| MF-REQ-063     | LEAD-004     | `CodeEvent` status machine                   | Code vault           | implemented        | code-event.spec.ts         | W0-01     |
| MF-REQ-064     | LEAD-004     | `CodeEvent` append-only                      | Code vault           | implemented        | code-event.spec.ts         | W0-01     |
| MF-REQ-070     | LEAD-006     | `LabelService.renderPng`                     | Label print          | implemented        | label.spec.ts              | W0-01     |
| MF-REQ-071     | LEAD-006     | `LabelService.print`                         | Label print          | implemented        | label.spec.ts              | W0-01     |
| MF-REQ-072     | LEAD-006     | `LabelService.reprint`                       | Label print          | implemented        | label.spec.ts              | W0-01     |
| MF-REQ-080     | LEAD-009     | `DocumentService`                            | Documents            | partial            | documents.spec.ts          | W0-02     |
| MF-REQ-081     | LEAD-009     | `WithdrawalDocument`                         | Documents            | partial            | documents.spec.ts          | W0-02     |
| MF-REQ-082     | LEAD-009     | `MptDocument` status                         | Documents            | partial            | documents.spec.ts          | W0-02     |
| MF-REQ-083     | LEAD-009     | —                                            | —                    | unknown            | D-005 pending              | W0-03+    |
| MF-REQ-090     | LEAD-012     | —                                            | —                    | missing            | —                          | W0-03     |
| MF-REQ-091     | LEAD-007     | —                                            | —                    | missing            | —                          | W0-03     |
| MF-REQ-092     | LEAD-012     | —                                            | —                    | missing            | —                          | W0-03     |
| MF-REQ-093     | LEAD-012     | —                                            | —                    | missing            | —                          | W0-03     |
| MF-REF-100     | ROADMAP      | `HttpMptAdapter.ensureToken`                 | MPT                  | implemented (mock) | mpt-http.spec.ts           | W0-01     |
| MF-REF-101     | ROADMAP      | `HttpMptAdapter.createOrder`                 | MPT                  | implemented (mock) | mpt-http.spec.ts           | W0-01     |
| MF-REF-102     | ROADMAP      | `HttpMptAdapter.getOrder/getCodes`           | MPT                  | implemented (mock) | mpt-http.spec.ts           | W0-01     |
| MF-REF-103     | ROADMAP      | `HttpMptAdapter.submitUtilisation`           | MPT                  | implemented (mock) | mpt-http.spec.ts           | W0-01     |
| MF-REF-104     | ROADMAP      | `HttpMptAdapter.submitImport/Withdrawal`     | MPT                  | implemented (mock) | mpt-http.spec.ts           | W0-01     |
| MF-REF-105     | ROADMAP §5   | —                                            | —                    | decision-needed    | D-005 pending              | W0-04+    |
| MF-REQ-110     | ROADMAP      | —                                            | —                    | missing            | —                          | W0-04     |
| MF-REQ-111     | LEAD-013     | —                                            | —                    | missing            | —                          | W0-04     |
| MF-REQ-112     | LEAD-013     | —                                            | —                    | missing            | —                          | W0-04     |
| MF-REQ-120     | AGENTS.md    | secret-scan, config-validation               | —                    | implemented        | secret-scan pass           | W0-01     |
| MF-REQ-121     | AGENTS.md    | `sanitizeHealthError`                        | Health               | implemented        | health.spec.ts             | W0-01     |
| MF-REQ-122     | AGENTS.md    | `AllExceptionsFilter`                        | Error                | implemented        | health.spec.ts             | W0-01     |
| MF-REQ-123     | AGENTS.md    | `validateProductionConfig`                   | Startup              | implemented        | db-bootstrap.spec.ts       | W0-01     |
| MF-REQ-130     | ROADMAP      | —                                            | —                    | missing            | —                          | W0-05     |
| MF-REQ-131     | ROADMAP      | `sanitizeHealthError`                        | Health               | implemented        | health.spec.ts             | W0-05     |
| MF-REQ-132     | ROADMAP      | `/health`, `/health/ready`                   | Health               | implemented        | http.spec.ts               | W0-01     |
