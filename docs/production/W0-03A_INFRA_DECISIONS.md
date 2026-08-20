# W0-03a Infrastructure Decisions

**Date:** 2026-08-21
**Branch:** `w0-03a-inputs` (from `main` / `af3e1b5`)
**Purpose:** Resolve five critical infrastructure decisions blocking W0-03a (typed config + MinIO/OpenBao foundation).
**Scope:** Documentation only. No code, no network requests, no credentials.

---

## Decision 1: OpenBao — production/stage endpoints, CA/TLS, Transit engine, named key, health

### Decision owner

Infrastructure Lead / Security Lead

### Options

**Option A: Managed OpenBao cluster (HashiCorp Cloud Platform or self-hosted HA)**

- Security: TLS 1.2+ with mutual TLS; HA with auto-unseal via cloud KMS; audit logging to SIEM.
- Operational: managed upgrades, backups, disaster recovery handled by provider; higher cost.
- Trade-off: vendor lock-in; monthly cost; simpler operations.

**Option B: Self-hosted OpenBao on Kubernetes (existing infra)**

- Security: TLS termination at ingress; unseal via transit or cloud KMS; audit to stdout/file.
- Operational: team manages upgrades, backups, disaster recovery; lower cost; more operational burden.
- Trade-off: requires on-call expertise; patch management; backup/restore testing.

**Option C: OpenBao sidecar per pod (dev/stage only)**

- Security: no network transit; data in local volume; suitable for non-production only.
- Operational: ephemeral; data lost on pod restart; no HA.
- Trade-off: not suitable for production; dev convenience only.

### Exact answer required

- Which deployment model for production and stage?
- What is the TLS CA trust chain? (public CA, private CA, or self-signed with pinning?)
- What is the Transit engine mount path? (e.g., `transit/`)
- What is the named key path? (e.g., `transit/keys/markflow-prod`)
- What is the health endpoint URL? (e.g., `https://openbao.example.com/v1/sys/health`)

### PROPOSAL — NOT APPROVED

Option B (self-hosted on K8s) with TLS via cert-manager, Transit mount at `transit/`, key at `transit/keys/markflow`, health at `v1/sys/health`. This is the lowest-cost option that keeps secrets in-house. Requires on-call runbook.

### Evidence to prove the answer

- OpenBao deployment manifest or Helm chart (not in this repo).
- TLS certificate and CA chain.
- Transit engine mount verification: `vault read transit/keys/markflow`.
- Health endpoint response: `curl -s https://openbao.example.com/v1/sys/health`.

### Implementation consequence

- VaultKmsAdapter must use the confirmed mount path and key name.
- Health check must verify OpenBao seal status.
- TLS configuration must be injected via env or mounted cert.

---

## Decision 2: OpenBao authentication — AppRole, Kubernetes, or JWT/OIDC

### Decision owner

Security Lead / Platform Lead

### Options

**Option A: AppRole (static role ID + secret ID)**

- Security: secret ID is short-lived (wrapped); role ID is static; token TTL configurable.
- Operational: simple to implement; requires secret ID delivery mechanism (e.g., K8s Secret).
- Trade-off: secret ID must be rotated; not ideal for auto-scaling.

**Option B: Kubernetes auth (service account JWT)**

- Security: no static secrets; identity derived from K8s service account; least-privilege via service account annotations.
- Operational: no secret rotation needed; auto-scales with pods; requires K8s auth method configured in OpenBao.
- Trade-off: requires K8s cluster; not suitable for non-K8s deployments.

**Option C: JWT/OIDC auth (external identity provider)**

- Security: identity from external IdP; token validation via JWKS endpoint; least-privilege via claims.
- Operational: requires IdP integration; more complex; suitable for multi-tenant or federated identity.
- Trade-off: depends on IdP availability; more complex than K8s auth.

### Exact answer required

- Which auth method for production and stage?
- What is the identity issuer / role name?
- What are the least-privilege capabilities? (encrypt/decrypt on specific key path only)
- What is the token TTL and renewal policy?
- What is the revocation and break-glass process?

### PROPOSAL — NOT APPROVED

Option B (Kubernetes auth) with role `markflow-kms`, capabilities `["encrypt", "decrypt", "read"]` on `transit/keys/markflow`, token TTL 1h with renewal, break-glass via emergency unseal key stored offline. This avoids static secrets and auto-scales.

### Evidence to prove the answer

- K8s auth method enabled in OpenBao: `vault auth enable kubernetes`.
- Role configuration: `vault write auth/kubernetes/role/markflow-kms ...`.
- Token renewal test: token survives pod restart via projected SA token.
- Break-glass test: emergency unseal key decrypts a test ciphertext.

