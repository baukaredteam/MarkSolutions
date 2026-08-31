---
name: creating-pr
description: Create a clean, review-ready pull request with a good title, structured description, linked issues, and appropriate reviewers.
---

# Creating a PR

Only when the user asks. Do not push unless asked.

1. `git fetch`; inspect `git log origin/<base>..HEAD` and diff.
2. Title: `type: summary` (`feat|fix|refactor|docs|test|chore|perf`).
3. Body:

```markdown
## Summary
1-3 sentences. Closes #N

## Changes
- …

## Test Plan
- [ ] …
```

4. Self-review: no secrets, no full КМ, tests/lint/typecheck.
5. `git push -u origin HEAD` then `gh pr create` (user must request push).
