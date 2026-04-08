# Claude Code Instructions

## Test Coverage (Required)

Every feature addition or bug fix must include tests. Follow these rules:

- **Pure functions** — always unit test in `apps/mobile/src/__tests__/utils.test.js`. If a new utility function is added to `src/utils.js`, add tests for it before committing.
- **Component behavior** — test any non-trivial rendering logic, state transitions, or user interactions. Add to the relevant file in `apps/mobile/src/__tests__/` (e.g. `DayTabReview.test.js`, `EditableSetCard.test.js`, `GroupScheduleScreen.test.js`) or create a new test file for new components.
- **Bug fixes** — always add a regression test that fails before the fix and passes after. Name it clearly so the bug is self-documenting.
- **New screens or components** — create a corresponding `__tests__/ComponentName.test.js` file covering: default render, key state variants, and any user interactions that trigger state changes.

Tests live in `apps/mobile/src/__tests__/`. Follow the patterns already established there: `makeProps` factory functions, `fireEvent` for interactions, `rerender` for parent state propagation, and `jest.mock` only for native modules.

## Pre-Commit Cleanup (Required)

Before every commit, run a cleanup agent that performs the following steps in order:

1. **Update documentation** — update any existing docs (README, inline comments, etc.) to reflect recent changes.
2. **Remove stale files and references** — delete unused files, dead imports, and any references to removed code.
3. **Clean up unused imports** — remove all unused imports across changed and related files.
4. **Lint** — run the project linter and fix all auto-fixable issues; surface any remaining errors.
5. **Type check** — run the type checker and resolve all type errors before proceeding.
6. **Run tests** — `cd apps/mobile && npm test -- --passWithNoTests`. Do not commit if tests fail.

This cleanup must complete successfully before the commit is created. If any step fails, fix the underlying issue rather than bypassing the check.
