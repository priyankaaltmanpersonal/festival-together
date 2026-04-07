# Claude Code Instructions

## Pre-Commit Cleanup (Required)

Before every commit, run a cleanup agent that performs the following steps in order:

1. **Update documentation** — update any existing docs (README, inline comments, etc.) to reflect recent changes.
2. **Remove stale files and references** — delete unused files, dead imports, and any references to removed code.
3. **Clean up unused imports** — remove all unused imports across changed and related files.
4. **Lint** — run the project linter and fix all auto-fixable issues; surface any remaining errors.
5. **Type check** — run the type checker and resolve all type errors before proceeding.
6. **Run tests** — `cd apps/mobile && npm test -- --passWithNoTests`. Do not commit if tests fail.

This cleanup must complete successfully before the commit is created. If any step fails, fix the underlying issue rather than bypassing the check.
