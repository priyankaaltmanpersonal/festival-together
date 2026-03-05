# Security Guardrails

Use this checklist for new features, refactors, and PR reviews.

## Secrets and Configuration
- Secrets are stored only in local/runtime env vars, never in source control.
- `.env.example` files contain placeholders only, not real credentials.
- Client-exposed env vars (`EXPO_PUBLIC_*`) contain no sensitive values.

## Access Control and Data Protection
- Endpoints enforce authentication and role/ownership checks.
- Unauthorized/invalid requests return safe errors without leaking internals.
- Data collection and storage are minimized to what the feature requires.

## Input and Processing Safety
- External input is validated at API boundaries.
- File/parse flows handle malformed input safely and defensively.
- Dangerous operations are scoped and constrained by explicit checks.

## Logging and Observability
- Logs exclude secrets, tokens, and sensitive personal data.
- Debug output is sanitized before commit/release.

## Dependency and Supply Chain Hygiene
- New dependencies are justified and kept minimal.
- Use maintained versions and avoid unnecessary privileged tooling.

## Release and Review Gates
- Security-impacting changes include tests for auth/permissions/validation paths.
- PR description includes a short “security impact” note and residual risks.