### Implementation consequence

- VaultKmsAdapter must use projected service account token for auth.
- Token refresh must happen automatically (not stored in env).
- Break-glass procedure must be documented in runbook.

---

## Decision 3: Key management — rotation, versioning, ciphertext format, rewrap, SLO, audit, recovery

### Decision owner

Security Lead / DRE

### Options

**Option A: OpenBao-managed key rotation (automatic)**

- Security: rotation handled by OpenBao; old key versions retained for decrypt; ciphertext includes key version.
- Operational: rotation is automatic; rewrap not needed (OpenBao handles it).
- Trade-off: depends on OpenBao availability; rotation schedule is OpenBao-configured.

**Option B: Application-managed key rotation (manual)**

- Security: rotation triggered by application; old key versions retained; ciphertext includes key version.
- Operational: rotation is manual or scheduled via cron; rewrap needed for old ciphertexts.
- Trade-off: more control; more operational burden; risk of missed rotation.

**Option C: Envelope encryption with data key per object**

- Security: data key encrypted by master key; data key stored with ciphertext; rotation only requires new master key.
- Operational: each object has its own data key; no rewrap needed for rotation.
- Trade-off: more storage overhead; simpler rotation; industry standard (AWS KMS pattern).

### Exact answer required

- Which key management model? (A, B, or C)
- What is the rotation cadence? (e.g., 90 days)
- What is the versioning convention? (e.g., version byte in ciphertext header)
- What is the ciphertext/envelope format? (e.g., version(1) || nonce(12) || tag(16) || ciphertext)
- What is the rewrap procedure for old ciphertexts?
- What is the encryption-decryption availability SLO? (e.g., 99.9%)
- What is the audit log retention for KMS operations?
- Who owns recovery testing?

### PROPOSAL — NOT APPROVED

Option C (envelope encryption) with automatic rotation (90 days), version byte in header, ciphertext format `version(1) || nonce(12) || tag(16) || ciphertext`, no rewrap needed (data key stored with ciphertext), SLO 99.9%, audit retention 1 year, recovery testing owned by DRE quarterly. This is the industry standard (AWS KMS, GCP KMS, Azure Key Vault all use envelope encryption).

### Evidence to prove the answer

- Key rotation test: encrypt with key v1, rotate to v2, decrypt with v2 succeeds.
- Ciphertext format test: decrypt old ciphertext after rotation succeeds without rewrap.
- Audit log: KMS encrypt/decrypt operations appear in OpenBao audit log.
- Recovery test: encrypt data, rotate key, destroy key material, recover from backup.

### Implementation consequence

- VaultKmsAdapter must implement envelope encryption (data key per object).
- Ciphertext must include key version byte.
- Rotation must be automatic (OpenBao-managed).
- Health check must verify key availability.

---

## Decision 4: MinIO/S3 — bucket naming, region, endpoint, path-style, identity, tenant prefix, retention, lifecycle, backup, deletion

### Decision owner

SRE / DRE

### Options

**Option A: MinIO on Kubernetes (existing infra)**

- Security: TLS termination at ingress; bucket policy via MinIO IAM; encryption-at-rest via SSE-KMS.
- Operational: managed by K8s operators; backup via MinIO replication or Velero; lower cost.
- Trade-off: requires MinIO operator; on-call expertise; backup/restore testing.

**Option B: AWS S3 (cloud-managed)**

- Security: IAM roles; bucket policy; encryption-at-rest via SSE-KMS; versioning enabled.
- Operational: fully managed; backup via versioning and cross-region replication; higher cost.
- Trade-off: vendor lock-in; higher cost; simpler operations.

**Option C: MinIO gateway to S3 (hybrid)**

- Security: MinIO as S3-compatible gateway; local caching; encryption via S3.
- Operational: local development with MinIO; production with S3; hybrid complexity.
- Trade-off: gateway adds latency; caching complexity; migration path to pure S3.

### Exact answer required

- Which storage platform for production and stage?
- What is the per-environment bucket naming convention? (e.g., `markflow-{env}-{region}`)
- What is the region / availability zone?
- What is the endpoint URL? (e.g., `https://minio.example.com` or `https://s3.{region}.amazonaws.com`)
- What is the path-style policy? (path-style or virtual-hosted-style)
- What is the identity / IAM policy? (MinIO policy or AWS IAM role)
- What is the tenant object-prefix model? (e.g., `{tenantId}/{uuid}` or `{uuid}`)
- What is the object retention / lifecycle policy?
- What is the backup / versioning policy?
- What is the deletion authorization? (who can delete objects?)

