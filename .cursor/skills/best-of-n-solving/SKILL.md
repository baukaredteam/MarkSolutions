---
name: best-of-n-solving
description: Solve a hard problem by trying multiple approaches in parallel using isolated git worktrees. Each attempt runs in its own branch, and the best solution is selected. Use for complex refactors, tricky bugs, or architectural decisions where multiple strategies could work.
---

# Best-of-N Problem Solving

Use for complex refactors, tricky bugs, or architectural decisions with multiple strategies.

1. Define 2–3 distinct approaches.
2. Launch parallel Task tools with `subagent_type: "best-of-n-runner"` in one message. Include file paths, problem, success criteria (tests).
3. Compare: tests, cleanliness, perf, maintainability. Prefer Ponytail (smallest correct).
4. Merge the winner; clean other worktrees.

Overkill for simple bugs — use one agent. Isolated runners cannot see each other.
