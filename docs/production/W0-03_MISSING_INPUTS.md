# W0-03 Missing Inputs

**Date:** 2026-08-21
**Scope:** Items that make real implementation unsafe without resolution. Not assumptions.

---

## Critical missing inputs (block PR 03a)

| #   | Item                                  | Why it's missing                                              | Impact if assumed                                                          | Required action                                                                                           |
| --- | ------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | **OpenBao transit engine mount path** | VaultKmsAdapter is a stub; no OpenBao is deployed yet         | Wrong mount path = all encrypt/decrypt fail at runtime                     | Deploy OpenBao (W0-03 infra task); confirm mount path (e.g., `transit/keys/markflow`)                     |
| 2   | **OpenBao auth method**               | VaultKmsAdapter is a stub; no auth policy defined             | Static token in env is insecure; AppRole/K8s auth needed for production    | Decide auth method: AppRole, Kubernetes, or JWT; document token lifecycle                                 |
| 3   | **Key rotation policy**               | FileKmsAdapter has no key rotation; VaultKmsAdapter is a stub | Key compromise = all encrypted data lost; no rotation = compliance failure | Define rotation schedule (e.g., 90 days), key versioning scheme, migration strategy for re-encrypted data |
| 4   | **MinIO bucket naming convention**    | No MinIO is deployed yet; bucket name is arbitrary            | Wrong bucket name = cross-environment data mixing                          | Define bucket naming: `markflow-{env}-{region}` (e.g., `markflow-prod-eu-central-1`)                      |
| 5   | **MinIO encryption-at-rest policy**   | No MinIO is deployed yet; encryption config unknown           | Unencrypted object storage = compliance failure                            | Confirm SSE-KMS or SSE-S3; define key ARN for SSE-KMS                                                     |

## Critical missing inputs (block PR 03b)

| #   | Item                                | Why it's missing                                | Impact if assumed                              | Required action                                                                  |
| --- | ----------------------------------- | ----------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| 6   | **GS1 API contract**                | No GS1 API access confirmed; contract unknown   | Wrong endpoint/auth = adapter fails at runtime | Obtain GS1 API documentation; confirm endpoint, auth method, rate limits         |
| 7   | **NKT API contract**                | No NKT API access confirmed; contract unknown   | Wrong endpoint/auth = adapter fails at runtime | Obtain NKT API documentation; confirm endpoint, auth method, submission schema   |
| 8   | **1ecom API contract**              | No 1ecom API access confirmed; contract unknown | Wrong endpoint/auth = adapter fails at runtime | Obtain 1ecom API documentation; confirm endpoint, auth method, verification flow |
| 9   | **GS1/NKT/1ecom test credentials**  | No test credentials available                   | Cannot test adapters against real APIs         | Obtain test/staging credentials for each API                                     |
| 10  | **NKT product registration schema** | NKT API schema unknown; mock uses simple JSON   | Wrong schema = submissions fail silently       | Obtain NKT API schema; confirm required fields, validation rules                 |

## Critical missing inputs (block PR 03c)

| #   | Item                                                 | Why it's missing                                                       | Impact if assumed                                                   | Required action                                                                   |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 11  | **Official Stage API contract (CONTRACT-IS-MPT.md)** | Referenced but not available in repo                                   | Wrong endpoint paths, auth flow, or response schema = adapter fails | Obtain official contract; confirm all endpoint paths, auth flow, response schemas |
| 12  | **Stage test credentials**                           | No test credentials available                                          | Cannot test MPT adapter against real Stage                          | Obtain test.markirovka.kz credentials for read-only testing                       |
| 13  | **businessPlaceId mapping**                          | HttpMptAdapter accepts businessPlaceId but mapping to Stage is unknown | Wrong businessPlaceId = orders rejected by Stage                    | Confirm businessPlaceId values for each product group                             |
| 14  | **MPT utilisation report schema**                    | submitUtilisation sends sntins[], but full schema unknown              | Wrong schema = utilisation reports rejected                         | Obtain MPT utilisation API schema                                                 |
| 15  | **MPT document body schema**                         | submitImport/submitWithdrawal sends base64(JSON), but schema unknown   | Wrong schema = documents rejected                                   | Obtain MPT document API schema                                                    |

## Medium missing inputs (affect implementation quality)

| #   | Item                             | Why it's missing                                                   | Impact if assumed                                             | Required action                                                                                        |
| --- | -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 16  | **Circuit breaker thresholds**   | No circuit breaker implemented yet                                 | Too aggressive = unavailable; too lenient = cascading failure | Define: failure count threshold (e.g., 5), half-open interval (e.g., 30s), success threshold (e.g., 3) |
| 17  | **Retry backoff parameters**     | HttpMptAdapter has basic retry; no exponential backoff with jitter | Thundering herd on retry                                      | Define: initial backoff (e.g., 100ms), max backoff (e.g., 5s), jitter factor (e.g., 0.5)               |
| 18  | **MinIO lifecycle rules**        | No lifecycle policy defined                                        | Stale data accumulation; no retention enforcement             | Define: retention period for code exports, audit logs, document payloads                               |
| 19  | **OpenBao audit logging policy** | No audit policy defined                                            | No trace of KMS operations                                    | Define: what KMS operations are audited, retention, access                                             |

## Informational (no implementation impact)

| #   | Item                              | Status                 | Note                                                            |
| --- | --------------------------------- | ---------------------- | --------------------------------------------------------------- |
| 20  | **D-01/D-02 tariff approval**     | Pending                | Billing tariff decision required before W1; no impact on W0-03  |
| 21  | **Backup/restore drill**          | W0 scope but not W0-03 | ROADMAP §10 requires this; separate from adapter implementation |
| 22  | **Correlation ID implementation** | W0-05 scope            | Not needed for W0-03 adapter work                               |
