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
- Milestone in progress: `M0 Foundation`

## Local Dev (Planned)
1. Start API + local infra containers:
   - `docker compose -f infra/docker-compose.yml up --build`
2. Or run API directly (without Docker):
   - `cd services/api && uv run uvicorn app.main:app --reload --port 8000`
3. Run mobile:
   - `cd apps/mobile && npm run start`

## Notes
- No paid services required during initial local development.
- Before using any paid vendor or plan upgrade, explicitly confirm with project owner.
- Current backend milestone uses SQLite for fast iteration; Postgres integration is planned next.
