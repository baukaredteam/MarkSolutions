# Owner Decision Pack — Leadership Requirements

**Date:** 2026-08-21
**Status:** AWAITING OWNER APPROVAL
**Branch:** `requirements/leadership-decision-pack`

---

## D-001: Tariff Pricing

**Decision question:** What is the official tariff price per marking code — 0.84 KZT or 8 KZT?

**Business impact:** Determines revenue per code, affects all billing calculations, invoice amounts, settlement with operators, and customer-facing pricing. Wrong choice creates financial misstatement.

**Options:**

| Option | Price | Source | Consequence |
|--------|-------|--------|-------------|
| A: 0.84 KZT/code | 840 tiyn per code | Management material (internal) | Lower revenue per code; higher volume needed for break-even; operator cost at 4.70 KZT may exceed client price |
| B: 8 KZT/code | 8000 tiyn per code | Commercial direction (external) | Standard revenue; aligns with operator cost structure; seed data already uses 800 t. (8 KZT) |

**Affected MF-REQ:** MF-REQ-044, MF-REQ-045 (billing balance calculations depend on tariff)

**PROPOSAL — NOT APPROVED:** Option B (8 KZT/code). Seed data and all existing integration tests use 800 t. (8 KZT). Changing to 0.84 KZT would break 279+ passing tests and invalidate billing invariants without a code change.

**Approval owner:** Product Owner + Finance Lead
**Decision deadline:** Before W0-03 billing implementation
**Blocked work package:** W0-03+ (billing tariff hardening)

---

## D-002: Pilot MPT Write Authority

**Decision question:** Should MarkFlow have write authority to IS MPT Stage, and if so, under what conditions?

**Business impact:** Determines whether code orders can actually be submitted to Stage, which is the core business flow. Without write authority, all MPT operations remain read-only mock.

**Options:**

| Option | Scope | Consequence |
|--------|-------|-------------|
| A: Read-only discovery only | HttpMptAdapter GET operations only; no POST/createOrder | Safe; blocks code-order vertical slice; no Stage data created |
| B: Controlled non-production write pilot | HttpMptAdapter POST allowed against test.markirovka.kz only; explicit operator confirmation required per write | Enables limited validation; requires test credentials; audit trail required |
| C: Full production writes | HttpMptAdapter POST allowed against prod; automated reconciliation | Enables full business flow; requires production credentials, outbox durability (W0-04), reconciliation (W0-05) |

**Affected MF-REQ:** MF-REF-101 (createOrder), MF-REF-103 (submitUtilisation), MF-REF-104 (document submission)

**PROPOSAL — NOT APPROVED:** Option A (read-only) for W0-03; Option B (controlled pilot) deferred to W0-03c after adapters are accepted; Option C deferred to W0-04+W0-05.

**Approval owner:** Integration Lead + Product Owner
**Decision deadline:** Before W0-03c MPT contract verification
**Blocked work package:** W0-03c (MPT write), W0-04 (durable outbox)

---

## D-003: Data Ownership

**Decision question:** Who owns the data created in MarkFlow — the platform operator or the individual client organizations?

**Business impact:** Determines data retention, export, deletion rights, audit obligations, and multi-tenant isolation guarantees. Affects regulatory compliance (data protection) and business continuity.

**Options:**

| Option | Ownership | Consequence |
|--------|-----------|-------------|
| A: Platform owns all data | MarkFlow retains all product cards, codes, orders, documents | Simpler retention; client cannot export/delete independently; regulatory risk if client requests data deletion |
| B: Client organizations own their data | Each tenant owns their product cards, codes, orders, documents | Client can request data export/deletion; MarkFlow retains audit trail only; more complex retention |
| C: Shared ownership | MarkFlow owns infrastructure/meta-data; clients own business data | Requires clear boundary definition; complex audit trail |

**Affected MF-REQ:** MF-REQ-060–064 (Code Vault retention), MF-REQ-080–082 (document retention)

**PROPOSAL — NOT APPROVED:** Option B (client ownership). This aligns with data protection principles and allows clients to request data export/deletion. MarkFlow retains only audit trail and anonymized analytics.

**Approval owner:** Legal Lead + Product Owner
**Decision deadline:** Before W1 production deployment
**Blocked work package:** W1+ (production deployment, data retention policies)

---

## D-004: Code Vault Cryptotext Retention

