# API Service

FastAPI backend for group, schedule, and parsing workflows.

## Quick Start
1. Copy `.env.example` to `.env`
   - Keep sensitive values only in `.env` (never committed)
2. Install deps (example): `uv sync`
3. Run: `uv run uvicorn app.main:app --reload --port 8000`
4. Run tests locally: `PYTHONPATH=. pytest -q`
5. Run tests in Docker: `docker-compose -f ../../infra/docker-compose.yml run --rm api_tests`

## Endpoints
- `GET /health`
- `GET /v1/meta/version`
- `POST /v1/groups`
- `PATCH /v1/groups/{group_id}` (founder only)
- `GET /v1/invites/{invite_code}/preview`
- `POST /v1/invites/{invite_code}/join`
- `POST /v1/members/me/leave`
- `DELETE /v1/groups/{group_id}` (founder only)
- `POST /v1/groups/{group_id}/canonical/import` (founder only)
- `GET /v1/groups/{group_id}/canonical/review`
- `POST /v1/groups/{group_id}/canonical/confirm` (founder only)
- `POST /v1/members/me/personal/import`
- `GET /v1/members/me/personal/review`
- `PATCH /v1/members/me/sets/{canonical_set_id}`
- `POST /v1/members/me/setup/complete`
- `GET /v1/members/me/home`
- `GET /v1/groups/{group_id}/schedule` (`must_see_only`, `member_ids` query filters)
- `GET /v1/groups/{group_id}/individual-schedules`

## Dev Notes
- Session-protected endpoints expect `x-session-token` header.
- Current milestone uses SQLite for local development and rapid iteration.
