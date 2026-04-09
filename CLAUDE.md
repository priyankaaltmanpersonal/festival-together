# Claude Code Instructions

## Test Coverage (Required)

Every feature addition or bug fix must include tests — both frontend and backend. Write tests in the same commit as the code. Never add tests retroactively.

### Frontend (Jest — `apps/mobile/src/__tests__/`)

- **Pure functions** — unit test in `utils.test.js`. Any new function added to `src/utils.js` must have tests before committing.
- **New screens or components** — create `__tests__/ComponentName.test.js` covering: default render, key state variants, and all user interactions that trigger state changes.
- **Component behavior** — test non-trivial rendering logic, state transitions, interactions. Add to the relevant existing test file or create a new one.
- **Bug fixes** — add a regression test that fails before the fix and passes after. Name it clearly.

Follow established patterns: `makeProps` factory functions, `fireEvent` for interactions, `rerender` for parent state propagation, `jest.mock` only for native modules.

### Backend (pytest — `services/api/tests/`)

- **New endpoints** — add tests in the relevant `test_*.py` file covering: success case, key error cases (403, 404, 400), and response shape.
- **New LLM parser functions** — add unit tests in `test_llm_parser.py` with a mocked Anthropic client. Test: success parsing, missing API key, malformed JSON, and filtering of invalid entries.
- **New response fields** — add assertions for the new fields in the relevant endpoint test.
- **Bug fixes** — add a regression test.

Follow established patterns: `setup_module()` with a temp SQLite file, `TestClient(app)`, `patch("app.api.*.parse_schedule_from_image")` for vision mocking, and `seed_canonical_sets()` from conftest for fixture data.

### End-to-End (Maestro — `apps/mobile/e2e/flows/`)

- **New screens** — add a `screen_name.yaml` flow covering the happy path: navigate to the screen, assert key UI elements are visible, interact with the primary action.
- **New navigable features** — add a flow for any new navigation path (e.g. founder tools, hide-unattended toggle) that a user exercises end-to-end.
- **Changed UI text** — if you rename or remove visible text that an existing flow asserts, update the affected `.yaml` files immediately (e.g. removing the "Time" grid label broke `group_schedule_day_nav.yaml`).
- Maestro flows are smoke tests, not unit tests — one happy-path flow per feature is enough. Document any pre-conditions (e.g. "group must have sets on 2 days") in a comment at the top of the file.

Run both test suites before every commit: `cd apps/mobile && npm test -- --passWithNoTests` and `cd services/api && python3 -m pytest`.

## Pre-Commit Cleanup (Required)

Before every commit, run a cleanup agent that performs the following steps in order:

1. **Update documentation** — update any existing docs (README, inline comments, etc.) to reflect recent changes.
2. **Remove stale files and references** — delete unused files, dead imports, and any references to removed code.
3. **Clean up unused imports** — remove all unused imports across changed and related files.
4. **Lint** — run the project linter and fix all auto-fixable issues; surface any remaining errors.
5. **Type check** — run the type checker and resolve all type errors before proceeding.
6. **Run tests** — `cd apps/mobile && npm test -- --passWithNoTests`. Do not commit if tests fail.

This cleanup must complete successfully before the commit is created. If any step fails, fix the underlying issue rather than bypassing the check.
