# Review Workflow

## Branch and PR Flow
1. Branch from `main`: `git checkout -b codex/<topic>`
2. Implement changes and run checks.
3. Push branch and open PR to `main`.
4. Require one approval and passing CI before merge.

## Using Codex as a Reviewer
Use a direct prompt in a fresh Codex thread against the PR branch:

`Review this branch for bugs, regressions, and missing tests. List findings first with file/line refs, highest severity first.`

Optional follow-up:

`Propose minimal patches for each finding, then re-review.`

## Parallel Agent Pattern
- Agent A: backend/API changes on `codex/api-<topic>`
- Agent B: mobile/UI changes on `codex/mobile-<topic>`
- Agent C: review/testing pass on `codex/review-<topic>`

Merge order:
1. Merge feature branches to `main` after review.
2. Run final review pass on `main`.
