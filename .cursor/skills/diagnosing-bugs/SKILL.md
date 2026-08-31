---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow.
---

# Diagnosing Bugs

Skip phases only when explicitly justified. Read `CONTEXT.md` + ADRs for the area. **Redact secrets** (`<REDACTED>`). Never log full КМ.

## Phase 1: Tight red loop

Build one command that goes red on *this* bug: failing test → curl → CLI fixture → Playwright → replay. Tighten (fast, deterministic). No Phase 2 without a red-capable command you already ran.

## Phase 2: Reproduce + minimise

Confirm the user's symptom. Shrink repro one cut at a time.

## Phase 3: Hypothesise

3–5 ranked falsifiable hypotheses. Show the user, then test.

## Phase 4: Instrument

One variable at a time. Debugger > tagged `[DEBUG-…]` logs. Perf: measure first.

## Phase 5: Fix + regression

Failing test at the real seam, then fix, then re-run the original loop.

## Phase 6: Cleanup

Remove debug logs/prototypes. State the winning hypothesis.

Do not proceed to ИС МПТ mutating calls to "see if it works" on STAGE without human confirmation.