### PROPOSAL — NOT APPROVED

Option A (MinIO on K8s) with bucket `markflow-{env}` (e.g., `markflow-prod`), path-style, MinIO IAM with per-tenant prefix `{tenantId}/{uuid}`, SSE-KMS encryption, 90-day retention for code exports, versioning enabled, deletion requires admin role + confirmation. Backup via Velero. This keeps data in-house and aligns with existing infra.

### Evidence to prove the answer

- MinIO deployment manifest or Helm chart.
- Bucket policy: `mc anonymous get-json markflow-prod/`.
- Encryption test: `mc ls markflow-prod/ --json | jq '.encryption'`.
- Retention test: object older than 90 days is deleted by lifecycle rule.
- Backup test: restore from Velero snapshot.

### Implementation consequence

- MinIOStorageAdapter must use the confirmed endpoint, bucket, and path-style.
- Object keys must include tenant prefix `{tenantId}/{uuid}`.
- Encryption must be SSE-KMS (not SSE-S3) for code Vault compliance.
- Deletion must require admin role + audit log entry.

---

## Decision 5: Storage encryption — SSE-S3 vs SSE-KMS vs application envelope encryption

### Decision owner

Security Lead / DRE

### Options

**Option A: SSE-S3 (server-side encryption with S3-managed keys)**

- Security: encryption at rest; key managed by S3/MinIO; no application involvement.
- Operational: zero application code; default encryption on bucket.
- Trade-off: no key rotation control; no audit of encryption operations; less granular access control.

**Option B: SSE-KMS (server-side encryption with KMS-managed keys)**

- Security: encryption at rest; key managed by OpenBao/AWS KMS; key rotation controlled; audit of encryption operations.
- Operational: requires KMS integration; bucket policy must reference key ARN; more complex.
- Trade-off: depends on KMS availability; more operational burden; industry standard.

**Option C: Application envelope encryption (encrypt before upload)**

- Security: data encrypted before reaching storage; storage never sees plaintext; key managed by KMS.
- Operational: application encrypts/decrypts on every read/write; more code; more latency.
- Trade-off: highest security; highest complexity; double encryption if SSE-S3/KMS also enabled.

### Exact answer required

- Which encryption model? (A, B, or C)
- If B: what is the key ARN / key ID for SSE-KMS?
- If C: what is the envelope format? (same as KMS decision above)
- Who owns the minio-server configuration responsibility?
- What is the evidence of encryption at rest? (e.g., MinIO audit log, S3 head-object response)

### PROPOSAL — NOT APPROVED

Option B (SSE-KMS) with OpenBao-managed key, key ARN in bucket policy, default encryption on bucket, encryption operations logged to OpenBao audit. This provides key rotation, audit, and compliance without double encryption. minio-server configuration owned by SRE; evidence via `mc ls --json` and OpenBao audit log.

### Evidence to prove the answer

- Bucket default encryption: `mc anonymous get-json markflow-prod/ | jq '.encryption'`.
- Key ARN matches OpenBao key path.
- Encryption test: write object, verify SSE-KMS in head-object response.
- Audit test: MinIO audit log shows encryption operation.

### Implementation consequence

- MinIOStorageAdapter must NOT encrypt at application level (SSE-KMS handles it).
- Bucket policy must enforce SSE-KMS (deny unencrypted uploads).
- Health check must verify bucket encryption status.

---

## Owner response template

The project owner should complete this section by replacing `[ANSWER]` with the selected option and filling in the exact values.

### Decision 1: OpenBao

- **Production deployment model:** `[ANSWER: Option A / B / C]`
- **Stage deployment model:** `[ANSWER]`
- **TLS CA trust:** `[ANSWER: public CA / private CA / self-signed + pinning]`
- **Transit engine mount path:** `[ANSWER: e.g., transit/]`
- **Named key path:** `[ANSWER: e.g., transit/keys/markflow-prod]`
- **Health endpoint URL:** `[ANSWER: e.g., https://openbao.example.com/v1/sys/health]`

### Decision 2: OpenBao authentication

- **Auth method:** `[ANSWER: AppRole / Kubernetes / JWT]`
- **Identity issuer / role name:** `[ANSWER]`
- **Least-privilege capabilities:** `[ANSWER: e.g., encrypt, decrypt on transit/keys/markflow]`
- **Token TTL:** `[ANSWER: e.g., 1h]`
- **Token renewal:** `[ANSWER: automatic / manual]`
- **Revocation process:** `[ANSWER]`
- **Break-glass process:** `[ANSWER]`

