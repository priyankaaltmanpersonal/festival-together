# Coachella Group Planner

Offline-first group coordination app for Coachella friend groups.

## Monorepo Layout
- `apps/mobile`: Expo React Native client (iOS + Android)
- `services/api`: FastAPI backend
- `services/parser-worker`: OCR and parse pipeline worker
- `packages/shared-types`: shared contracts and schemas
- `infra`: local infrastructure templates
- `docs`: product and implementation docs

## Current Status
- Product spec: `docs/v1-spec.md`
- Implementation plan: `docs/implementation-plan.md`
- Feature ideas/enhancements: `docs/feature-ideas.md`
- PR/review process: `docs/review-workflow.md`
- Security guardrails: `docs/security-guardrails.md`
- Milestone in progress: `M0 Foundation`

## Local Dev (Docker-First)
1. See available shortcuts:
   - `make help`
2. Create local env files (do not commit real values):
   - `cp infra/.env.example infra/.env`
   - `cp services/api/.env.example services/api/.env`
   - `cp apps/mobile/.env.example apps/mobile/.env`
3. Start API + local infra containers:
   - `make up`
4. Build Docker images (optional if you already ran `make up`):
   - `make build`
5. Run API tests in Docker:
   - `make tests`
6. Run mobile:
   - `make mobile`
7. Optional if you specifically need tunnel mode:
   - `make mobile-tunnel`

## GitHub Workflow
1. Create a feature branch:
   - `git checkout -b codex/<short-topic>`
2. Make changes and validate locally:
   - `cd services/api && uv run pytest -q`
3. Commit and push:
   - `git add -A && git commit -m "<summary>"`
   - `git push -u origin codex/<short-topic>`
4. Open a PR to `main` and request review.
5. Merge only after CI passes and at least one review is approved.

## Notes
- No paid services required during initial local development.
- Before using any paid vendor or plan upgrade, explicitly confirm with project owner.
- Current backend milestone uses SQLite for fast iteration; Postgres integration is planned next.
- Keep secrets in local `.env` files only. `.env*` is gitignored except `*.env.example`.
- `apps/mobile/.env` must only contain `EXPO_PUBLIC_*` values that are safe to expose in the client bundle.
