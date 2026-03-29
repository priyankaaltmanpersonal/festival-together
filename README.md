# Festival Together

Group schedule coordination app for festival friend groups. Members upload screenshots of their personal schedules; the app builds a shared view of who wants to see what.

Built for Coachella 2026 (April 11–13), private beta with ~12 friends.

## Repo Layout

```
apps/mobile/        Expo React Native client (iOS + Android)
services/api/       FastAPI backend (Python)
docs/               Product spec, progress tracker, release runbook
infra/              Infrastructure config
```

## Stack

| Layer | Technology |
|---|---|
| Mobile | Expo SDK 54 / React Native |
| API | FastAPI + Python 3.11 |
| Database | Neon (Postgres) in production, SQLite locally |
| Migrations | Alembic |
| OCR | Google Cloud Vision API |
| Schedule parsing | Claude Haiku (LLM-based, format-agnostic) |
| Hosting | Render |
| Distribution | TestFlight (iOS), Google Play internal (Android) |

## Local Development

### API

```bash
cd services/api
pip install -e .
cp .env.example .env   # fill in GOOGLE_VISION_API_KEY and ANTHROPIC_API_KEY
uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`. It uses SQLite locally (`festival.db`). Alembic migrations run automatically on startup.

### Mobile

```bash
cd apps/mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on your phone. The app points to the Render API by default (`EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env`).

To point at your local API instead, change `apps/mobile/.env`:
```
EXPO_PUBLIC_API_BASE_URL=http://<your-mac-local-ip>:8000
```

### Tests

```bash
cd services/api
pip install pytest pytest-mock
pytest tests/
```

All external API calls (Google Vision, Anthropic) are mocked in tests — no real credentials needed and no charges incurred.

## Adding a Database Migration

When you add or remove a column:

```bash
cd services/api
# create a new migration file
cp alembic/versions/002_add_festival_days.py alembic/versions/003_your_change.py
# edit it, then test locally
python -m alembic upgrade head
```

Migrations run automatically on Render deploy via `alembic upgrade head` in the app lifespan.

## Deployment

The API deploys automatically to Render on every push to `main`.

Required environment variables on Render (all already configured):
- `DATABASE_URL` — Neon Postgres connection string
- `GOOGLE_VISION_API_KEY` — Google Cloud Vision
- `ANTHROPIC_API_KEY` — Claude Haiku for schedule parsing
- `APP_ENV=production`
- `PYTHON_VERSION=3.11.0`

## Building the Mobile App

Requires EAS CLI and an active Apple Developer / Google Play account.

```bash
cd apps/mobile
npm install -g eas-cli
eas login

# iOS TestFlight build
eas build --platform ios --profile preview

# Android internal testing build
eas build --platform android --profile preview
```

See `docs/release-runbook.md` for the full distribution checklist.

## Secrets

- Keep secrets in local `.env` files only — never commit them
- `.env` and `.env.*` are gitignored (except `*.env.example`)
- `apps/mobile/.env` may only contain `EXPO_PUBLIC_*` values (they are bundled into the client)
- Production secrets are set directly in the Render dashboard

## Docs

- `docs/progress.md` — what's done and what's pending
- `docs/v1-spec.md` — product spec
- `docs/release-runbook.md` — step-by-step distribution guide
- `docs/feature-ideas.md` — future ideas
