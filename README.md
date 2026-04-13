# Festival Together

Group schedule coordination app for festival friend groups. Members upload screenshots of their personal schedules; the app builds a shared view of who wants to see what.

Built for Coachella 2026 (April 17–19). Available on the App Store.

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
| Schedule parsing | Claude Sonnet 4.6 vision (direct image → structured JSON) |
| Hosting | Render |
| Distribution | App Store (iOS), Google Play internal (Android) |

## Local Development

### API

```bash
cd services/api
pip install -e .
cp .env.example .env   # fill in ANTHROPIC_API_KEY
uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`. It uses SQLite locally. Alembic migrations run automatically on startup.

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

**Note:** Use `npx expo install` (not `npm install`) when adding native packages — it pins to the version compatible with your Expo SDK. For example, `@react-native-async-storage/async-storage` must stay at v2.2.0; v3.x breaks Expo Go on SDK 54.

### Tests

```bash
cd services/api
pip install pytest pytest-mock
pytest tests/
```

All external API calls (Anthropic) are mocked in tests — no real credentials needed and no charges incurred.

## Adding a Database Migration

When you add or remove a column:

```bash
cd services/api
# create a new migration file based on the latest
cp alembic/versions/002_add_festival_days.py alembic/versions/003_your_change.py
# edit it, then test locally
python -m alembic upgrade head
```

Migrations run automatically on Render deploy via `alembic upgrade head` in the app lifespan.

## Deployment

The API deploys automatically to Render on every push to `main`.

Required environment variables on Render (all already configured):
- `DATABASE_URL` — Neon Postgres connection string
- `ANTHROPIC_API_KEY` — Claude for schedule parsing
- `APP_ENV=production`
- `PYTHON_VERSION=3.11.0`

## Building the Mobile App

Requires EAS CLI and an active Apple Developer / Google Play account.

```bash
cd apps/mobile
npm install -g eas-cli
eas login

# iOS TestFlight build
eas build --platform ios --profile production

# Android internal testing build
eas build --platform android --profile production
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
