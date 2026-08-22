// W0-03a part 2 (ADR-027) — LocalAdapterBootstrap contract (PowerShell-only
// local stack). Static policy enforced by tests; no Docker compose, no fixed
// credentials, no root-token persistence, no hidden errors (`|| true`).

export interface LocalAdapterBootstrapPolicy {
  /** Every bootstrap step must be checked; `|| true` is forbidden. */
  forbidSilentErrors: true;
  /** Images must be pinned by digest — `latest` is forbidden. */
  forbidLatestTag: true;
  /** Services bind loopback only — `0.0.0.0` is forbidden. */
  loopbackOnly: true;
  /** No default/committed service credentials in tracked files. */
  forbidCommittedCredentials: true;
  /** Root token exists only in the bootstrap process memory. */
  rootTokenMemoryOnly: true;
}

export const LOCAL_BOOTSTRAP_FILES = ["scripts/local-stack.ps1"] as const;

/** Patterns that must never appear in tracked local-stack artifacts. */
export const FORBIDDEN_BOOTSTRAP_PATTERNS: Array<[RegExp, string]> = [
  [/:\s*latest\b/, "mutable image tag `latest`"],
  [/-p\s+0\.0\.0\.0|-publish\s+0\.0\.0\.0|0\.0\.0\.0:/, "non-loopback binding"],
  [/\|\|\s*true/, "silently swallowed bootstrap error"],
];