### Decision 3: Key management

- **Key management model:** `[ANSWER: A / B / C]`
- **Rotation cadence:** `[ANSWER: e.g., 90 days]`
- **Versioning convention:** `[ANSWER: e.g., version byte in ciphertext header]`
- **Ciphertext format:** `[ANSWER: e.g., version(1) || nonce(12) || tag(16) || ciphertext]`
- **Rewrap procedure:** `[ANSWER: automatic / manual / not needed]`
- **Encryption-decryption SLO:** `[ANSWER: e.g., 99.9%]`
- **Audit log retention:** `[ANSWER: e.g., 1 year]`
- **Recovery testing owner:** `[ANSWER: e.g., DRE quarterly]`

### Decision 4: MinIO/S3

- **Storage platform:** `[ANSWER: MinIO on K8s / AWS S3 / MinIO gateway]`
- **Bucket naming convention:** `[ANSWER: e.g., markflow-{env}]`
- **Region:** `[ANSWER]`
- **Endpoint URL:** `[ANSWER]`
- **Path-style policy:** `[ANSWER: path-style / virtual-hosted-style]`
- **Identity / IAM policy:** `[ANSWER]`
- **Tenant object-prefix model:** `[ANSWER: e.g., {tenantId}/{uuid}]`
- **Object retention / lifecycle:** `[ANSWER: e.g., 90-day retention for code exports]`
- **Backup / versioning:** `[ANSWER: enabled / disabled]`
- **Deletion authorization:** `[ANSWER: admin role + confirmation]`

### Decision 5: Storage encryption

- **Encryption model:** `[ANSWER: SSE-S3 / SSE-KMS / application envelope]`
- **Key ARN / key ID (if SSE-KMS):** `[ANSWER]`
- **Envelope format (if application):** `[ANSWER]`
- **minio-server configuration owner:** `[ANSWER: SRE / DRE]`
- **Evidence of encryption at rest:** `[ANSWER]`

---

## Definition of Ready for W0-03a

| #   | Gate                                                                  | Status     | Owner               |
| --- | --------------------------------------------------------------------- | ---------- | ------------------- |
| 1   | Decision 1 (OpenBao endpoints/CA/mount/key/health) answered           | ❌ Pending | Infrastructure Lead |
| 2   | Decision 2 (OpenBao auth method/identity/policy/TTL) answered         | ❌ Pending | Security Lead       |
| 3   | Decision 3 (key rotation/versioning/format/SLO/audit) answered        | ❌ Pending | Security Lead       |
| 4   | Decision 4 (MinIO bucket/region/endpoint/identity/retention) answered | ❌ Pending | SRE                 |
| 5   | Decision 5 (encryption model/key/config-owner/evidence) answered      | ❌ Pending | Security Lead       |
| 6   | Non-production MinIO available (dev/stage)                            | ❌ Pending | SRE                 |
| 7   | Non-production OpenBao available (dev/stage)                          | ❌ Pending | SRE                 |
| 8   | Non-production identities held outside Git (secrets manager)          | ❌ Pending | Security Lead       |
| 9   | Named owner approval for each answer                                  | ❌ Pending | Project Owner       |

**W0-03a implementation cannot begin until all 9 gates are green.**

---

## Deferrals — not blocking W0-03a

| Item                           | Status  | Blocks     | Note                                                   |
| ------------------------------ | ------- | ---------- | ------------------------------------------------------ |
| GS1 API contract               | Missing | W0-03b     | Not needed for MinIO/OpenBao foundation                |
| NKT API contract               | Missing | W0-03b     | Not needed for MinIO/OpenBao foundation                |
| 1ecom API contract             | Missing | W0-03b     | Not needed for MinIO/OpenBao foundation                |
| IS MPT official contract       | Missing | W0-03c     | Not needed for MinIO/OpenBao foundation                |
| GS1/NKT/1ecom test credentials | Missing | W0-03b     | Not needed for MinIO/OpenBao foundation                |
| Stage test credentials         | Missing | W0-03c     | Not needed for MinIO/OpenBao foundation                |
| businessPlaceId mapping        | Missing | W0-03c     | Not needed for MinIO/OpenBao foundation                |
| Circuit breaker thresholds     | Missing | W0-03b/03c | Design decision, can be deferred to implementation     |
| Retry backoff parameters       | Missing | W0-03b/03c | Design decision, can be deferred to implementation     |
| MinIO lifecycle rules          | Missing | W0-03a     | Required before implementation; included in Decision 4 |
| OpenBao audit logging policy   | Missing | W0-03a     | Required before implementation; included in Decision 3 |