**Decision question:** How long should encrypted marking codes (Code Vault ciphertexts) be retained in the system?

**Business impact:** Determines storage costs, compliance obligations, and code availability for reprinting/utilisation. Too short = lost codes; too long = storage bloat and compliance risk.

**Options:**

| Option | Retention | Consequence |
|--------|-----------|-------------|
| A: Indefinite | Retain all codes forever | Maximum availability; highest storage cost; compliance risk if client requests deletion |
| B: TTL-based (e.g., 5 years) | Auto-delete after retention period | Balanced; requires lifecycle policy; codes unavailable after TTL |
| C: Client-controlled | Each tenant defines their own retention | Most flexible; most complex; requires UI for retention settings |

**Affected MF-REQ:** MF-REQ-060–064 (Code Vault lifecycle)

**PROPOSAL — NOT APPROVED:** Option A (indefinite) for W0-03a scope. Retention policy is a follow-up decision (W0-03a implements encryption; retention is a separate concern). Document indefinite retention as the default until an owner-approved policy replaces it.

**Approval owner:** Security Lead + Legal Lead
**Decision deadline:** Before W0-03a KMS adapter implementation (to set key rotation schedule)
**Blocked work package:** W0-03a (KMS key rotation metadata must align with retention policy)

---

## D-005: Document Combinations

**Decision question:** What rules govern combining documents (invoice + customs declaration, withdrawal + audit trail, etc.)?

**Business impact:** Determines document workflow correctness. Wrong rules create invalid document states, reject legitimate submissions, or accept invalid ones.

**Options:**

| Option | Rule | Consequence |
|--------|------|-------------|
| A: Invoice + Customs Declaration required for import | Every import document must reference an invoice and customs declaration | Strictest; may reject legitimate partial imports |
| B: Invoice OR Customs Declaration (flexible) | Either document type is sufficient for import | Most flexible; may accept incomplete documentation |
| C: Configurable per product group | Different rules per product category | Most accurate; most complex; requires configuration UI |

**Affected MF-REQ:** MF-REQ-080–083 (document workflows)

**PROPOSAL — NOT APPROVED:** Option C (configurable). Product groups have different regulatory requirements; a fixed rule may be too strict or too lenient. Configuration requires UI and testing.

**Approval owner:** Product Owner + Legal Lead
**Decision deadline:** Before W0-03+ document workflows
**Blocked work package:** W0-03+ (document combination validation)

---

## D-006: Role Permission Matrix

**Decision question:** What is the complete role × module permission matrix for all 16 modules?

**Business impact:** Determines what each role can see and do in every module. Incomplete matrix = security gaps or over-permissioning.

**Options:**

| Option | Completeness | Consequence |
|--------|-------------|-------------|
| A: 8 base roles × 16 modules | Full matrix from leadership docs | Most secure; requires UI for each cell; largest implementation effort |
| B: 8 base roles × 6 core modules only | Partial matrix for ORD, BILL, CAT, CODE, PRINT, OPS | Faster to implement; gaps in remaining 10 modules |
| C: Role inheritance hierarchy | Define parent roles; child roles inherit permissions | Most maintainable; requires role hierarchy design |

**Affected MF-REQ:** MF-REQ-001 (RBAC), MF-REQ-002 (role-based access)

**PROPOSAL — NOT APPROVED:** Option A (full matrix). Security requires complete coverage; partial matrices create audit gaps. Implementation effort is justified by the security posture.

**Approval owner:** Security Lead + Product Owner
**Decision deadline:** Before W0-01+ RBAC completion
**Blocked work package:** W0-01+ (RBAC hardening)

---

## Decision timeline

| Decision | Deadline | Status | Next action if approved |
|----------|----------|--------|------------------------|
| D-001 (Tariff) | Before W0-03 billing | Pending | Update seed data and billing tests |
| D-002 (MPT write) | Before W0-03c | Pending | Enable/disable HttpMptAdapter POST in DI |
| D-003 (Data ownership) | Before W1 | Pending | Add data export/deletion APIs |
| D-004 (Code retention) | Before W0-03a KMS | Pending | Set key rotation schedule |
| D-005 (Document rules) | Before W0-03+ docs | Pending | Add document combination validation |
| D-006 (Role matrix) | Before W0-01+ RBAC | Pending | Complete role×module permission matrix |
